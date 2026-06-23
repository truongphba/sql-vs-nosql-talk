import pg from "pg";
import { env } from "../lib/env";

// Pool cho Postgres. max cao để 100 request concurrent không phải xếp hàng quá lâu
// (đủ để race condition lộ ra ở approach naive).
export function makePool(max = 50): pg.Pool {
  return new pg.Pool({ connectionString: env.pgUrl, max });
}
