// Demo 3 — Leaderboard realtime
// PvP ranking: điểm tăng mỗi trận, top N hiển thị realtime.
// So sánh: PostgreSQL (UPSERT + ORDER BY, có index score DESC) vs Redis Sorted Set.
//
// Lưu ý quan trọng: khi PG có index score DESC, top-10 query lúc rảnh CŨNG nhanh.
// Khác biệt thật lộ ra khi ĐỌC TRONG LÚC WRITE SPIKE — PG bị contention, Redis vẫn phẳng.
import type { Pool } from "pg";
import type Redis from "ioredis";
import { makePool } from "../../src/db/pg";
import { makeRedis } from "../../src/db/redis";
import { printTable, dim, title, acc } from "../../src/lib/table";
import { timed, ms } from "../../src/lib/timer";

const PLAYERS = 10_000;
const UPDATES = 100_000;
const QUERIES = 1_000;
const CONC = 50;
const rnd = (n: number) => Math.floor(Math.random() * n);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function runPool(total: number, conc: number, task: (i: number) => Promise<unknown>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < total) {
      const k = i++;
      await task(k);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
}

// đo latency của `read` lặp lại trong khi `flood` đang chạy nền
async function readUnderSpike(flood: Promise<void>, read: () => Promise<unknown>): Promise<number> {
  let running = true;
  void flood.then(() => {
    running = false;
  });
  const lat: number[] = [];
  while (running) {
    const t0 = performance.now();
    await read();
    lat.push(performance.now() - t0);
  }
  return avg(lat);
}

type Row = { throughput: number; idle: number; spike: number };

async function pgLeaderboard(pool: Pool): Promise<Row> {
  await pool.query(`DROP TABLE IF EXISTS leaderboard`);
  await pool.query(`CREATE TABLE leaderboard (player_id int PRIMARY KEY, score bigint NOT NULL DEFAULT 0)`);
  await pool.query(`CREATE INDEX ON leaderboard (score DESC)`);

  const upsert = () =>
    pool.query(
      `INSERT INTO leaderboard (player_id, score) VALUES ($1,$2)
       ON CONFLICT (player_id) DO UPDATE SET score = leaderboard.score + EXCLUDED.score`,
      [1 + rnd(PLAYERS), 1 + rnd(100)],
    );
  const topN = () => pool.query(`SELECT player_id, score FROM leaderboard ORDER BY score DESC LIMIT 10`);

  const { ms: throughput } = await timed(() => runPool(UPDATES, CONC, upsert));

  const idleLat: number[] = [];
  for (let q = 0; q < QUERIES; q++) {
    const t0 = performance.now();
    await topN();
    idleLat.push(performance.now() - t0);
  }

  const spike = await readUnderSpike(runPool(UPDATES, CONC, upsert), topN);
  return { throughput, idle: avg(idleLat), spike };
}

async function redisLeaderboard(write: Redis, reader: Redis): Promise<Row> {
  await write.del("lb");

  const zincr = () => write.zincrby("lb", 1 + rnd(100), `p${1 + rnd(PLAYERS)}`);
  const topN = () => reader.zrevrange("lb", 0, 9, "WITHSCORES");

  const { ms: throughput } = await timed(() => runPool(UPDATES, CONC, zincr));

  const idleLat: number[] = [];
  for (let q = 0; q < QUERIES; q++) {
    const t0 = performance.now();
    await topN();
    idleLat.push(performance.now() - t0);
  }

  const spike = await readUnderSpike(runPool(UPDATES, CONC, zincr), topN);
  return { throughput, idle: avg(idleLat), spike };
}

async function main(): Promise<void> {
  const pool = makePool(CONC + 5); // chừa connection cho reader lúc spike
  const redisW = makeRedis();
  const redisR = makeRedis();
  try {
    title(`DEMO 3 — Leaderboard · ${UPDATES.toLocaleString()} update + top-10 query`);
    const pg = await pgLeaderboard(pool);
    const rd = await redisLeaderboard(redisW, redisR);

    const s = (n: number) => `${(n / 1000).toFixed(2)}s`;
    printTable(
      ["METRIC", "POSTGRESQL", "REDIS SORTED SET"],
      [
        [`${UPDATES / 1000}K updates (throughput)`, s(pg.throughput), s(rd.throughput)],
        ["top-10 read · idle", ms(pg.idle), ms(rd.idle)],
        [acc("top-10 read · UNDER write spike"), acc(ms(pg.spike)), acc(ms(rd.spike))],
      ],
    );
    console.log(
      dim(
        `\n* Có index, top-10 lúc rảnh PG cũng nhanh. Khác biệt thật ở dòng cuối:\n` +
          `  dưới write spike, read latency PG tăng vọt còn Redis vẫn phẳng. Redis = read model; truth vẫn ở Postgres.\n`,
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
