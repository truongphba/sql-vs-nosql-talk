import Redis from "ioredis";
import { env } from "../lib/env";

export function makeRedis(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}
