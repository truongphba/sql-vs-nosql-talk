// Demo 2 — Hero / building / item config
// So sánh: PostgreSQL normalized · PostgreSQL JSONB · MongoDB
// Layer 1 — read patterns: xuôi (embed) · ngược multi JOIN / $lookup
// Layer 2 — schema evolution: ALTER + backfill
//
// ── Benchmark config ──
//
// N               — số hero seed vào DB (100K ≈ vài chục giây, đủ thấy gap xuôi/ngược).
// userN           — số user. Hero gán ownerId ∈ [1..userN].
// FORWARD_READS   — lần đọc xuôi (hero → full view); lấy avg latency/query.
// BACKWARD_READS  — lần đọc ngược (user → heroes+wallet); query whale user.
// WHALE_SHARE     — top X% user là whale (vd 0.1 = 10% user đầu).
// WHALE_HERO_RATIO— tỷ lệ hero gán vào whale pool (vd 0.75 = 75% hero thuộc whale).
// INSERT_CHUNK    — insert từng batch — không materialize toàn bộ N hero trong RAM.
//
import type { Pool } from "pg";
import type { Db } from "mongodb";
import { ensurePgDatabase, makePoolForDb, pgDbs } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title } from "../../src/lib/table";
import { timed, ms } from "../../src/lib/timer";

const N = 100_000;
const userN = 50_000;
const FORWARD_READS = 1000;
const BACKWARD_READS = 500;
const WHALE_SHARE = 0.1;
const WHALE_HERO_RATIO = 0.75;
const INSERT_CHUNK = 10_000;

const SKILLS = ["Fireball", "Slash", "Heal", "Shield", "Poison", "Thunder", "Frost", "Drain"];
const RARITY = ["R", "SR", "SSR", "UR"];
const TYPES = ["Tank", "AP", "AD", "Support"];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (n: number) => Math.floor(Math.random() * n);

type User = { id: number; name: string; level: number };
type Wallet = { userId: number; balance: number; vipTier: string };
type Hero = {
  id: number;
  name: string;
  ownerId: number;
  rarity: string;
  type: string;
  stats: { atk: number; def: number; hp: number };
  skills: { name: string; dmg: number }[];
  owner: User;
};

type Seed = {
  users: User[];
  wallets: Wallet[];
  whaleIds: number[];
  avgHeroesPerWhale: number;
  userById: Map<number, User>;
  walletByUser: Map<number, Wallet>;
};

function fmtScale(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function pickOwnerId(whaleIds: number[]): number {
  return Math.random() < WHALE_HERO_RATIO ? whaleIds[rnd(whaleIds.length)] : 1 + rnd(userN);
}

function genSeed(): Seed {
  const users = Array.from({ length: userN }, (_, i) => ({
    id: i + 1,
    name: `User_${i + 1}`,
    level: 1 + rnd(10),
  }));
  const wallets = users.map((u) => ({
    userId: u.id,
    balance: 100 + rnd(10_000),
    vipTier: pick(["Bronze", "Silver", "Gold", "Platinum"]),
  }));
  const whaleCount = Math.max(1, Math.floor(userN * WHALE_SHARE));
  const whaleIds = users.slice(0, whaleCount).map((u) => u.id);
  // Ước lượng: 75% hero chia đều whale pool
  const avgHeroesPerWhale = (N * WHALE_HERO_RATIO) / whaleIds.length;
  const userById = new Map(users.map((u) => [u.id, u]));
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));
  return { users, wallets, whaleIds, avgHeroesPerWhale, userById, walletByUser };
}

function genHeroChunk(startId: number, count: number, seed: Seed): Hero[] {
  const { userById, whaleIds } = seed;
  return Array.from({ length: count }, (_, i) => {
    const id = startId + i;
    const ownerId = pickOwnerId(whaleIds);
    const owner = userById.get(ownerId)!;
    return {
      id,
      name: `Hero_${id}`,
      ownerId,
      rarity: pick(RARITY),
      type: pick(TYPES),
      stats: { atk: 10 + rnd(90), def: 10 + rnd(90), hp: 100 + rnd(900) },
      skills: Array.from({ length: 3 }, () => ({ name: pick(SKILLS), dmg: 10 + rnd(90) })),
      owner,
    };
  });
}

async function bulkUsers(pool: Pool, table: string, users: User[]): Promise<void> {
  await pool.query(
    `INSERT INTO ${table} (id, name, level)
     SELECT * FROM unnest($1::int[], $2::text[], $3::int[]) AS u(id, name, level)`,
    [users.map((u) => u.id), users.map((u) => u.name), users.map((u) => u.level)],
  );
}

async function bulkWallets(pool: Pool, table: string, wallets: Wallet[]): Promise<void> {
  await pool.query(
    `INSERT INTO ${table} (user_id, balance, vip_tier)
     SELECT * FROM unnest($1::int[], $2::int[], $3::text[]) AS w(user_id, balance, vip_tier)`,
    [wallets.map((w) => w.userId), wallets.map((w) => w.balance), wallets.map((w) => w.vipTier)],
  );
}

async function bulkHeroesNorm(pool: Pool, heroes: Hero[]): Promise<void> {
  await pool.query(
    `INSERT INTO heroes (id, name, owner_id, rarity, type, atk, def, hp)
     SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::text[], $5::text[], $6::int[], $7::int[], $8::int[])
     AS h(id, name, owner_id, rarity, type, atk, def, hp)`,
    [
      heroes.map((h) => h.id),
      heroes.map((h) => h.name),
      heroes.map((h) => h.ownerId),
      heroes.map((h) => h.rarity),
      heroes.map((h) => h.type),
      heroes.map((h) => h.stats.atk),
      heroes.map((h) => h.stats.def),
      heroes.map((h) => h.stats.hp),
    ],
  );
}

async function bulkHeroSkills(pool: Pool, heroes: Hero[]): Promise<void> {
  const heroIds: number[] = [];
  const names: string[] = [];
  const dmgs: number[] = [];
  for (const h of heroes) {
    for (const s of h.skills) {
      heroIds.push(h.id);
      names.push(s.name);
      dmgs.push(s.dmg);
    }
  }
  await pool.query(
    `INSERT INTO hero_skills (hero_id, name, dmg)
     SELECT * FROM unnest($1::int[], $2::text[], $3::int[]) AS s(hero_id, name, dmg)`,
    [heroIds, names, dmgs],
  );
}

async function bulkHeroesEmbed(pool: Pool, heroes: Hero[], walletByUser: Map<number, Wallet>): Promise<void> {
  await pool.query(
    `INSERT INTO heroes (id, name, owner_id, config)
     SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::jsonb[])
     AS h(id, name, owner_id, config)`,
    [
      heroes.map((h) => h.id),
      heroes.map((h) => h.name),
      heroes.map((h) => h.ownerId),
      heroes.map((h) => {
        const w = walletByUser.get(h.ownerId)!;
        return JSON.stringify({
          owner: h.owner,
          wallet: { balance: w.balance, vipTier: w.vipTier },
          rarity: h.rarity,
          type: h.type,
          stats: h.stats,
          skills: h.skills,
        });
      }),
    ],
  );
}

async function insertHeroesChunked(
  fn: (chunk: Hero[]) => Promise<void>,
  seed: Seed,
): Promise<void> {
  for (let start = 1; start <= N; start += INSERT_CHUNK) {
    const count = Math.min(INSERT_CHUNK, N - start + 1);
    await fn(genHeroChunk(start, count, seed));
  }
}

async function avgReadMs(reads: number, fn: (i: number) => Promise<unknown>): Promise<number> {
  const { ms: total } = await timed(async () => {
    for (let i = 0; i < reads; i++) await fn(i);
  });
  return total / reads;
}

type ReadRow = {
  insert: number;
  heroFullView: number;
  ownerToHeroes: number;
  ownerToHeroesNoIndex: number;
};

type MigrateRow = {
  addColumnDdl: number;
  backfillAll: number;
};

async function pgNormalized(pool: Pool, seed: Seed): Promise<{ read: ReadRow; migrate: MigrateRow }> {
  const { users, wallets, whaleIds } = seed;
  await pool.query(`DROP TABLE IF EXISTS hero_skills, heroes, wallets, users`);
  await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text, level int)`);
  await pool.query(`CREATE TABLE wallets (
    user_id int PRIMARY KEY REFERENCES users(id), balance int, vip_tier text)`);
  await pool.query(`CREATE TABLE heroes (
    id int PRIMARY KEY, name text, owner_id int REFERENCES users(id), rarity text, type text,
    atk int, def int, hp int)`);
  await pool.query(`CREATE TABLE hero_skills (
    hero_id int REFERENCES heroes(id), name text, dmg int)`);

  const { ms: insert } = await timed(async () => {
    await bulkUsers(pool, "users", users);
    await bulkWallets(pool, "wallets", wallets);
    await insertHeroesChunked(async (chunk) => {
      await bulkHeroesNorm(pool, chunk);
      await bulkHeroSkills(pool, chunk);
    }, seed);
  });

  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`);
  await pool.query(`CREATE INDEX hero_skills_hero_id_idx ON hero_skills (hero_id)`);

  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    const id = 1 + rnd(N);
    await pool.query(
      `SELECT h.id, h.name, h.rarity, h.type, h.atk, h.def, h.hp,
              u.id AS owner_id, u.name AS owner_name, u.level,
              w.balance, w.vip_tier,
              COALESCE(json_agg(json_build_object('name', s.name, 'dmg', s.dmg))
                FILTER (WHERE s.hero_id IS NOT NULL), '[]') AS skills
       FROM heroes h
       JOIN users u ON u.id = h.owner_id
       JOIN wallets w ON w.user_id = u.id
       LEFT JOIN hero_skills s ON s.hero_id = h.id
       WHERE h.id = $1
       GROUP BY h.id, u.id, w.user_id`,
      [id],
    );
  });

  const ownerToHeroes = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await pool.query(
      `SELECT u.id, u.name, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.rarity
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       JOIN heroes h ON h.owner_id = u.id
       WHERE u.id = $1`,
      [id],
    );
  });

  await pool.query(`DROP INDEX heroes_owner_id_idx`);
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await pool.query(
      `SELECT u.id, u.name, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.rarity
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       JOIN heroes h ON h.owner_id = u.id
       WHERE u.id = $1`,
      [id],
    );
  });

  const { ms: addColumnDdl } = await timed(() =>
    pool.query(`ALTER TABLE heroes ADD COLUMN trait text`),
  );
  const { ms: backfillAll } = await timed(() =>
    pool.query(`UPDATE heroes SET trait = 'Steadfast' WHERE trait IS NULL`),
  );

  return {
    read: { insert, heroFullView, ownerToHeroes, ownerToHeroesNoIndex },
    migrate: { addColumnDdl, backfillAll },
  };
}

async function pgJsonb(pool: Pool, seed: Seed): Promise<{ read: ReadRow; migrate: MigrateRow }> {
  const { users, wallets, whaleIds, walletByUser } = seed;
  await pool.query(`DROP TABLE IF EXISTS heroes, wallets, users`);
  await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text, level int)`);
  await pool.query(`CREATE TABLE wallets (
    user_id int PRIMARY KEY REFERENCES users(id), balance int, vip_tier text)`);
  await pool.query(`CREATE TABLE heroes (
    id int PRIMARY KEY, name text, owner_id int REFERENCES users(id), config jsonb)`);

  const { ms: insert } = await timed(async () => {
    await bulkUsers(pool, "users", users);
    await bulkWallets(pool, "wallets", wallets);
    await insertHeroesChunked(async (chunk) => {
      await bulkHeroesEmbed(pool, chunk, walletByUser);
    }, seed);
  });

  await pool.query(`CREATE INDEX heroes_owner_expr_idx ON heroes (((config->'owner'->>'id')::int))`);
  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`);

  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    const id = 1 + rnd(N);
    await pool.query(`SELECT config FROM heroes WHERE id=$1`, [id]);
  });

  const ownerToHeroes = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await pool.query(
      `SELECT u.id, u.name, u.level, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.config
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       JOIN heroes h ON h.owner_id = u.id
       WHERE u.id = $1`,
      [id],
    );
  });

  await pool.query(`DROP INDEX heroes_owner_expr_idx`);
  await pool.query(`DROP INDEX heroes_owner_id_idx`);
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await pool.query(
      `SELECT u.id, u.name, u.level, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.config
       FROM users u
       JOIN wallets w ON w.user_id = u.id
       JOIN heroes h ON h.owner_id = u.id
       WHERE u.id = $1`,
      [id],
    );
  });

  const { ms: addColumnDdl } = await timed(async () => {});
  const { ms: backfillAll } = await timed(() =>
    pool.query(`UPDATE heroes SET config = config || '{"trait":"Steadfast"}'::jsonb`),
  );

  return {
    read: { insert, heroFullView, ownerToHeroes, ownerToHeroesNoIndex },
    migrate: { addColumnDdl, backfillAll },
  };
}

async function mongoOwnerToHeroes(
  usersCol: ReturnType<Db["collection"]>,
  heroesCol: ReturnType<Db["collection"]>,
  walletsCol: ReturnType<Db["collection"]>,
  userId: number,
): Promise<unknown> {
  return usersCol
    .aggregate([
      { $match: { _id: userId as never } },
      {
        $lookup: {
          from: walletsCol.collectionName,
          localField: "_id",
          foreignField: "userId",
          as: "wallet",
        },
      },
      { $unwind: "$wallet" },
      {
        $lookup: {
          from: heroesCol.collectionName,
          localField: "_id",
          foreignField: "ownerId",
          as: "heroes",
        },
      },
      { $project: { name: 1, level: 1, wallet: 1, heroes: { name: 1, rarity: 1, stats: 1, skills: 1 } } },
    ])
    .toArray();
}

async function mongoDoc(db: Db, seed: Seed): Promise<{ read: ReadRow; migrate: MigrateRow }> {
  const { users, wallets, whaleIds, walletByUser } = seed;
  const col = db.collection("heroes");
  const usersCol = db.collection("users");
  const walletsCol = db.collection("wallets");
  await Promise.all([
    col.drop().catch(() => {}),
    usersCol.drop().catch(() => {}),
    walletsCol.drop().catch(() => {}),
  ]);

  const { ms: insert } = await timed(async () => {
    await usersCol.insertMany(users.map((u) => ({ _id: u.id as never, name: u.name, level: u.level })));
    await walletsCol.insertMany(
      wallets.map((w) => ({ _id: w.userId as never, userId: w.userId, balance: w.balance, vipTier: w.vipTier })),
    );
    await insertHeroesChunked(async (chunk) => {
      const docs = chunk.map((h) => {
        const w = walletByUser.get(h.ownerId)!;
        return {
          _id: h.id as never,
          name: h.name,
          ownerId: h.ownerId,
          owner: h.owner,
          wallet: { balance: w.balance, vipTier: w.vipTier },
          rarity: h.rarity,
          type: h.type,
          stats: h.stats,
          skills: h.skills,
        };
      });
      await col.insertMany(docs, { ordered: false });
    }, seed);
  });

  await col.createIndex({ ownerId: 1 });
  await walletsCol.createIndex({ userId: 1 });

  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    const id = 1 + rnd(N);
    await col.findOne({ _id: id as never });
  });

  const ownerToHeroes = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await mongoOwnerToHeroes(usersCol, col, walletsCol, id);
  });

  await col.dropIndex("ownerId_1");
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, async (i) => {
    const id = whaleIds[i % whaleIds.length];
    await mongoOwnerToHeroes(usersCol, col, walletsCol, id);
  });

  const { ms: addColumnDdl } = await timed(async () => {});
  const { ms: backfillAll } = await timed(() =>
    col.updateMany({}, { $set: { trait: "Steadfast" } }),
  );

  return {
    read: { insert, heroFullView, ownerToHeroes, ownerToHeroesNoIndex },
    migrate: { addColumnDdl, backfillAll },
  };
}

function printConfig(seed: Seed): void {
  console.log(
    dim(
      `  Config: N=${fmtScale(N)} hero · userN=${userN.toLocaleString()} · ` +
        `reads xuoi=${FORWARD_READS} ngược=${BACKWARD_READS} · ` +
        `whale top ${(WHALE_SHARE * 100).toFixed(0)}% · ${(WHALE_HERO_RATIO * 100).toFixed(0)}% hero → whale · ` +
        `chunk=${INSERT_CHUNK.toLocaleString()}`,
    ),
  );
}

async function main(): Promise<void> {
  await ensurePgDatabase(pgDbs.norm);
  await ensurePgDatabase(pgDbs.jsonb);
  const poolNorm = makePoolForDb(pgDbs.norm, 10);
  const poolJsonb = makePoolForDb(pgDbs.jsonb, 10);
  const { client, db } = await makeMongo();
  try {
    const seed = genSeed();
    title(
      `DEMO 2 — Hero config · ${fmtScale(N)} hero · ${seed.whaleIds.length} whale · ~${seed.avgHeroesPerWhale.toFixed(0)} hero/whale`,
    );
    printConfig(seed);
    console.log(dim(`  PG: ${pgDbs.norm} (normalized) · ${pgDbs.jsonb} (JSONB) · MongoDB: pixiland`));

    const norm = await pgNormalized(poolNorm, seed);
    const jsonb = await pgJsonb(poolJsonb, seed);
    const mongo = await mongoDoc(db, seed);

    const s = (n: number) => (n < 10 ? `${n.toFixed(1)}ms` : n < 1000 ? `${n.toFixed(0)}ms` : `${(n / 1000).toFixed(2)}s`);

    console.log(dim("\n── Layer 1 · Read patterns ──"));
    printTable(
      ["OPERATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [
        [`Bulk insert ${fmtScale(N)}`, s(norm.read.insert), s(jsonb.read.insert), s(mongo.read.insert)],
        ["Hero full view (xuoi)", ms(norm.read.heroFullView), ms(jsonb.read.heroFullView), ms(mongo.read.heroFullView)],
        ["Owner->heroes multi (idx)", ms(norm.read.ownerToHeroes), ms(jsonb.read.ownerToHeroes), ms(mongo.read.ownerToHeroes)],
        ["Owner->heroes multi NO idx", ms(norm.read.ownerToHeroesNoIndex), ms(jsonb.read.ownerToHeroesNoIndex), ms(mongo.read.ownerToHeroesNoIndex)],
      ],
    );

    console.log(dim("\n── Layer 2 · Schema evolution (add `trait` to all rows) ──"));
    printTable(
      ["MIGRATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [
        ["ALTER / DDL", s(norm.migrate.addColumnDdl), s(jsonb.migrate.addColumnDdl), s(mongo.migrate.addColumnDdl)],
        [`Backfill ${fmtScale(N)}`, s(norm.migrate.backfillAll), s(jsonb.migrate.backfillAll), s(mongo.migrate.backfillAll)],
      ],
    );

    console.log(
      dim(
        `\n── Ví dụ query ──\n` +
          `  Xuôi  PG: heroes ⋈ users ⋈ wallets ⋈ hero_skills WHERE id=$1\n` +
          `  Xuôi  JSONB/Mongo: SELECT config / findOne({ _id })\n` +
          `  Ngược PG/JSONB: users ⋈ wallets ⋈ heroes WHERE user.id=$1\n` +
          `  Ngược Mongo: users → $lookup wallets → $lookup heroes\n` +
          `\n  Disk: npm run db:size (sau demo) — so pixiland_norm vs pixiland_jsonb vs Mongo.\n`,
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
