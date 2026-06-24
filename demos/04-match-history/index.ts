// Demo 4 — Match history / activity feed (WIDE-COLUMN: ScyllaDB vs PostgreSQL)
// Mỗi trận PvP sinh 1 event, append-only. Cần "50 trận gần nhất của player X" realtime + ghi cực nhiều.
// ScyllaDB = CQL/Cassandra-compatible, C++ shard-per-core (đúng cái Discord dừng lại — xem Hook).
//
// Live talk — từng phần:
//   npm run demo:4:seed      # ghi N event vào cả 2 (đo write throughput)
//   npm run demo:4:read      # "last 50 của player X" — partition read
//   npm run demo:4:contract  # query-first contract: ad-hoc / JOIN Scylla không làm được
//   npm run demo:4           # cả ba
//
// Trung thực: chạy 1 NODE. Throughput 1 node của Scylla mạnh (shard-per-core) nhưng
// thế mạnh THẬT là scale-out tuyến tính nhiều node + HA — KHÔNG demo được trên 1 container.
// developer-mode bật cho laptop → số minh hoạ, không phải production.
import type { Pool } from "pg";
import type { Client } from "cassandra-driver";
import { makePool } from "../../src/db/pg";
import { makeScylla } from "../../src/db/scylla";
import { env } from "../../src/lib/env";
import { printTable, dim, title, ok, bad, acc } from "../../src/lib/table";
import { timed, ms } from "../../src/lib/timer";

const N = 200_000; // số match event
const PLAYERS = 2_000; // ~100 trận/player → đủ cho "last 50"
const WRITE_CONCURRENCY = 64;
const READS = 500;
const SPAN_MS = 7 * 24 * 3600 * 1000; // event trải trên 7 ngày
const BASE = Date.now();
const RESULTS = ["win", "lose"];
const rnd = (n: number) => Math.floor(Math.random() * n);
const eventTime = (i: number) => new Date(BASE - SPAN_MS + Math.floor((i / N) * SPAN_MS)); // i lớn = mới
const thrZ = (n: number, msTotal: number) => `${(n / (msTotal / 1000) / 1000).toFixed(0)}k/s`;

async function runConcurrent(total: number, concurrency: number, fn: (i: number) => Promise<unknown>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= total) break;
      await fn(i);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function avgReadMs(reads: number, fn: (i: number) => Promise<unknown>): Promise<number> {
  const { ms: total } = await timed(async () => {
    for (let i = 0; i < reads; i++) await fn(i);
  });
  return total / reads;
}

// ── SEED + write throughput ──
async function seedPg(pool: Pool): Promise<number> {
  await pool.query(`DROP TABLE IF EXISTS matches`);
  await pool.query(`CREATE TABLE matches (player_id int, match_time timestamptz, match_id int, opponent int, result text, score_delta int)`);
  await pool.query(`CREATE INDEX matches_player_time_idx ON matches (player_id, match_time DESC)`); // index có sẵn lúc ghi (production-like)
  const text = `INSERT INTO matches (player_id, match_time, match_id, opponent, result, score_delta) VALUES ($1,$2,$3,$4,$5,$6)`;
  const { ms: t } = await timed(() =>
    runConcurrent(N, WRITE_CONCURRENCY, (i) =>
      pool.query({ name: "ins_match", text, values: [1 + rnd(PLAYERS), eventTime(i), i, 1 + rnd(PLAYERS), RESULTS[rnd(2)], rnd(200) - 100] }),
    ),
  );
  return t;
}

async function seedScylla(client: Client): Promise<number> {
  await client.execute(`DROP TABLE IF EXISTS matches_by_player`);
  await client.execute(
    `CREATE TABLE matches_by_player (player_id int, match_time timestamp, match_id int, opponent int, result text, score_delta int,
     PRIMARY KEY ((player_id), match_time, match_id)) WITH CLUSTERING ORDER BY (match_time DESC, match_id DESC)`,
  );
  const insert = `INSERT INTO matches_by_player (player_id, match_time, match_id, opponent, result, score_delta) VALUES (?,?,?,?,?,?)`;
  const { ms: t } = await timed(() =>
    runConcurrent(N, WRITE_CONCURRENCY, (i) =>
      client.execute(insert, [1 + rnd(PLAYERS), eventTime(i), i, 1 + rnd(PLAYERS), RESULTS[rnd(2)], rnd(200) - 100], { prepare: true }),
    ),
  );
  return t;
}

// ── READ · "last 50 của player X" ──
async function readPg(pool: Pool): Promise<number> {
  const text = `SELECT match_id, match_time, opponent, result FROM matches WHERE player_id=$1 ORDER BY match_time DESC LIMIT 50`;
  return avgReadMs(READS, () => pool.query({ name: "read_last50", text, values: [1 + rnd(PLAYERS)] }));
}
async function readScylla(client: Client): Promise<number> {
  const cql = `SELECT match_id, match_time, opponent, result FROM matches_by_player WHERE player_id=? LIMIT 50`;
  return avgReadMs(READS, () => client.execute(cql, [1 + rnd(PLAYERS)], { prepare: true }));
}

// ── CONTRACT · query-first: ad-hoc theo cột không phải partition key ──
async function contract(pool: Pool, client: Client): Promise<void> {
  const target = 1 + rnd(PLAYERS);
  console.log(dim(`\n── Contract · query ad-hoc: "mọi trận gặp opponent #${target}" (opponent KHÔNG phải partition key) ──`));

  // ScyllaDB — query theo cột thường → TỪ CHỐI nếu không ALLOW FILTERING
  let refused = "(không lỗi?!)";
  try {
    await client.execute(`SELECT player_id, match_id FROM matches_by_player WHERE opponent=? LIMIT 100`, [target], { prepare: true });
  } catch (e) {
    refused = (e as Error).message.replace(/\s+/g, " ").slice(0, 100);
  }
  const { ms: scyllaScan } = await timed(() =>
    client.execute(`SELECT player_id, match_id FROM matches_by_player WHERE opponent=? LIMIT 100 ALLOW FILTERING`, [target], { prepare: true }),
  );

  // PostgreSQL — chưa index opponent → seq scan; thêm index là xong
  const { ms: pgNoIdx } = await timed(() => pool.query(`SELECT player_id, match_id FROM matches WHERE opponent=$1 LIMIT 100`, [target]));
  await pool.query(`CREATE INDEX IF NOT EXISTS matches_opp_idx ON matches (opponent)`);
  const { ms: pgIdx } = await timed(() => pool.query(`SELECT player_id, match_id FROM matches WHERE opponent=$1 LIMIT 100`, [target]));
  await pool.query(`DROP INDEX IF EXISTS matches_opp_idx`); // dọn để re-run

  console.log(`  ${acc("ScyllaDB")}:`);
  console.log(`    • không ALLOW FILTERING → ${bad("TỪ CHỐI")}: ${dim(refused)}`);
  console.log(`    • + ALLOW FILTERING     → ${bad(ms(scyllaScan))} full cluster scan (đắt, production không nên)`);
  console.log(`    • cách "đúng" của wide-column: tạo BẢNG MỚI matches_by_opponent (ghi event 2 lần)`);
  console.log(`  ${acc("PostgreSQL")}:`);
  console.log(`    • chưa index opponent       → ${bad(ms(pgNoIdx))} (seq scan)`);
  console.log(`    • CREATE INDEX (opponent)   → ${ok(ms(pgIdx))} (thêm 1 index là xong — linh hoạt)`);
  console.log(dim(`\n  → Wide-column đổi FLEXIBILITY (no JOIN, no ad-hoc) lấy write throughput + scale-out tuyến tính.`));
}

async function assertSeeded(client: Client): Promise<boolean> {
  try {
    const r = await client.execute(`SELECT count(*) AS n FROM matches_by_player LIMIT 1`);
    if (Number(r.rows[0]?.n ?? 0) > 0) return true;
  } catch {
    /* keyspace/table chưa có */
  }
  console.log(bad("  Chưa seed — chạy `npm run demo:4:seed` trước."));
  return false;
}

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? "all").toLowerCase();
  const pool = makePool(WRITE_CONCURRENCY);

  // tạo keyspace (lần đầu) rồi connect có keyspace
  const admin = makeScylla();
  await admin.connect();
  await admin.execute(
    `CREATE KEYSPACE IF NOT EXISTS ${env.scyllaKeyspace} WITH replication = {'class':'SimpleStrategy','replication_factor':1}`,
  );
  await admin.shutdown();
  const scylla = makeScylla(env.scyllaKeyspace);
  await scylla.connect();

  try {
    title(`DEMO 5 — Match history (wide-column) · ${(N / 1000).toFixed(0)}K event · ${PLAYERS} player`);

    if (mode === "seed" || mode === "all") {
      console.log(dim(`  Ghi ${(N / 1000).toFixed(0)}K event · concurrency=${WRITE_CONCURRENCY} (per-event insert, đã prepare)`));
      const pgMs = await seedPg(pool);
      const zMs = await seedScylla(scylla);
      console.log(dim("\n── Write throughput (append-only, 1 node) ──"));
      printTable(
        ["OPERATION", "POSTGRESQL", "SCYLLADB"],
        [[`Write ${(N / 1000).toFixed(0)}K event`, `${ms(pgMs)} · ${thrZ(N, pgMs)}`, `${ms(zMs)} · ${thrZ(N, zMs)}`]],
      );
      console.log(dim(`  Lưu ý: 1 node + developer-mode → số minh hoạ. Thế mạnh thật của Scylla là scale-out nhiều node (xem Discord ở Hook).`));
    }

    if (mode === "read" || mode === "all") {
      if (!(await assertSeeded(scylla))) return;
      const pgR = await readPg(pool);
      const zR = await readScylla(scylla);
      console.log(dim("\n── Partition read · 'last 50 của player X' ──"));
      printTable(["READ", "POSTGRESQL", "SCYLLADB"], [["last-50 partition read", ms(pgR), ms(zR)]]);
      console.log(dim(`  Cả hai nhanh (PG index · Scylla clustering). Đừng oversell read — điểm khác biệt nằm ở write + contract.`));
    }

    if (mode === "contract" || mode === "all") {
      if (!(await assertSeeded(scylla))) return;
      await contract(pool, scylla);
    }

    console.log(dim(`\n  SQL/CQL chạy tay (DataGrip): demos/04-match-history/queries.cql`));
  } finally {
    await pool.end();
    await scylla.shutdown();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
