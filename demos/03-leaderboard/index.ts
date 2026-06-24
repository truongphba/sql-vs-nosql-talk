// Demo 3 — Leaderboard realtime
// Mỗi trận = INSERT battle (truth) + cập nhật rank. So sánh công bằng 2 approach:
//   1. PG INSERT battle + PG UPSERT leaderboard + đọc top-N từ PG (mọi thứ đè lên OLTP)
//   2. PG INSERT battle + Redis ZINCRBY + đọc top-N từ Redis (tách read model khỏi truth)
import type { Pool } from "pg";
import type Redis from "ioredis";
import { makePool } from "../../src/db/pg";
import { makeRedis } from "../../src/db/redis";
import { printTable, dim, title, acc } from "../../src/lib/table";
import { timed, ms } from "../../src/lib/timer";
import { runPool, runPoolWithSpinner, startSpinner, withSpinner } from "../../src/lib/progress";

const PLAYERS = 500;
const UPDATES = 60_000;
const QUERIES = 300;
const CONC = 50;
const SPIKE_READERS = 40;
const POOL_MAX = 40;
const rnd = (n: number) => Math.floor(Math.random() * n);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function readUnderSpike(
  flood: Promise<void>,
  read: () => Promise<unknown>,
  label: string,
  readConc = SPIKE_READERS,
): Promise<number> {
  const sp = startSpinner(label);
  let running = true;
  let reads = 0;
  void flood.finally(() => {
    running = false;
  });
  const lat: number[] = [];
  const reader = async () => {
    while (running) {
      const t0 = performance.now();
      await read();
      lat.push(performance.now() - t0);
      reads++;
      if (reads % 200 === 0) sp.update(`${reads.toLocaleString()} reads`);
    }
  };
  try {
    await Promise.all([flood, ...Array.from({ length: readConc }, () => reader())]);
    const result = avg(lat);
    sp.stop(`${reads.toLocaleString()} reads · avg ${ms(result)}`);
    return result;
  } catch (e) {
    sp.fail(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

type Row = { throughput: number; idle: number; spike: number };

function pickPlayerScore(): { playerId: number; delta: number } {
  return { playerId: 1 + rnd(PLAYERS), delta: 1 + rnd(100) };
}

async function setupBattleTable(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS battle_results`);
  await pool.query(
    `CREATE TABLE battle_results (
      id bigserial PRIMARY KEY,
      player_id int NOT NULL,
      score_delta int NOT NULL,
      played_at timestamptz NOT NULL DEFAULT now()
    )`,
  );
}

async function setupLeaderboardTable(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS leaderboard`);
  await pool.query(`CREATE TABLE leaderboard (player_id int PRIMARY KEY, score bigint NOT NULL DEFAULT 0)`);
  await pool.query(`CREATE INDEX ON leaderboard (score DESC)`);
}

async function insertBattle(pool: Pool, playerId: number, delta: number): Promise<void> {
  await pool.query(`INSERT INTO battle_results (player_id, score_delta) VALUES ($1, $2)`, [playerId, delta]);
}

async function upsertLeaderboard(pool: Pool, playerId: number, delta: number): Promise<void> {
  await pool.query(
    `INSERT INTO leaderboard (player_id, score) VALUES ($1,$2)
     ON CONFLICT (player_id) DO UPDATE SET score = leaderboard.score + EXCLUDED.score`,
    [playerId, delta],
  );
}

async function pgBattleAndLeaderboard(pool: Pool, tag: string): Promise<Row> {
  await withSpinner(`${tag} · setup tables`, async () => {
    await setupBattleTable(pool);
    await setupLeaderboardTable(pool);
  });

  const onMatchEnd = async () => {
    const { playerId, delta } = pickPlayerScore();
    await insertBattle(pool, playerId, delta);
    await upsertLeaderboard(pool, playerId, delta);
  };
  const topN = () => pool.query(`SELECT player_id, score FROM leaderboard ORDER BY score DESC LIMIT 10`);

  const { ms: throughput } = await timed(() =>
    runPoolWithSpinner(UPDATES, CONC, onMatchEnd, `${tag} · ${(UPDATES / 1000).toFixed(0)}K trận`),
  );

  const idleLat = await withSpinner(`${tag} · idle top-10 (${QUERIES}×)`, async () => {
    const samples: number[] = [];
    for (let q = 0; q < QUERIES; q++) {
      const t0 = performance.now();
      await topN();
      samples.push(performance.now() - t0);
    }
    return samples;
  }, (s) => `avg ${ms(avg(s))}`);

  const spike = await readUnderSpike(
    runPool(UPDATES, CONC, onMatchEnd),
    topN,
    `${tag} · spike · ${SPIKE_READERS} readers`,
  );
  return { throughput, idle: avg(idleLat), spike };
}

async function pgBattleRedisLeaderboard(pool: Pool, write: Redis, reader: Redis, tag: string): Promise<Row> {
  await withSpinner(`${tag} · setup tables`, async () => {
    await setupBattleTable(pool);
    await write.del("lb");
  });

  const onMatchEnd = async () => {
    const { playerId, delta } = pickPlayerScore();
    await insertBattle(pool, playerId, delta);
    await write.zincrby("lb", delta, `p${playerId}`);
  };
  const topN = () => reader.zrevrange("lb", 0, 9, "WITHSCORES");

  const { ms: throughput } = await timed(() =>
    runPoolWithSpinner(UPDATES, CONC, onMatchEnd, `${tag} · ${(UPDATES / 1000).toFixed(0)}K trận`),
  );

  const idleLat = await withSpinner(`${tag} · idle top-10 (${QUERIES}×)`, async () => {
    const samples: number[] = [];
    for (let q = 0; q < QUERIES; q++) {
      const t0 = performance.now();
      await topN();
      samples.push(performance.now() - t0);
    }
    return samples;
  }, (s) => `avg ${ms(avg(s))}`);

  const spike = await readUnderSpike(
    runPool(UPDATES, CONC, onMatchEnd),
    topN,
    `${tag} · spike · ${SPIKE_READERS} readers`,
  );
  return { throughput, idle: avg(idleLat), spike };
}

async function main(): Promise<void> {
  const pool = makePool(POOL_MAX);
  const redisW = makeRedis();
  const redisR = makeRedis();
  try {
    title(
      `DEMO 3 — Leaderboard · ${UPDATES.toLocaleString()} trận · ${SPIKE_READERS} reader spike`,
    );
    console.log(dim("  Progress hiện trên stderr (spinner) — bảng kết quả in sau khi xong.\n"));

    const mono = await pgBattleAndLeaderboard(pool, "PG battle + UPSERT LB");
    console.log("");
    const split = await pgBattleRedisLeaderboard(pool, redisW, redisR, "PG battle + Redis LB");

    const s = (n: number) => `${(n / 1000).toFixed(2)}s`;
    printTable(
      ["METRIC", "PG BATTLE + UPSERT LB", "PG BATTLE + REDIS LB"],
      [
        [`${UPDATES / 1000}K trận (throughput)`, s(mono.throughput), s(split.throughput)],
        ["top-10 read · idle", ms(mono.idle), ms(split.idle)],
        [acc("top-10 read · UNDER write spike"), acc(ms(mono.spike)), acc(ms(split.spike))],
        ["Rank update path", "PostgreSQL", "Redis Sorted Set"],
        ["Display read path", "PostgreSQL", "Redis Sorted Set"],
      ],
    );
    console.log(
      dim(
        `\n* Spike: ${CONC} writer + ${SPIKE_READERS} client đồng thời refresh top-10.\n` +
          `* Cột trái: đọc PG trong lúc PG vừa battle INSERT vừa UPSERT leaderboard.\n` +
          `* Cột phải: đọc Redis — PG chỉ append battle, không phục vụ top-N display.\n`,
      ),
    );
  } finally {
    await pool.end();
    redisW.disconnect();
    redisR.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
