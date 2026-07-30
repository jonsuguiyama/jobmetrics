import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { decideRateLimit, DAILY_SEARCH_LIMIT } from "./rate-limit";

const sqlMock = vi.fn();
vi.mock("./db", () => ({ getSql: () => sqlMock }));

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

describe("isOwner", () => {
  const original = process.env.OWNER_EMAIL;
  afterAll(() => {
    process.env.OWNER_EMAIL = original;
  });

  it("is true only for the exact configured owner email", async () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    const { isOwner } = await import("./rate-limit");

    expect(isOwner("owner@example.com")).toBe(true);
    expect(isOwner("someone-else@example.com")).toBe(false);
  });

  it("is false for everyone when OWNER_EMAIL isn't configured", async () => {
    delete process.env.OWNER_EMAIL;
    const { isOwner } = await import("./rate-limit");

    expect(isOwner("owner@example.com")).toBe(false);
  });
});

describe("checkRateLimit / incrementSearchCount", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("checkRateLimit treats no row for today as zero searches used", async () => {
    sqlMock.mockResolvedValue([]);
    const { checkRateLimit } = await import("./rate-limit");

    const decision = await checkRateLimit("user-1");

    expect(decision).toEqual({ allowed: true, used: 0, remaining: DAILY_SEARCH_LIMIT, limit: DAILY_SEARCH_LIMIT });
  });

  it("checkRateLimit reflects today's stored count", async () => {
    sqlMock.mockResolvedValue([{ search_count: DAILY_SEARCH_LIMIT }]);
    const { checkRateLimit } = await import("./rate-limit");

    const decision = await checkRateLimit("user-1");

    expect(decision.allowed).toBe(false);
    expect(decision.used).toBe(DAILY_SEARCH_LIMIT);
  });

  it("incrementSearchCount issues an upsert against today's counter", async () => {
    sqlMock.mockResolvedValue([]);
    const { incrementSearchCount } = await import("./rate-limit");

    await incrementSearchCount("user-1");

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
