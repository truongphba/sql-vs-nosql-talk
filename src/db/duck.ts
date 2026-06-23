import { DuckDBInstance } from "@duckdb/node-api";

// DuckDB in-process, in-memory. Trả về connection.
export async function makeDuck() {
  const instance = await DuckDBInstance.create(":memory:");
  return instance.connect();
}
