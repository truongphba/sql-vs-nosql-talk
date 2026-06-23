// Load .env (Node 20.12+/24). Có default khớp docker-compose host port lệch.
try {
  process.loadEnvFile();
} catch {
  /* .env optional — dùng default bên dưới */
}

export const env = {
  pgUrl: process.env.PG_URL ?? "postgres://pixi:pixi@localhost:55432/pixiland",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:56379",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:57017",
  mongoDb: process.env.MONGO_DB ?? "pixiland",
};
