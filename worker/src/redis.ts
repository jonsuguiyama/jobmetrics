import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl);

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours, matches the README's stated window

export async function saveJobResult(sessionId: string, jobId: string, resultJson: string): Promise<void> {
  const key = `session:${sessionId}:results`;
  await redis.hset(key, jobId, resultJson);
  await redis.expire(key, SESSION_TTL_SECONDS);
}
