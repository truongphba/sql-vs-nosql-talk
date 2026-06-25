// Demo 2 · LAYER 2 — schema evolution: (A) field mới trên data cũ · (B) migration dưới tải OLTP.
// Giả định đã chạy `npm run demo:2:seed`.
//   npm run demo:2:layer2
import { makePoolForDb, pgDbs } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title, ok, bad } from "../../src/lib/table";
import { withSpinner } from "../../src/lib/progress";
import { assertSeededPg, migrateNorm, migrateJsonb, migrateMongo, type MigrateRow, type UnderLoad, LOADERS, s, ms } from "./lib";

async function main(): Promise<void> {
  const poolNorm = makePoolForDb(pgDbs.norm, 10);
  const poolJsonb = makePoolForDb(pgDbs.jsonb, 10);
  const { client, db } = await makeMongo();
  try {
    title("DEMO 2 · LAYER 2 — Schema evolution (thêm field `trait`)");
    if (!(await assertSeededPg(poolNorm, "norm")) || !(await assertSeededPg(poolJsonb, "jsonb"))) return;

    const norm = await withSpinner("PostgreSQL normalized migration (under load)", () => migrateNorm(poolNorm));
    const jsonb = await withSpinner("PostgreSQL JSONB migration (under load)", () => migrateJsonb(poolJsonb));
    const mongo = await withSpinner("MongoDB migration (under load)", () => migrateMongo(db));

    console.log("  Part A — đọc field `trait` trên data CŨ (chưa migrate):");
    const partA = (m: MigrateRow) =>
      m.fieldAbsent === "error"
        ? bad(`ERROR: column "trait" does not exist`) + dim("  → buộc ALTER")
        : ok("null") + dim("  → lazy read OK, không cần migrate");
    console.log(`    PG normalized : ${partA(norm)}`);
    console.log(`    PG JSONB      : ${partA(jsonb)}`);
    console.log(`    MongoDB       : ${partA(mongo)}`);

    console.log(dim(`\n  Part B — chạy migration trong khi ${LOADERS} luồng OLTP đọc heroes:`));
    const u = (x: UnderLoad) => [s(x.migrateMs), ms(x.maxMs), ms(x.avgMs), x.blocked > 0 ? bad(`YES (${x.blocked}/${x.samples})`) : ok("no")];
    printTable(
      ["MIGRATION (under load)", "MIGRATE", "OLTP max", "OLTP avg", "BLOCKED?"],
      [
        ["PG norm — ADD COL NOT NULL DEFAULT", ...u(norm.underLoad)],
        ["PG JSONB — backfill UPDATE", ...u(jsonb.underLoad)],
        ["Mongo  — updateMany", ...u(mongo.underLoad)],
      ],
    );
    console.log(
      dim(
        `  PG nullable ADD COLUMN = metadata-only (~${ms(norm.cheapDdlMs ?? 0)}). ` +
          `Cái khoá là DDL REWRITE/scan: đổi type · NOT NULL default tính per-row · validate constraint.\n` +
          `  JSONB/Mongo: field trong blob linh hoạt → không rewrite bảng → OLTP không bị block.\n` +
          `  Bằng chứng lock trực quan: npm run demo:2:lock · SQL tay: demos/02-hero-config/queries.sql\n`,
      ),
    );
  } finally {
    await poolNorm.end();
    await poolJsonb.end();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
