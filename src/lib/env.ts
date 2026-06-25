// Load .env (Node 20.12+/24). Có default khớp docker-compose host port lệch.
try {
  process.loadEnvFile();
} catch {
  /* .env optional — dùng default bên dưới */
}

const env = {
  pgUrl: process.env.PG_URL ?? "postgres://game:game@localhost:55432/gamedb",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:56379",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:57017",
  mongoDb: process.env.MONGO_DB ?? "gamedb",
  clickhouseUrl: process.env.CLICKHOUSE_URL ?? "http://localhost:58123",
  clickhouseUser: process.env.CLICKHOUSE_USER ?? "game",
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD ?? "game",
  scyllaContactPoints: (process.env.SCYLLA_CONTACT_POINTS ?? "localhost:59042").split(","),
  scyllaLocalDc: process.env.SCYLLA_LOCAL_DC ?? "datacenter1",
  scyllaKeyspace: process.env.SCYLLA_KEYSPACE ?? "gamedb",
} as const;

export { env };
