// Demo 2 — Hero / building / item config (FULL run: seed + Layer 1 + Layer 2).
// Để demo từng phần cho dễ, dùng các script nhỏ:
//   npm run demo:2:seed     # nạp data 1 lần
//   npm run demo:2:layer1   # read patterns
//   npm run demo:2:layer2   # schema evolution (lock dưới tải)
//   npm run demo:2:lock     # bằng chứng pg_locks
// Hoặc `npm run demo:2` chạy cả chuỗi (rehearsal).
import { ensurePgDatabase, makePoolForDb, pgDbs } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title, ok, bad } from "../../src/lib/table";
import { withSpinner } from "../../src/lib/progress";
import {
  N, fmtScale, genSeed, seedNorm, seedJsonb, seedMongo,
  readNorm, readJsonb, readMongo,
  migrateNorm, migrateJsonb, migrateMongo,
  type MigrateRow, type UnderLoad, LOADERS, whaleCount, avgHeroesPerWhale, s, ms,
} from "./lib";

async function main(): Promise<void> {
  await ensurePgDatabase(pgDbs.norm);
  await ensurePgDatabase(pgDbs.jsonb);
  const poolNorm = makePoolForDb(pgDbs.norm, 10);
  const poolJsonb = makePoolForDb(pgDbs.jsonb, 10);
  const { client, db } = await makeMongo();
  try {
    title(`DEMO 2 — Hero config · ${fmtScale(N)} hero · ${whaleCount} whale · ~${avgHeroesPerWhale.toFixed(0)} hero/whale`);
    const seed = genSeed();
    const insNorm = await withSpinner("Seed PostgreSQL normalized", () => seedNorm(poolNorm, seed), s);
    const insJsonb = await withSpinner("Seed PostgreSQL JSONB", () => seedJsonb(poolJsonb, seed), s);
    const insMongo = await withSpinner("Seed MongoDB", () => seedMongo(db, seed), s);

    const norm = await withSpinner("Layer 1 · PostgreSQL normalized reads", () => readNorm(poolNorm));
    const jsonb = await withSpinner("Layer 1 · PostgreSQL JSONB reads", () => readJsonb(poolJsonb));
    const mongo = await withSpinner("Layer 1 · MongoDB reads", () => readMongo(db));

    console.log(dim("\n── Layer 1 · Read patterns ──"));
    printTable(
      ["OPERATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [
        [`Bulk insert ${fmtScale(N)}`, s(insNorm), s(insJsonb), s(insMongo)],
        ["Hero full view (xuoi)", ms(norm.heroFullView), ms(jsonb.heroFullView), ms(mongo.heroFullView)],
        ["Owner->heroes multi (idx)", ms(norm.ownerToHeroes), ms(jsonb.ownerToHeroes), ms(mongo.ownerToHeroes)],
        ["Owner->heroes multi NO idx", ms(norm.ownerToHeroesNoIndex), ms(jsonb.ownerToHeroesNoIndex), ms(mongo.ownerToHeroesNoIndex)],
      ],
    );

    const mNorm = await withSpinner("Layer 2 · PostgreSQL normalized migration", () => migrateNorm(poolNorm));
    const mJsonb = await withSpinner("Layer 2 · PostgreSQL JSONB migration", () => migrateJsonb(poolJsonb));
    const mMongo = await withSpinner("Layer 2 · MongoDB migration", () => migrateMongo(db));

    console.log(dim("\n── Layer 2 · Schema evolution — thêm field `trait` ──"));
    console.log("  Part A — đọc field `trait` trên data CŨ (chưa migrate):");
    const partA = (m: MigrateRow) =>
      m.fieldAbsent === "error"
        ? bad(`ERROR: column "trait" does not exist`) + dim("  → buộc ALTER")
        : ok("null") + dim("  → lazy read OK, không cần migrate");
    console.log(`    PG normalized : ${partA(mNorm)}`);
    console.log(`    PG JSONB      : ${partA(mJsonb)}`);
    console.log(`    MongoDB       : ${partA(mMongo)}`);

    console.log(dim(`\n  Part B — chạy migration trong khi ${LOADERS} luồng OLTP đọc heroes:`));
    const u = (x: UnderLoad) => [s(x.migrateMs), ms(x.maxMs), ms(x.avgMs), x.blocked > 0 ? bad(`YES (${x.blocked}/${x.samples})`) : ok("no")];
    printTable(
      ["MIGRATION (under load)", "MIGRATE", "OLTP max", "OLTP avg", "BLOCKED?"],
      [
        ["PG norm — ADD COL NOT NULL DEFAULT", ...u(mNorm.underLoad)],
        ["PG JSONB — backfill UPDATE", ...u(mJsonb.underLoad)],
        ["Mongo  — updateMany", ...u(mMongo.underLoad)],
      ],
    );
    console.log(
      dim(
        `  PG nullable ADD COLUMN = metadata-only (~${ms(mNorm.cheapDdlMs ?? 0)}). ` +
          `Cái khoá là DDL REWRITE/scan: đổi type · NOT NULL default tính per-row · validate constraint.\n` +
          `  JSONB/Mongo: field trong blob linh hoạt → không rewrite bảng → OLTP không bị block.\n` +
          `\n  Disk: npm run db:size · Lock proof: npm run demo:2:lock · SQL tay: demos/02-hero-config/queries.sql\n`,
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
