// Demo 4 — Analytics: OLTP (PostgreSQL, row store) vs OLAP (DuckDB, columnar)
// Cùng ~5M battle_log rows, chạy aggregate scan giống nhau → so tốc độ engine.
// Schema dùng day/hour dạng int để query SQL y hệt cho cả hai engine.
import type { Pool } from "pg";
import { makePool } from "../../src/db/pg";
import { makeDuck } from "../../src/db/duck";
import { printTable, dim, title } from "../../src/lib/table";
import { timed } from "../../src/lib/timer";

const N = 5_000_000;
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n.toFixed(0)}ms`);

// 3 query aggregate — SQL giống hệt cho PG và DuckDB
const QUERIES: { label: string; sql: string }[] = [
  {
    label: "Hero win rate (90 ngày)",
    sql: `SELECT hero_id, avg(case when win then 1 else 0 end) AS wr, count(*) AS n
          FROM battle_logs WHERE day < 90 GROUP BY hero_id ORDER BY wr DESC LIMIT 20`,
  },
  {
    label: "DAU theo ngày",
    sql: `SELECT day, count(DISTINCT player_id) AS dau FROM battle_logs GROUP BY day ORDER BY day`,
  },
  {
    label: "Battles theo region+giờ",
    sql: `SELECT region, hour, count(*) AS battles FROM battle_logs GROUP BY region, hour ORDER BY region, hour`,
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

async function seedDuck(duck: Awaited<ReturnType<typeof makeDuck>>): Promise<number> {
  const { ms } = await timed(async () => {
    await duck.run(
      `CREATE TABLE battle_logs AS
       SELECT (random()*9999)::int+1 AS hero_id, (random()*299999)::int+1 AS player_id,
         (['NA','EU','ASIA','SA'])[(random()*3)::int+1] AS region,
         random() < 0.5 AS win, (random()*179)::int AS day, (random()*23)::int AS hour
       FROM range(${N})`,
    );
  });
  return ms;
}

async function main(): Promise<void> {
  const pool = makePool(4);
  const duck = await makeDuck();
  try {
    title(`DEMO 4 — Analytics · ${N.toLocaleString()} battle_log rows · OLTP vs OLAP`);

    const pgSeed = await seedPg(pool);
    const duckSeed = await seedDuck(duck);
    console.log(dim(`  seed: Postgres ${fmt(pgSeed)} · DuckDB ${fmt(duckSeed)}`));

    const rows: string[][] = [];
    for (const q of QUERIES) {
      const { ms: pgMs } = await timed(() => pool.query(q.sql));
      const { ms: duckMs } = await timed(() => duck.runAndReadAll(q.sql));
      const speed = (pgMs / duckMs).toFixed(0);
      rows.push([q.label, fmt(pgMs), fmt(duckMs), `${speed}x`]);
    }

    printTable(["QUERY", "POSTGRESQL", "DUCKDB", "SPEEDUP"], rows);
    console.log(
      dim(
        `\n* DuckDB (columnar) thắng rõ ở aggregate scan. Điểm kiến trúc: tách analytics khỏi OLTP\n` +
          `  để query nặng không tranh CPU/IO với transaction người đang chơi.\n`,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
