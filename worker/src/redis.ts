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

// TEMPORARY DEBUG: the "worker picked up your job" status fires the instant
// RabbitMQ delivers the message, which is almost always faster than the
// browser's WebSocket handshake finishes - without persisting it, that
// status is silently lost every time and the debug panel never shows it.
export async function saveStatus(sessionId: string, statusText: string, at: number): Promise<void> {
  const key = sessionStatusKey(sessionId);
  await redis.set(key, JSON.stringify({ text: statusText, at }), "EX", SESSION_TTL_SECONDS);
}

export async function getStatus(sessionId: string): Promise<{ text: string; at: number } | null> {
  const raw = await redis.get(sessionStatusKey(sessionId));
  return raw ? JSON.parse(raw) : null;
}
