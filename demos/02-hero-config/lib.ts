// Demo 2 — module dùng chung cho các script nhỏ:
//   seed.ts (demo:2:seed) · layer1.ts (demo:2:layer1) · layer2.ts (demo:2:layer2) · index.ts (demo:2 full)
//
// Mô hình: SEED MỘT LẦN vào DB (norm/jsonb/mongo), rồi chạy từng layer riêng — không phải seed lại.
// whaleIds suy ra tất định (user id 1..whaleCount) nên layer1/layer2 không cần giữ seed trong RAM.
import type { Pool } from "pg";
import type { Db } from "mongodb";
import { timed, ms } from "../../src/lib/timer";

// ── Config benchmark ──
export const N = 100_000; // số hero
export const userN = 50_000; // số user
export const FORWARD_READS = 1000;
export const BACKWARD_READS = 500;
export const WHALE_SHARE = 0.1; // 10% user đầu là whale
export const WHALE_HERO_RATIO = 0.75; // 75% hero thuộc whale pool
export const INSERT_CHUNK = 10_000;
export const LOADERS = 6; // luồng OLTP chạy song song lúc migrate
export const BLOCK_MS = 100; // ngưỡng coi query bị kẹt lock (point read < 2ms)

export const whaleCount = Math.max(1, Math.floor(userN * WHALE_SHARE));
export const whaleIds = Array.from({ length: whaleCount }, (_, i) => i + 1);
export const avgHeroesPerWhale = (N * WHALE_HERO_RATIO) / whaleCount;

const SKILLS = ["Fireball", "Slash", "Heal", "Shield", "Poison", "Thunder", "Frost", "Drain"];
const RARITY = ["R", "SR", "SSR", "UR"];
const TYPES = ["Tank", "AP", "AD", "Support"];

export const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const rnd = (n: number): number => Math.floor(Math.random() * n);
export const sleep = (m: number): Promise<void> => new Promise((r) => setTimeout(r, m));

export function fmtScale(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}
export const s = (n: number): string =>
  n < 10 ? `${n.toFixed(1)}ms` : n < 1000 ? `${n.toFixed(0)}ms` : `${(n / 1000).toFixed(2)}s`;

// ── Types ──
export type User = { id: number; name: string; level: number };
export type Wallet = { userId: number; balance: number; vipTier: string };
export type Hero = {
  id: number;
  name: string;
  ownerId: number;
  rarity: string;
  type: string;
  stats: { atk: number; def: number; hp: number };
  skills: { name: string; dmg: number }[];
  owner: User;
};
export type Seed = { users: User[]; wallets: Wallet[]; userById: Map<number, User>; walletByUser: Map<number, Wallet> };
export type ReadRow = { insert: number; heroFullView: number; ownerToHeroes: number; ownerToHeroesNoIndex: number };
export type MigrateRow = { fieldAbsent: "error" | "null"; cheapDdlMs: number | null; underLoad: UnderLoad };
export type UnderLoad = { migrateMs: number; maxMs: number; avgMs: number; blocked: number; samples: number };

// ── Seed generation ──
function pickOwnerId(): number {
  return Math.random() < WHALE_HERO_RATIO ? whaleIds[rnd(whaleCount)] : 1 + rnd(userN);
}

export function genSeed(): Seed {
  const users = Array.from({ length: userN }, (_, i) => ({ id: i + 1, name: `User_${i + 1}`, level: 1 + rnd(10) }));
  const wallets = users.map((u) => ({
    userId: u.id,
    balance: 100 + rnd(10_000),
    vipTier: pick(["Bronze", "Silver", "Gold", "Platinum"]),
  }));
  const userById = new Map(users.map((u) => [u.id, u]));
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));
  return { users, wallets, userById, walletByUser };
}

function genHeroChunk(startId: number, count: number, seed: Seed): Hero[] {
  return Array.from({ length: count }, (_, i) => {
    const id = startId + i;
    const ownerId = pickOwnerId();
    return {
      id,
      name: `Hero_${id}`,
      ownerId,
      rarity: pick(RARITY),
      type: pick(TYPES),
      stats: { atk: 10 + rnd(90), def: 10 + rnd(90), hp: 100 + rnd(900) },
      skills: Array.from({ length: 3 }, () => ({ name: pick(SKILLS), dmg: 10 + rnd(90) })),
      owner: seed.userById.get(ownerId)!,
    };
  });
}

async function insertHeroesChunked(fn: (chunk: Hero[]) => Promise<void>, seed: Seed): Promise<void> {
  for (let start = 1; start <= N; start += INSERT_CHUNK) {
    await fn(genHeroChunk(start, Math.min(INSERT_CHUNK, N - start + 1), seed));
  }
}

async function avgReadMs(reads: number, fn: (i: number) => Promise<unknown>): Promise<number> {
  const { ms: total } = await timed(async () => {
    for (let i = 0; i < reads; i++) await fn(i);
  });
  return total / reads;
}

function summarize(migrateMs: number, lats: number[]): UnderLoad {
  return {
    migrateMs,
    maxMs: lats.length ? Math.max(...lats) : 0,
    avgMs: lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0,
    blocked: lats.filter((x) => x > BLOCK_MS).length,
    samples: lats.length,
  };
}

/** Chạy `migrateSql` trong khi LOADERS luồng point-read `heroes` — đo độ trễ OLTP dưới migration. */
async function pgMigrateUnderLoad(pool: Pool, migrateSql: string): Promise<UnderLoad> {
  let stop = false;
  const lats: number[] = [];
  const loader = async () => {
    while (!stop) {
      const { ms: q } = await timed(() => pool.query(`SELECT id, name FROM heroes WHERE id=$1`, [1 + rnd(N)]));
      lats.push(q);
    }
  };
  const loaders = Array.from({ length: LOADERS }, loader);
  await sleep(5);
  const { ms: migrateMs } = await timed(() => pool.query(migrateSql));
  stop = true;
  await Promise.all(loaders);
  return summarize(migrateMs, lats);
}

async function mongoMigrateUnderLoad(
  col: ReturnType<Db["collection"]>,
  doMigrate: () => Promise<unknown>,
): Promise<UnderLoad> {
  let stop = false;
  const lats: number[] = [];
  const loader = async () => {
    while (!stop) {
      const { ms: q } = await timed(() => col.findOne({ _id: (1 + rnd(N)) as never }));
      lats.push(q);
    }
  };
  const loaders = Array.from({ length: LOADERS }, loader);
  await sleep(5);
  const { ms: migrateMs } = await timed(doMigrate);
  stop = true;
  await Promise.all(loaders);
  return summarize(migrateMs, lats);
}

// ── Bulk insert helpers ──
async function bulkUsers(pool: Pool, users: User[]): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, name, level) SELECT * FROM unnest($1::int[], $2::text[], $3::int[]) AS u(id, name, level)`,
    [users.map((u) => u.id), users.map((u) => u.name), users.map((u) => u.level)],
  );
}
async function bulkWallets(pool: Pool, wallets: Wallet[]): Promise<void> {
  await pool.query(
    `INSERT INTO wallets (user_id, balance, vip_tier) SELECT * FROM unnest($1::int[], $2::int[], $3::text[]) AS w(user_id, balance, vip_tier)`,
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
  for (const h of heroes) for (const sk of h.skills) (heroIds.push(h.id), names.push(sk.name), dmgs.push(sk.dmg));
  await pool.query(
    `INSERT INTO hero_skills (hero_id, name, dmg) SELECT * FROM unnest($1::int[], $2::text[], $3::int[]) AS s(hero_id, name, dmg)`,
    [heroIds, names, dmgs],
  );
}
async function bulkHeroesEmbed(pool: Pool, heroes: Hero[], walletByUser: Map<number, Wallet>): Promise<void> {
  await pool.query(
    `INSERT INTO heroes (id, name, owner_id, config) SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::jsonb[]) AS h(id, name, owner_id, config)`,
    [
      heroes.map((h) => h.id),
      heroes.map((h) => h.name),
      heroes.map((h) => h.ownerId),
      heroes.map((h) => {
        const w = walletByUser.get(h.ownerId)!;
        return JSON.stringify({ owner: h.owner, wallet: { balance: w.balance, vipTier: w.vipTier }, rarity: h.rarity, type: h.type, stats: h.stats, skills: h.skills });
      }),
    ],
  );
}

// ── SEED (schema + insert + index) — gọi 1 lần ──
export async function seedNorm(pool: Pool, seed: Seed): Promise<number> {
  await pool.query(`DROP TABLE IF EXISTS hero_skills, heroes, wallets, users`);
  await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text, level int)`);
  await pool.query(`CREATE TABLE wallets (user_id int PRIMARY KEY REFERENCES users(id), balance int, vip_tier text)`);
  await pool.query(`CREATE TABLE heroes (id int PRIMARY KEY, name text, owner_id int REFERENCES users(id), rarity text, type text, atk int, def int, hp int)`);
  await pool.query(`CREATE TABLE hero_skills (hero_id int REFERENCES heroes(id), name text, dmg int)`);
  const { ms: insert } = await timed(async () => {
    await bulkUsers(pool, seed.users);
    await bulkWallets(pool, seed.wallets);
    await insertHeroesChunked(async (chunk) => {
      await bulkHeroesNorm(pool, chunk);
      await bulkHeroSkills(pool, chunk);
    }, seed);
  });
  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`);
  await pool.query(`CREATE INDEX hero_skills_hero_id_idx ON hero_skills (hero_id)`);
  return insert;
}

export async function seedJsonb(pool: Pool, seed: Seed): Promise<number> {
  await pool.query(`DROP TABLE IF EXISTS heroes, wallets, users`);
  await pool.query(`CREATE TABLE users (id int PRIMARY KEY, name text, level int)`);
  await pool.query(`CREATE TABLE wallets (user_id int PRIMARY KEY REFERENCES users(id), balance int, vip_tier text)`);
  await pool.query(`CREATE TABLE heroes (id int PRIMARY KEY, name text, owner_id int REFERENCES users(id), config jsonb)`);
  const { ms: insert } = await timed(async () => {
    await bulkUsers(pool, seed.users);
    await bulkWallets(pool, seed.wallets);
    await insertHeroesChunked(async (chunk) => {
      await bulkHeroesEmbed(pool, chunk, seed.walletByUser);
    }, seed);
  });
  await pool.query(`CREATE INDEX heroes_owner_expr_idx ON heroes (((config->'owner'->>'id')::int))`);
  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`);
  return insert;
}

export async function seedMongo(db: Db, seed: Seed): Promise<number> {
  const col = db.collection("heroes");
  const usersCol = db.collection("users");
  const walletsCol = db.collection("wallets");
  await Promise.all([col.drop().catch(() => {}), usersCol.drop().catch(() => {}), walletsCol.drop().catch(() => {})]);
  const { ms: insert } = await timed(async () => {
    await usersCol.insertMany(seed.users.map((u) => ({ _id: u.id as never, name: u.name, level: u.level })));
    await walletsCol.insertMany(seed.wallets.map((w) => ({ _id: w.userId as never, userId: w.userId, balance: w.balance, vipTier: w.vipTier })));
    await insertHeroesChunked(async (chunk) => {
      const docs = chunk.map((h) => {
        const w = seed.walletByUser.get(h.ownerId)!;
        return { _id: h.id as never, name: h.name, ownerId: h.ownerId, owner: h.owner, wallet: { balance: w.balance, vipTier: w.vipTier }, rarity: h.rarity, type: h.type, stats: h.stats, skills: h.skills };
      });
      await col.insertMany(docs, { ordered: false });
    }, seed);
  });
  await col.createIndex({ ownerId: 1 });
  await walletsCol.createIndex({ userId: 1 });
  return insert;
}

// ── LAYER 1 · read patterns (giả định đã seed) ──
type ReadResult = { heroFullView: number; ownerToHeroes: number; ownerToHeroesNoIndex: number };

export async function readNorm(pool: Pool): Promise<ReadResult> {
  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    await pool.query(
      `SELECT h.id, h.name, h.rarity, h.type, h.atk, h.def, h.hp, u.id AS owner_id, u.name AS owner_name, u.level, w.balance, w.vip_tier,
              COALESCE(json_agg(json_build_object('name', s.name, 'dmg', s.dmg)) FILTER (WHERE s.hero_id IS NOT NULL), '[]') AS skills
       FROM heroes h JOIN users u ON u.id = h.owner_id JOIN wallets w ON w.user_id = u.id
       LEFT JOIN hero_skills s ON s.hero_id = h.id WHERE h.id = $1 GROUP BY h.id, u.id, w.user_id`,
      [1 + rnd(N)],
    );
  });
  const backward = async (i: number) =>
    pool.query(
      `SELECT u.id, u.name, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.rarity
       FROM users u JOIN wallets w ON w.user_id = u.id JOIN heroes h ON h.owner_id = u.id WHERE u.id = $1`,
      [whaleIds[i % whaleCount]],
    );
  const ownerToHeroes = await avgReadMs(BACKWARD_READS, backward);
  await pool.query(`DROP INDEX heroes_owner_id_idx`);
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, backward);
  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`); // khôi phục state
  return { heroFullView, ownerToHeroes, ownerToHeroesNoIndex };
}

export async function readJsonb(pool: Pool): Promise<ReadResult> {
  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    await pool.query(`SELECT config FROM heroes WHERE id=$1`, [1 + rnd(N)]);
  });
  const backward = async (i: number) =>
    pool.query(
      `SELECT u.id, u.name, u.level, w.balance, w.vip_tier, h.id AS hero_id, h.name AS hero_name, h.config
       FROM users u JOIN wallets w ON w.user_id = u.id JOIN heroes h ON h.owner_id = u.id WHERE u.id = $1`,
      [whaleIds[i % whaleCount]],
    );
  const ownerToHeroes = await avgReadMs(BACKWARD_READS, backward);
  await pool.query(`DROP INDEX heroes_owner_expr_idx`);
  await pool.query(`DROP INDEX heroes_owner_id_idx`);
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, backward);
  await pool.query(`CREATE INDEX heroes_owner_expr_idx ON heroes (((config->'owner'->>'id')::int))`);
  await pool.query(`CREATE INDEX heroes_owner_id_idx ON heroes (owner_id)`);
  return { heroFullView, ownerToHeroes, ownerToHeroesNoIndex };
}

async function mongoOwnerToHeroes(db: Db, userId: number): Promise<unknown> {
  return db
    .collection("users")
    .aggregate([
      { $match: { _id: userId as never } },
      { $lookup: { from: "wallets", localField: "_id", foreignField: "userId", as: "wallet" } },
      { $unwind: "$wallet" },
      { $lookup: { from: "heroes", localField: "_id", foreignField: "ownerId", as: "heroes" } },
      { $project: { name: 1, level: 1, wallet: 1, heroes: { name: 1, rarity: 1, stats: 1, skills: 1 } } },
    ])
    .toArray();
}

export async function readMongo(db: Db): Promise<ReadResult> {
  const col = db.collection("heroes");
  const heroFullView = await avgReadMs(FORWARD_READS, async () => {
    await col.findOne({ _id: (1 + rnd(N)) as never });
  });
  const ownerToHeroes = await avgReadMs(BACKWARD_READS, (i) => mongoOwnerToHeroes(db, whaleIds[i % whaleCount]).then(() => {}));
  await col.dropIndex("ownerId_1");
  const ownerToHeroesNoIndex = await avgReadMs(BACKWARD_READS, (i) => mongoOwnerToHeroes(db, whaleIds[i % whaleCount]).then(() => {}));
  await col.createIndex({ ownerId: 1 }); // khôi phục state
  return { heroFullView, ownerToHeroes, ownerToHeroesNoIndex };
}

// ── LAYER 2 · schema evolution (giả định đã seed) ──
export async function migrateNorm(pool: Pool): Promise<MigrateRow> {
  // cleanup để re-run được
  await pool.query(`ALTER TABLE heroes DROP COLUMN IF EXISTS trait, DROP COLUMN IF EXISTS trait_lazy`);
  // Part A — đọc field trên data cũ → normalized chưa có cột → ERROR
  let fieldAbsent: "error" | "null" = "null";
  try {
    await pool.query(`SELECT trait FROM heroes LIMIT 1`);
  } catch {
    fieldAbsent = "error";
  }
  // đối chứng: nullable ADD COLUMN (PG 11+) = metadata-only
  const { ms: cheapDdlMs } = await timed(() => pool.query(`ALTER TABLE heroes ADD COLUMN trait_lazy text`));
  // Part B — rewrite DDL (NOT NULL + default per-row) → ACCESS EXCLUSIVE, đo dưới tải
  const underLoad = await pgMigrateUnderLoad(pool, `ALTER TABLE heroes ADD COLUMN trait text NOT NULL DEFAULT md5(random()::text)`);
  return { fieldAbsent, cheapDdlMs, underLoad };
}

export async function migrateJsonb(pool: Pool): Promise<MigrateRow> {
  await pool.query(`SELECT config->>'trait' AS t FROM heroes LIMIT 1`); // không lỗi → lazy OK
  const underLoad = await pgMigrateUnderLoad(pool, `UPDATE heroes SET config = config || '{"trait":"Steadfast"}'::jsonb`);
  return { fieldAbsent: "null", cheapDdlMs: null, underLoad };
}

export async function migrateMongo(db: Db): Promise<MigrateRow> {
  const col = db.collection("heroes");
  await col.findOne({ _id: (1 + rnd(N)) as never }); // field vắng → undefined, không lỗi
  const underLoad = await mongoMigrateUnderLoad(col, () => col.updateMany({}, { $set: { trait: "Steadfast" } }));
  return { fieldAbsent: "null", cheapDdlMs: null, underLoad };
}

// ── Guard: đảm bảo đã seed ──
export async function assertSeededPg(pool: Pool, label: string): Promise<boolean> {
  try {
    const r = await pool.query(`SELECT count(*)::int AS n FROM heroes`);
    if ((r.rows[0]?.n ?? 0) >= N) return true;
  } catch {
    /* table chưa tồn tại */
  }
  console.log(`  [${label}] chưa seed — chạy \`npm run demo:2:seed\` trước.`);
  return false;
}

export { ms };
