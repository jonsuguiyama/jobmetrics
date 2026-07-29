import { Redis } from "ioredis";

// Created lazily (not at module load) so importing pure helpers doesn't
// require REDIS_URL to be set - matches the pattern in db.ts.
let client: Redis | undefined;
function getClient(): Redis {
  if (!client) {
    if (!process.env.REDIS_URL) {
      throw new Error("Missing required environment variable: REDIS_URL");
    }
    client = new Redis(process.env.REDIS_URL);
  }
  return client;
}

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours, matches worker/src/redis.ts

// Mirrors worker/src/redis.ts's saveStatus - same Redis instance, same key
// format (a list, appended to) - so the Live Pipeline view shows real
// backend work from BOTH the web app (fetching postings, queuing) and the
// worker (scoring, saving), not just a client-side "search submitted" stand-in.
export async function savePipelineStatus(sessionId: string, statusText: string): Promise<void> {
  const key = `session:${sessionId}:status`;
  await getClient().rpush(key, JSON.stringify({ text: statusText, at: Date.now() }));
  await getClient().expire(key, SESSION_TTL_SECONDS);
}
