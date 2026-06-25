// Demo 2 · LAYER 1 — read patterns: xuôi (embed) · ngược (multi JOIN / $lookup) · index vs no-index.
// Giả định đã chạy `npm run demo:2:seed`.
//   npm run demo:2:layer1
import { makePoolForDb, pgDbs } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title } from "../../src/lib/table";
import { withSpinner } from "../../src/lib/progress";
import { assertSeededPg, readNorm, readJsonb, readMongo, ms } from "./lib";

async function main(): Promise<void> {
  const poolNorm = makePoolForDb(pgDbs.norm, 10);
  const poolJsonb = makePoolForDb(pgDbs.jsonb, 10);
  const { client, db } = await makeMongo();
  try {
    title("DEMO 2 · LAYER 1 — Read patterns");
    if (!(await assertSeededPg(poolNorm, "norm")) || !(await assertSeededPg(poolJsonb, "jsonb"))) return;

    const norm = await withSpinner("PostgreSQL normalized reads", () => readNorm(poolNorm));
    const jsonb = await withSpinner("PostgreSQL JSONB reads", () => readJsonb(poolJsonb));
    const mongo = await withSpinner("MongoDB reads", () => readMongo(db));

    printTable(
      ["OPERATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [
        ["Hero full view (xuoi)", ms(norm.heroFullView), ms(jsonb.heroFullView), ms(mongo.heroFullView)],
        ["Owner->heroes multi (idx)", ms(norm.ownerToHeroes), ms(jsonb.ownerToHeroes), ms(mongo.ownerToHeroes)],
        ["Owner->heroes multi NO idx", ms(norm.ownerToHeroesNoIndex), ms(jsonb.ownerToHeroesNoIndex), ms(mongo.ownerToHeroesNoIndex)],
      ],
    );
    console.log(
      dim(
        `\n  Xuôi  → 1 read (JSONB/Mongo) vs JOIN 4 bảng (norm).\n` +
          `  Ngược → multi JOIN (PG) / $lookup×2 (Mongo); có index ngang nhau, mất index Mongo đắt nhất.\n` +
          `  SQL chạy tay: demos/02-hero-config/queries.sql\n`,
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
