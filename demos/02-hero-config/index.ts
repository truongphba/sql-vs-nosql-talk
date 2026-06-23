// Demo 2 — Hero / building / item config
// Config nested, evolve nhanh. So sánh: PostgreSQL normalized · PostgreSQL JSONB · MongoDB
import type { Pool } from "pg";
import type { Db } from "mongodb";
import { makePool } from "../../src/db/pg";
import { makeMongo } from "../../src/db/mongo";
import { printTable, dim, title } from "../../src/lib/table";
import { timed, ms } from "../../src/lib/timer";

const N = 10_000; // số hero
const READS = 100; // số lần đọc nguyên 1 hero để lấy avg

const SKILLS = ["Fireball", "Slash", "Heal", "Shield", "Poison", "Thunder", "Frost", "Drain"];
const RARITY = ["R", "SR", "SSR", "UR"];
const TYPES = ["Tank", "AP", "AD", "Support"];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (n: number) => Math.floor(Math.random() * n);

type Hero = {
  id: number;
  name: string;
  ownerId: number;
  rarity: string;
  type: string;
  stats: { atk: number; def: number; hp: number };
  skills: { name: string; dmg: number }[];
};

function genHeroes(n: number): Hero[] {
  const out: Hero[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      id: i,
      name: `Hero_${i}`,
      ownerId: 1 + rnd(2000),
      rarity: pick(RARITY),
      type: pick(TYPES),
      stats: { atk: 10 + rnd(90), def: 10 + rnd(90), hp: 100 + rnd(900) },
      skills: Array.from({ length: 3 }, () => ({ name: pick(SKILLS), dmg: 10 + rnd(90) })),
    });
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Row = { insert: number; nested: number; read: number };

// ── PostgreSQL normalized — heroes + hero_skills, query = JOIN ─────
async function pgNormalized(pool: Pool, heroes: Hero[]): Promise<Row> {
  await pool.query(`DROP TABLE IF EXISTS hero_skills, heroes`);
  await pool.query(`CREATE TABLE heroes (
    id int PRIMARY KEY, name text, owner_id int, rarity text, type text,
    atk int, def int, hp int)`);
  await pool.query(`CREATE TABLE hero_skills (
    hero_id int REFERENCES heroes(id), name text, dmg int)`);

  const { ms: insert } = await timed(async () => {
    for (const part of chunk(heroes, 1000)) {
      const vals: string[] = [];
      const ps: unknown[] = [];
      part.forEach((h, k) => {
        const b = k * 8;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
        ps.push(h.id, h.name, h.ownerId, h.rarity, h.type, h.stats.atk, h.stats.def, h.stats.hp);
      });
      await pool.query(
        `INSERT INTO heroes (id,name,owner_id,rarity,type,atk,def,hp) VALUES ${vals.join(",")}`,
        ps,
      );
    }
    const skillRows = heroes.flatMap((h) => h.skills.map((s) => [h.id, s.name, s.dmg] as const));
    for (const part of chunk(skillRows, 1000)) {
      const vals: string[] = [];
      const ps: unknown[] = [];
      part.forEach((s, k) => {
        const b = k * 3;
        vals.push(`($${b + 1},$${b + 2},$${b + 3})`);
        ps.push(s[0], s[1], s[2]);
      });
      await pool.query(`INSERT INTO hero_skills (hero_id,name,dmg) VALUES ${vals.join(",")}`, ps);
    }
  });

  await pool.query(`CREATE INDEX ON hero_skills (name)`);
  await pool.query(`CREATE INDEX ON heroes (rarity)`);

  // nested: tìm hero có skill 'Fireball' → JOIN
  const { ms: nested } = await timed(() =>
    pool.query(
      `SELECT count(DISTINCT h.id) FROM heroes h JOIN hero_skills s ON s.hero_id=h.id WHERE s.name='Fireball'`,
    ),
  );
  // đọc nguyên 1 hero đầy đủ → JOIN + aggregate
  const { ms: read } = await timed(async () => {
    for (let i = 0; i < READS; i++) {
      const id = 1 + rnd(N);
      await pool.query(
        `SELECT h.*, json_agg(json_build_object('name',s.name,'dmg',s.dmg)) AS skills
         FROM heroes h JOIN hero_skills s ON s.hero_id=h.id WHERE h.id=$1 GROUP BY h.id`,
        [id],
      );
    }
  });
  return { insert, nested, read: read / READS };
}

// ── PostgreSQL JSONB — 1 bảng, config JSONB + GIN ─────────────────
async function pgJsonb(pool: Pool, heroes: Hero[]): Promise<Row> {
  await pool.query(`DROP TABLE IF EXISTS heroes_jsonb`);
  await pool.query(`CREATE TABLE heroes_jsonb (
    id int PRIMARY KEY, name text, owner_id int, config jsonb)`);

  const { ms: insert } = await timed(async () => {
    for (const part of chunk(heroes, 1000)) {
      const vals: string[] = [];
      const ps: unknown[] = [];
      part.forEach((h, k) => {
        const b = k * 4;
        vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4}::jsonb)`);
        ps.push(h.id, h.name, h.ownerId, JSON.stringify({ rarity: h.rarity, type: h.type, stats: h.stats, skills: h.skills }));
      });
      await pool.query(`INSERT INTO heroes_jsonb (id,name,owner_id,config) VALUES ${vals.join(",")}`, ps);
    }
  });

  await pool.query(`CREATE INDEX ON heroes_jsonb USING gin (config)`);

  const { ms: nested } = await timed(() =>
    pool.query(`SELECT count(*) FROM heroes_jsonb WHERE config @> '{"skills":[{"name":"Fireball"}]}'`),
  );
  const { ms: read } = await timed(async () => {
    for (let i = 0; i < READS; i++) {
      const id = 1 + rnd(N);
      await pool.query(`SELECT config FROM heroes_jsonb WHERE id=$1`, [id]);
    }
  });
  return { insert, nested, read: read / READS };
}

// ── MongoDB — document tự nhiên ───────────────────────────────────
async function mongoDoc(db: Db, heroes: Hero[]): Promise<Row> {
  const col = db.collection("heroes");
  await col.drop().catch(() => {});

  const docs = heroes.map((h) => ({ _id: h.id as never, name: h.name, ownerId: h.ownerId, rarity: h.rarity, type: h.type, stats: h.stats, skills: h.skills }));
  const { ms: insert } = await timed(async () => {
    await col.insertMany(docs, { ordered: false });
  });

  await col.createIndex({ "skills.name": 1 });

  const { ms: nested } = await timed(() => col.countDocuments({ "skills.name": "Fireball" }));
  const { ms: read } = await timed(async () => {
    for (let i = 0; i < READS; i++) {
      const id = 1 + rnd(N);
      await col.findOne({ _id: id as never });
    }
  });
  return { insert, nested, read: read / READS };
}

async function main(): Promise<void> {
  const pool = makePool(10);
  const { client, db } = await makeMongo();
  try {
    title(`DEMO 2 — Hero config · seed ${N.toLocaleString()} hero · so sánh 3 approach`);
    const heroes = genHeroes(N);
    const norm = await pgNormalized(pool, heroes);
    const jsonb = await pgJsonb(pool, heroes);
    const mongo = await mongoDoc(db, heroes);

    const s = (n: number) => `${(n / 1000).toFixed(2)}s`;
    printTable(
      ["OPERATION", "PG NORMALIZED", "PG JSONB", "MONGODB"],
      [
        [`Insert ${N / 1000}K`, s(norm.insert), s(jsonb.insert), s(mongo.insert)],
        ["Query nested (skill)", ms(norm.nested), ms(jsonb.nested), ms(mongo.nested)],
        ["Read 1 full hero (avg)", ms(norm.read), ms(jsonb.read), ms(mongo.read)],
      ],
    );
    console.log(dim("\n* Performance không chênh nhiều ở scale này — điểm khác biệt thật là schema evolution + team velocity.\n"));
  } finally {
    await pool.end();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
