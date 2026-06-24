// Demo 4 — Analytics: OLTP (PostgreSQL, row store) vs OLAP (ClickHouse, columnar server).
// Cùng ~5M battle_log rows, chạy aggregate scan giống nhau → so tốc độ engine.
// ClickHouse là server riêng → DataGrip nối native xem data tận tay (demos/04-analytics/queries.sql).
import type { Pool } from "pg";
import type { ClickHouseClient } from "@clickhouse/client";
import { makePool } from "../../src/db/pg";
import { makeClickhouse } from "../../src/db/clickhouse";
import { printTable, dim, title } from "../../src/lib/table";
import { timed } from "../../src/lib/timer";

const N = 5_000_000;
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`);

// 3 query aggregate. SQL gần giống nhau; chỉ Q1 khác cách tính win (PG boolean vs CH UInt8).
const QUERIES: { label: string; pg: string; ch: string }[] = [
  {
    label: "Hero win rate (90 ngày)",
    pg: `SELECT hero_id, avg(case when win then 1 else 0 end) AS wr, count(*) AS n
         FROM battle_logs WHERE day < 90 GROUP BY hero_id ORDER BY wr DESC LIMIT 20`,
    ch: `SELECT hero_id, avg(win) AS wr, count(*) AS n
         FROM battle_logs WHERE day < 90 GROUP BY hero_id ORDER BY wr DESC LIMIT 20`,
  },
  {
    label: "DAU theo ngày",
    pg: `SELECT day, count(DISTINCT player_id) AS dau FROM battle_logs GROUP BY day ORDER BY day`,
    ch: `SELECT day, count(DISTINCT player_id) AS dau FROM battle_logs GROUP BY day ORDER BY day`,
  },
  {
    label: "Battles theo region+giờ",
    pg: `SELECT region, hour, count(*) AS battles FROM battle_logs GROUP BY region, hour ORDER BY region, hour`,
    ch: `SELECT region, hour, count(*) AS battles FROM battle_logs GROUP BY region, hour ORDER BY region, hour`,
  },
];

async function seedPg(pool: Pool): Promise<number> {
  await pool.query(`DROP TABLE IF EXISTS battle_logs`);
  await pool.query(`CREATE TABLE battle_logs (
    hero_id int, player_id int, region text, win boolean, day int, hour int)`);
  const { ms } = await timed(async () => {
    await pool.query(
      `INSERT INTO battle_logs (hero_id, player_id, region, win, day, hour)
       SELECT (random()*9999)::int+1, (random()*299999)::int+1,
         (ARRAY['NA','EU','ASIA','SA'])[(random()*3)::int+1],
         random() < 0.5, (random()*179)::int, (random()*23)::int
       FROM generate_series(1, ${N})`,
    );
    await pool.query(`ANALYZE battle_logs`);
  });
  return ms;
}

async function seedClickhouse(ch: ClickHouseClient): Promise<number> {
  await ch.command({ query: `DROP TABLE IF EXISTS battle_logs` });
  await ch.command({
    query: `CREATE TABLE battle_logs (
      hero_id UInt32, player_id UInt32, region LowCardinality(String),
      win UInt8, day UInt16, hour UInt8
    ) ENGINE = MergeTree ORDER BY (day, hero_id)`,
  });
  const { ms } = await timed(async () => {
    await ch.command({
      query: `INSERT INTO battle_logs
        SELECT rand() % 10000 + 1            AS hero_id,
               rand() % 300000 + 1           AS player_id,
               (['NA','EU','ASIA','SA'])[rand() % 4 + 1] AS region,
               rand() % 2                    AS win,
               rand() % 180                  AS day,
               rand() % 24                   AS hour
        FROM numbers(${N})`,
    });
  });
  return ms;
}

async function chQuery(ch: ClickHouseClient, sql: string): Promise<void> {
  const rs = await ch.query({ query: sql, format: "JSONEachRow" });
  await rs.json(); // fetch hết rows cho công bằng với PG đọc rows
}

async function main(): Promise<void> {
  const pool = makePool(4);
  const ch = makeClickhouse();
  try {
    title(`DEMO 4 — Analytics · ${N.toLocaleString()} battle_log rows · OLTP vs OLAP`);

    const pgSeed = await seedPg(pool);
    const chSeed = await seedClickhouse(ch);
    console.log(dim(`  seed: Postgres ${fmt(pgSeed)} · ClickHouse ${fmt(chSeed)}`));

    const rows: string[][] = [];
    for (const q of QUERIES) {
      const { ms: pgMs } = await timed(() => pool.query(q.pg));
      const { ms: chMs } = await timed(() => chQuery(ch, q.ch));
      const speed = (pgMs / chMs).toFixed(0);
      rows.push([q.label, fmt(pgMs), fmt(chMs), `${speed}x`]);
    }

    printTable(["QUERY", "POSTGRESQL", "CLICKHOUSE", "SPEEDUP"], rows);
    console.log(
      dim(
        `\n* ClickHouse (columnar) thắng rõ ở aggregate scan. Điểm kiến trúc: tách analytics khỏi OLTP\n` +
          `  để query nặng không tranh CPU/IO với transaction người đang chơi.\n` +
          `  Xem data tận tay: DataGrip → ClickHouse (localhost:58123) · demos/04-analytics/queries.sql\n`,
      ),
    );
  } finally {
    await pool.end();
    await ch.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
