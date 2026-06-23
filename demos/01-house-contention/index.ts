// Demo 1 — House contention / race condition
// 100 user cùng hit 1 house trống. Chỉ 1 người được thắng.
// So sánh: Naive PostgreSQL · PostgreSQL FOR UPDATE · Redis SET NX
import type { Pool } from "pg";
import type Redis from "ioredis";
import { makePool } from "../../src/db/pg";
import { makeRedis } from "../../src/db/redis";
import { printTable, ok, bad, dim, title } from "../../src/lib/table";
import { ms } from "../../src/lib/timer";

const N = 100; // số request đồng thời

type Result = { winners: number; avgMs: number };
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function resetHouse(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS houses (
    id int PRIMARY KEY,
    occupant_id text,
    occupied_at timestamptz
  )`);
  await pool.query(`TRUNCATE houses`);
  await pool.query(`INSERT INTO houses (id, occupant_id) VALUES (1, NULL)`);
}

// ── Approach A: Naive — read rồi update, không lock ────────────────
// Giữa SELECT (thấy NULL) và UPDATE, nhiều request cùng pass check → oversubscribed.
async function naivePg(pool: Pool): Promise<Result> {
  await resetHouse(pool);
  const lat: number[] = [];
  let winners = 0;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      (async () => {
        const t0 = performance.now();
        const r = await pool.query<{ occupant_id: string | null }>(
          `SELECT occupant_id FROM houses WHERE id = 1`,
        );
        if (r.rows[0].occupant_id === null) {
          await pool.query(
            `UPDATE houses SET occupant_id = $1, occupied_at = now() WHERE id = 1`,
            [`user_${i}`],
          );
          winners++; // request này tưởng mình thắng
        }
        lat.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, avgMs: avg(lat) };
}

// ── Approach B: SELECT ... FOR UPDATE trong transaction ───────────
// Lock row trước khi đọc → tuần tự hóa → đúng 1 winner, nhưng xếp hàng sau lock.
async function pgForUpdate(pool: Pool): Promise<Result> {
  await resetHouse(pool);
  const lat: number[] = [];
  let winners = 0;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      (async () => {
        const t0 = performance.now();
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await c.query<{ occupant_id: string | null }>(
            `SELECT occupant_id FROM houses WHERE id = 1 FOR UPDATE`,
          );
          if (r.rows[0].occupant_id === null) {
            await c.query(
              `UPDATE houses SET occupant_id = $1, occupied_at = now() WHERE id = 1`,
              [`user_${i}`],
            );
            winners++;
          }
          await c.query("COMMIT");
        } finally {
          c.release();
        }
        lat.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, avgMs: avg(lat) };
}

// ── Approach C: Redis SET NX EX ───────────────────────────────────
// Atomic ở tầng Redis: set nếu chưa tồn tại, tự expire. Winner = ai nhận 'OK'.
async function redisSetNx(redis: Redis): Promise<Result> {
  await redis.del("house:1");
  const lat: number[] = [];
  let winners = 0;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      (async () => {
        const t0 = performance.now();
        const res = await redis.set("house:1", `user_${i}`, "EX", 1800, "NX");
        if (res === "OK") winners++;
        lat.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, avgMs: avg(lat) };
}

const verdict = (r: Result) =>
  r.winners === 1 ? ok("Correct") : bad(`FAIL — ${r.winners} winners`);

async function main(): Promise<void> {
  const pool = makePool(50);
  const redis = makeRedis();
  try {
    title(`DEMO 1 — House contention · ${N} request đồng thời vào 1 house trống`);
    const naive = await naivePg(pool);
    const forUpdate = await pgForUpdate(pool);
    const setnx = await redisSetNx(redis);

    printTable(
      ["APPROACH", "WINNERS", "LATENCY (avg)", "CORRECTNESS"],
      [
        ["Naive PostgreSQL", String(naive.winners), ms(naive.avgMs), verdict(naive)],
        ["PostgreSQL FOR UPDATE", String(forUpdate.winners), ms(forUpdate.avgMs), verdict(forUpdate)],
        ["Redis SET NX", String(setnx.winners), ms(setnx.avgMs), verdict(setnx)],
      ],
    );
    console.log(dim("\n* Số thay đổi theo máy — quan trọng là tính định tính: naive oversubscribed, FOR UPDATE đúng nhưng chậm, Redis đúng & nhanh nhất.\n"));
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
