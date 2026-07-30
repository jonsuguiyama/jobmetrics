import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const redisInstance = {
  rpush: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1)
};

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(function Redis() {
    return redisInstance;
  })
}));

describe("web redis", () => {
  const originalUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    process.env.REDIS_URL = originalUrl;
  });

  it("appends the status to a per-session list and sets a TTL", async () => {
    const { savePipelineStatus } = await import("./redis.js");
    await savePipelineStatus("session-1", "Queued for scoring via RabbitMQ");

    expect(redisInstance.rpush).toHaveBeenCalledTimes(1);
    const [key, payload] = redisInstance.rpush.mock.calls[0];
    expect(key).toBe("session:session-1:status");
    expect(JSON.parse(payload)).toMatchObject({ text: "Queued for scoring via RabbitMQ" });
    expect(typeof JSON.parse(payload).at).toBe("number");

    expect(redisInstance.expire).toHaveBeenCalledWith("session:session-1:status", 60 * 60 * 2);
  });

  it("throws a clear error when REDIS_URL is not configured", async () => {
    delete process.env.REDIS_URL;
    vi.resetModules();
    const { savePipelineStatus } = await import("./redis.js");

    await expect(savePipelineStatus("session-1", "status")).rejects.toThrow(
      "Missing required environment variable: REDIS_URL"
    );
  });
});
