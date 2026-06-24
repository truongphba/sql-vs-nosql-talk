import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { env } from "../lib/env";

// ClickHouse — OLAP columnar server. Demo 4. DataGrip nối qua HTTP 8123 / native 9000.
export function makeClickhouse(): ClickHouseClient {
  return createClient({ url: env.clickhouseUrl, username: env.clickhouseUser, password: env.clickhousePassword });
}
