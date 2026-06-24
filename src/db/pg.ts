import pg from "pg";
import { env } from "../lib/env";

export const pgDbs = {
  default: "gamedb",
  norm: "gamedb_norm",
  jsonb: "gamedb_jsonb",
} as const;

export function pgUrlForDb(dbName: string): string {
  const url = new URL(env.pgUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

// Pool cho Postgres. max cao để 100 request concurrent không phải xếp hàng quá lâu
// (đủ để race condition lộ ra ở approach naive).
export function makePool(max = 50): pg.Pool {
  return new pg.Pool({ connectionString: env.pgUrl, max });
}

export function makePoolForDb(dbName: string, max = 50): pg.Pool {
  return new pg.Pool({ connectionString: pgUrlForDb(dbName), max });
}

/** Tạo DB nếu chưa có — hữu ích khi volume Postgres cũ chưa chạy init script. */
export async function ensurePgDatabase(dbName: string): Promise<void> {
  const admin = makePoolForDb("postgres", 2);
  try {
    const r = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (r.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}
