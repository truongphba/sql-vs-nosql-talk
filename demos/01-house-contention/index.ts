// Demo 1 — House contention / race condition
// 100 user cùng hit 1 house trống. Chỉ 1 người được thắng.
// So sánh: Naive PostgreSQL · PostgreSQL FOR UPDATE · Redis SET NX
//
// Live talk — chạy từng case:
//   npm run demo:1:naive · demo:1:for-update · demo:1:redis
// Rehearsal: npm run demo:1:all
import type { Pool } from "pg";
import type Redis from "ioredis";
import { makePool } from "../../src/db/pg";
import { makeRedis } from "../../src/db/redis";
import { printTable, ok, bad, dim, title, acc } from "../../src/lib/table";
import { ms } from "../../src/lib/timer";

const N = 100; // số request đồng thời — khớp kịch bản

type Case = "naive" | "for-update" | "redis";
type Latency = { minMs: number; avgMs: number; p95Ms: number; maxMs: number };
type Result = { winners: number; lat: Latency; occupantId?: string | null };

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function latencyStats(xs: number[]): Latency {
  const sorted = [...xs].sort((a, b) => a - b);
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    minMs: sorted[0] ?? 0,
    avgMs: avg(xs),
    p95Ms: sorted[p95Idx] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

const CASES: Record<Case, { label: string; blurb: string; next?: string }> = {
  naive: {
    label: "Naive PostgreSQL",
    blurb: "SELECT thấy NULL → UPDATE — không lock giữa read/write",
    next: "npm run demo:1:for-update",
  },
  "for-update": {
    label: "PostgreSQL FOR UPDATE",
    blurb: "Transaction + row lock — đúng 1 winner, request còn lại xếp hàng",
    next: "npm run demo:1:redis",
  },
  redis: {
    label: "Redis SET NX EX",
    blurb: "Atomic SET NX — không queue, không transaction overhead",
  },
};

async function resetHouse(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS houses (
    id int PRIMARY KEY,
    occupant_id text,
    occupied_at timestamptz
  )`);
  await pool.query(`TRUNCATE houses`);
  await pool.query(`INSERT INTO houses (id, occupant_id) VALUES (1, NULL)`);
}

async function readOccupant(pool: Pool): Promise<string | null> {
  const r = await pool.query<{ occupant_id: string | null }>(
    `SELECT occupant_id FROM houses WHERE id = 1`,
  );
  return r.rows[0]?.occupant_id ?? null;
}

async function naivePg(pool: Pool): Promise<Result> {
  await resetHouse(pool);
  const samples: number[] = [];
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
          winners++;
        }
        samples.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, lat: latencyStats(samples), occupantId: await readOccupant(pool) };
}

async function pgForUpdate(pool: Pool): Promise<Result> {
  await resetHouse(pool);
  const samples: number[] = [];
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
        samples.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, lat: latencyStats(samples) };
}

async function redisSetNx(redis: Redis): Promise<Result> {
  await redis.del("house:1");
  const samples: number[] = [];
  let winners = 0;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      (async () => {
        const t0 = performance.now();
        const res = await redis.set("house:1", `user_${i}`, "EX", 1800, "NX");
        if (res === "OK") winners++;
        samples.push(performance.now() - t0);
      })(),
    ),
  );
  return { winners, lat: latencyStats(samples) };
}

const verdict = (r: Result) =>
  r.winners === 1 ? ok("Correct — 1 winner") : bad(`FAIL — ${r.winners} winners`);

function winnersLine(r: Result): string {
  return r.winners === 1 ? ok(String(r.winners)) : bad(String(r.winners));
}

function latCols(l: Latency): [string, string, string, string] {
  return [ms(l.minMs), ms(l.avgMs), ms(l.p95Ms), ms(l.maxMs)];
}

function printCaseNotes(name: Case, result: Result): void {
  const { lat } = result;

  if (name === "naive" && result.winners > 1) {
    console.log(
      bad(
        `\n  → Race condition: ${result.winners}/${N} request cùng tưởng mình thắng ` +
          `(đọc NULL trước khi ai đó ghi xong).`,
      ),
    );
    if (result.occupantId) {
      console.log(
        dim(`  → DB truth: 1 occupant (${result.occupantId}) · app đếm: ${result.winners} winners`),
      );
    }
  }

  if (name === "for-update" && result.winners === 1) {
    const tail = lat.maxMs / Math.max(lat.avgMs, 0.01);
    console.log(
      acc(
        `\n  → Row lock queue: max ${ms(lat.maxMs)} vs avg ${ms(lat.avgMs)}` +
          (tail >= 2 ? ` (~${tail.toFixed(1)}×) — request cuối chờ ${N - 1} người trước.` : "."),
      ),
    );
  }

  if (name === "redis" && result.winners === 1) {
    const spread = lat.maxMs - lat.minMs;
    console.log(
      dim(
        `\n  → Không xếp hàng sau row lock: spread max−min = ${ms(spread)}` +
          (spread < lat.avgMs ? " (latency phẳng)." : "."),
      ),
    );
  }
}

async function runCase(
  name: Case,
  pool: Pool,
  redis: Redis,
): Promise<{ name: Case; result: Result }> {
  const meta = CASES[name];
  console.log(dim(`\n── ${meta.label} ──`));
  console.log(dim(`   ${meta.blurb}`));
  console.log(dim("   Latency: min / avg / p95 / max"));

  const result =
    name === "naive"
      ? await naivePg(pool)
      : name === "for-update"
        ? await pgForUpdate(pool)
        : await redisSetNx(redis);

  printTable(
    ["APPROACH", "WINNERS", "min", "avg", "p95", "max", "CORRECTNESS"],
    [[meta.label, winnersLine(result), ...latCols(result.lat), verdict(result)]],
  );

  printCaseNotes(name, result);

  if (meta.next) {
    console.log(dim(`\n  Tiếp theo: ${acc(meta.next)}`));
  } else {
    console.log(dim(`\n  So sánh đủ 3 case — hoặc chạy lại: npm run demo:1:all`));
  }

  return { name, result };
}

function printSummary(rows: { name: Case; result: Result }[]): void {
  console.log(dim("\n── Tổng hợp 3 approach ──"));
  console.log(dim("   Latency: min / avg / p95 / max"));
  printTable(
    ["APPROACH", "WINNERS", "min", "avg", "p95", "max", "CORRECTNESS"],
    rows.map(({ name, result }) => [
      CASES[name].label,
      winnersLine(result),
      ...latCols(result.lat),
      verdict(result),
    ]),
  );
  const fu = rows.find((r) => r.name === "for-update")?.result.lat;
  const rd = rows.find((r) => r.name === "redis")?.result.lat;
  if (fu && rd) {
    console.log(
      dim(
        `\n* FOR UPDATE max ${ms(fu.maxMs)} vs Redis max ${ms(rd.maxMs)} — ` +
          `đuôi dài = xếp hàng sau hot row lock.\n`,
      ),
    );
  }
}

function parseArg(): Case | "all" | "help" {
  const arg = (process.argv[2] ?? "help").toLowerCase();
  if (arg === "all") return "all";
  if (arg === "naive" || arg === "for-update" || arg === "redis") return arg;
  return "help";
}

function printUsage(): void {
  title(`DEMO 1 — House contention · ${N} request đồng thời`);
  console.log(
    dim(
      "  Chạy từng case (live talk):\n" +
        "    npm run demo:1:naive       — race condition (nhiều winners)\n" +
        "    npm run demo:1:for-update  — row lock + latency đuôi dài\n" +
        "    npm run demo:1:redis       — SET NX, latency phẳng\n" +
        "    npm run demo:1:all         — cả 3 + bảng tổng\n",
    ),
  );
}

async function main(): Promise<void> {
  const mode = parseArg();
  if (mode === "help") {
    printUsage();
    return;
  }

  const pool = makePool(50);
  const redis = makeRedis();
  try {
    title(`DEMO 1 — House contention · ${N} request đồng thời vào 1 house trống`);

    if (mode === "all") {
      const rows: { name: Case; result: Result }[] = [];
      for (const name of ["naive", "for-update", "redis"] as const) {
        rows.push(await runCase(name, pool, redis));
      }
      printSummary(rows);
      return;
    }

    await runCase(mode, pool, redis);
  } finally {
    await pool.end();
    redis.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
