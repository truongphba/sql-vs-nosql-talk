// Demo 2 · SEED — chạy 1 lần đầu buổi: nạp 100K hero vào norm/jsonb/mongo + tạo index.
// Sau đó dùng demo:2:layer1 / demo:2:layer2 mà KHÔNG cần seed lại.
//   npm run demo:2:seed
import { ensurePgDatabase, makePoolForDb, pgDbs } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title } from "../../src/lib/table";
import { N, fmtScale, genSeed, seedNorm, seedJsonb, seedMongo, s, userN, whaleCount, avgHeroesPerWhale } from "./lib";

async function main(): Promise<void> {
  await ensurePgDatabase(pgDbs.norm);
  await ensurePgDatabase(pgDbs.jsonb);
  const poolNorm = makePoolForDb(pgDbs.norm, 10);
  const poolJsonb = makePoolForDb(pgDbs.jsonb, 10);
  const { client, db } = await makeMongo();
  try {
    title(`DEMO 2 · SEED — ${fmtScale(N)} hero · ${whaleCount} whale · ~${avgHeroesPerWhale.toFixed(0)} hero/whale`);
    console.log(dim(`  ${userN.toLocaleString()} user · norm=${pgDbs.norm} · jsonb=${pgDbs.jsonb} · mongo=pixiland\n`));
    const seed = genSeed();
    const insNorm = await seedNorm(poolNorm, seed);
    const insJsonb = await seedJsonb(poolJsonb, seed);
    const insMongo = await seedMongo(db, seed);

    printTable(
      ["OPERATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [[`Bulk insert ${fmtScale(N)}`, s(insNorm), s(insJsonb), s(insMongo)]],
    );
    console.log(
      dim(
        `\n  Đã seed xong. Tiếp theo:\n` +
          `    npm run demo:2:layer1   # read patterns (xuôi / ngược / index)\n` +
          `    npm run demo:2:layer2   # schema evolution (lock dưới tải)\n` +
          `    npm run demo:2:lock     # bằng chứng pg_locks\n` +
          `    npm run db:size         # so dung lượng norm vs jsonb vs mongo\n`,
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
