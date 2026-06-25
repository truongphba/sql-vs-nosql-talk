// Demo 2 — Lock proof: chứng minh ALTER rewrite giữ ACCESS EXCLUSIVE và chặn reader.
// Chạy: npm run demo:2:lock
//
// Script tự seed bảng `lock_demo`, bắn reader song song, chạy 1 ALTER rewrite,
// và poll pg_locks để in ra snapshot lock queue có thật lúc ALTER đang giữ lock.
//
// Câu query quan sát (chạy tay trong psql lúc demo cũng được):
//   SELECT l.pid, a.state, l.mode, l.granted
//   FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
//   WHERE l.relation = 'lock_demo'::regclass
//   ORDER BY l.granted DESC, l.pid;

import { ensurePgDatabase, makePoolForDb, pgDbs } from "../../src/db/pg";
import { printTable, dim, title, ok, bad } from "../../src/lib/table";
import { timed } from "../../src/lib/timer";
import { withSpinner } from "../../src/lib/progress";

const ROWS = 300_000; // đủ lớn để rewrite kéo dài vài trăm ms — watcher kịp bắt snapshot
const READERS = 6;
const BLOCK_MS = 100;
const sleep = (m: number) => new Promise((r) => setTimeout(r, m));

type LockRow = { pid: number; state: string | null; mode: string; granted: boolean };

const LOCK_SQL = `
  SELECT l.pid, a.state, l.mode, l.granted
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.relation = 'lock_demo'::regclass
  ORDER BY l.granted DESC, l.pid`;

async function main(): Promise<void> {
  await ensurePgDatabase(pgDbs.norm);
  const setup = makePoolForDb(pgDbs.norm, 1);
  const watch = makePoolForDb(pgDbs.norm, 1);
  const reads = makePoolForDb(pgDbs.norm, READERS);
  const mig = makePoolForDb(pgDbs.norm, 1);
  try {
    title("DEMO 2 — Lock proof · ALTER rewrite giữ ACCESS EXCLUSIVE");

    await withSpinner(`Seed lock_demo · ${ROWS.toLocaleString()} rows`, async () => {
      await setup.query(`DROP TABLE IF EXISTS lock_demo`);
      await setup.query(`CREATE TABLE lock_demo (id int PRIMARY KEY, name text)`);
      await setup.query(`INSERT INTO lock_demo SELECT g, 'n' || g FROM generate_series(1, $1) g`, [ROWS]);
    });
    console.log(dim(`  Seeded lock_demo: ${ROWS.toLocaleString()} rows · ${READERS} reader song song\n`));

    let stop = false;
    let best: LockRow[] = [];
    const readerLat: number[] = [];

    // Watcher — poll pg_locks. Đọc system view nên KHÔNG bị ACCESS EXCLUSIVE chặn → bắt được snapshot.
    const watcher = (async () => {
      while (!stop) {
        const snap = (await watch.query(LOCK_SQL)).rows as LockRow[];
        const waiting = snap.filter((x) => !x.granted).length;
        const hasExcl = snap.some((x) => x.mode === "AccessExclusiveLock" && x.granted);
        if (hasExcl && waiting >= best.filter((x) => !x.granted).length) best = snap;
      }
    })();

    // Readers — point read; sẽ kẹt trong lock queue khi ALTER giữ ACCESS EXCLUSIVE.
    const readers = Array.from({ length: READERS }, () =>
      (async () => {
        while (!stop) {
          const id = 1 + Math.floor(Math.random() * ROWS);
          const { ms } = await timed(() => reads.query(`SELECT id, name FROM lock_demo WHERE id = $1`, [id]));
          readerLat.push(ms);
        }
      })(),
    );

    await sleep(20); // để reader đang chạy thật khi ALTER giành lock
    const { ms: migrateMs } = await timed(() =>
      mig.query(`ALTER TABLE lock_demo ADD COLUMN token text NOT NULL DEFAULT md5(random()::text)`),
    );
    stop = true;
    await Promise.all([watcher, ...readers]);

    console.log(dim("  pg_locks trên 'lock_demo' lúc ALTER đang chạy:"));
    if (best.length) {
      printTable(
        ["PID", "STATE", "LOCK MODE", "GRANTED"],
        best.map((x) => [
          String(x.pid),
          x.state ?? "",
          x.mode === "AccessExclusiveLock" ? bad(x.mode) : x.mode,
          x.granted ? ok("t") : bad("f  (waiting)"),
        ]),
      );
    } else {
      console.log(bad("  (không bắt được snapshot — thử tăng ROWS)"));
    }

    const blocked = readerLat.filter((x) => x > BLOCK_MS).length;
    console.log(
      dim(
        `\n  ALTER rewrite mất ${migrateMs.toFixed(0)}ms · reader đo ${readerLat.length} query, ` +
          `${blocked} cái chờ > ${BLOCK_MS}ms (kẹt sau AccessExclusiveLock).\n` +
          `  → 1 dòng AccessExclusiveLock granted=t (ALTER) + các dòng AccessShareLock granted=f (reader xếp hàng).`,
      ),
    );
  } finally {
    await Promise.all([setup.end(), watch.end(), reads.end(), mig.end()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
