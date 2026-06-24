import { Client } from "cassandra-driver";
import { env } from "../lib/env";

// ScyllaDB (CQL, Cassandra-compatible) — dùng chính `cassandra-driver` của DataStax.
// keyspace optional: bỏ trống để tạo keyspace lần đầu, rồi connect lại có keyspace.
export function makeScylla(keyspace?: string): Client {
  const [host, port] = env.scyllaContactPoints[0]!.split(":");
  return new Client({
    contactPoints: [host],
    protocolOptions: { port: Number(port ?? 9042) },
    localDataCenter: env.scyllaLocalDc,
    keyspace,
  });
}
