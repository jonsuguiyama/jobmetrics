import { describe, it, expect } from "vitest";
import { decideRateLimit, DAILY_SEARCH_LIMIT } from "./rate-limit";

describe("decideRateLimit", () => {
  it("allows a search when under the limit", () => {
    const decision = decideRateLimit(0);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(DAILY_SEARCH_LIMIT);
  });

  it("allows the last search right at the boundary", () => {
    const decision = decideRateLimit(DAILY_SEARCH_LIMIT - 1);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1);
  });

  it("blocks once the count reaches the limit", () => {
    const decision = decideRateLimit(DAILY_SEARCH_LIMIT);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("blocks and floors remaining at 0 when over the limit", () => {
    const decision = decideRateLimit(DAILY_SEARCH_LIMIT + 5);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("treats a negative count as zero instead of granting extra allowance", () => {
    const decision = decideRateLimit(-3);
    expect(decision.used).toBe(0);
    expect(decision.allowed).toBe(true);
  });

  it("respects a custom limit override", () => {
    expect(decideRateLimit(5, 10).allowed).toBe(true);
    expect(decideRateLimit(10, 10).allowed).toBe(false);
  });
});
