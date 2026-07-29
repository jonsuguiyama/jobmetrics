import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { throttle, __resetThrottleForTests } from "./rate-limiter.js";

beforeEach(() => {
  vi.useFakeTimers();
  __resetThrottleForTests();
});
afterEach(() => vi.useRealTimers());

describe("throttle", () => {
  it("runs the first call immediately", async () => {
    const fn = vi.fn().mockResolvedValue("a");
    const promise = throttle(fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(promise).resolves.toBe("a");
  });

  it("delays a second call by at least the minimum interval", async () => {
    const order: string[] = [];
    const first = throttle(async () => {
      order.push("first-start");
      return "a";
    });
    const second = throttle(async () => {
      order.push("second-start");
      return "b";
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["first-start"]);

    await vi.advanceTimersByTimeAsync(4199);
    expect(order).toEqual(["first-start"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(["first-start", "second-start"]);

    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
  });

  it("propagates a rejection to the caller instead of swallowing it", async () => {
    const promise = throttle(async () => {
      throw new Error("boom");
    });
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).rejects.toThrow("boom");
  });
});
