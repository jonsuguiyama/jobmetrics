import { getSql } from "./db";

export const DAILY_SEARCH_LIMIT = 3;

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

// Atomically increments today's counter for a user and returns whether this
// search is allowed. Protects the shared Gemini/CloudAMQP free-tier quotas
// from being drained by a single user.
export async function checkAndIncrementRateLimit(userId: string): Promise<RateLimitDecision> {
  const sql = getSql();
  const [row] = (await sql`
    INSERT INTO search_counters (user_id, search_date, search_count)
    VALUES (${userId}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, search_date)
    DO UPDATE SET search_count = search_counters.search_count + 1
    RETURNING search_count
  `) as Array<{ search_count: number }>;

  // The increment above already happened - if it pushed the count past the
  // limit, this search itself should still be rejected, so check against
  // count - 1 (the value before this attempt) to decide.
  return decideRateLimit(row.search_count - 1);
}
