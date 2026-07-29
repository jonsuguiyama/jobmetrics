import { Redis } from "ioredis";
import { config } from "./config.js";
import type { JobResult } from "./types.js";

export const redis = new Redis(config.redisUrl);

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours, matches the README's stated window

function sessionResultsKey(sessionId: string): string {
  return `session:${sessionId}:results`;
}

export async function saveJobResult(sessionId: string, jobId: string, resultJson: string): Promise<void> {
  const key = sessionResultsKey(sessionId);
  await redis.hset(key, jobId, resultJson);
  await redis.expire(key, SESSION_TTL_SECONDS);
}

// Lets a WebSocket connection that's late (slow to connect) or reconnecting
// (dropped mid-search) catch up on whatever's already been scored, instead
// of only ever seeing results broadcast live after it happened to be open.
export async function getJobResults(sessionId: string): Promise<JobResult[]> {
  const hash = await redis.hgetall(sessionResultsKey(sessionId));
  return Object.values(hash).map((json) => JSON.parse(json) as JobResult);
}

function sessionStatusKey(sessionId: string): string {
  return `session:${sessionId}:status`;
}

// A pipeline status fires the instant RabbitMQ delivers the message, which
// is almost always faster than the browser's WebSocket handshake finishes
// - without persisting it, that status is silently lost every time and the
// live pipeline view never shows it. Appended to a list (not overwritten)
// so a late-connecting or reconnecting client replays the FULL sequence of
// stages, not just whichever one happened to be broadcast most recently.
export async function saveStatus(sessionId: string, statusText: string, at: number): Promise<void> {
  const key = sessionStatusKey(sessionId);
  await redis.rpush(key, JSON.stringify({ text: statusText, at }));
  await redis.expire(key, SESSION_TTL_SECONDS);
}

export async function getStatusHistory(sessionId: string): Promise<Array<{ text: string; at: number }>> {
  const raw = await redis.lrange(sessionStatusKey(sessionId), 0, -1);
  return raw.map((json) => JSON.parse(json) as { text: string; at: number });
}
