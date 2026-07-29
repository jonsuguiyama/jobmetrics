import { getSql } from "./db";

export const DAILY_SEARCH_LIMIT = 5;

export type RateLimitDecision = {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
};

// Pure decision logic, kept separate from the DB read/write below so it can
// be unit tested without a database.
export function decideRateLimit(currentCount: number, limit: number = DAILY_SEARCH_LIMIT): RateLimitDecision {
  const used = Math.max(0, currentCount);
  return {
    allowed: used < limit,
    used,
    remaining: Math.max(0, limit - used),
    limit
  };
}

// Read-only check against today's count - does NOT increment. Used to gate
// expensive work (GitHub fetch, queue publish) before it happens, without
// charging the user's quota for a search that hasn't actually run yet.
export async function checkRateLimit(userId: string): Promise<RateLimitDecision> {
  const sql = getSql();
  const [row] = (await sql`
    SELECT search_count FROM search_counters WHERE user_id = ${userId} AND search_date = CURRENT_DATE
  `) as Array<{ search_count: number }>;

  return decideRateLimit(row?.search_count ?? 0);
}

// Only call once a search has actually been queued successfully - a failure
// on our end (a bug, a downstream outage) must never cost the user one of
// their daily searches.
export async function incrementSearchCount(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO search_counters (user_id, search_date, search_count)
    VALUES (${userId}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, search_date)
    DO UPDATE SET search_count = search_counters.search_count + 1
  `;
}
