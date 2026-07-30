import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./config.js", () => ({
  config: { redisUrl: "redis://localhost:6379" }
}));

const redisInstance = {
  hset: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  rpush: vi.fn().mockResolvedValue(1),
  lrange: vi.fn().mockResolvedValue([])
};

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(function Redis() {
    return redisInstance;
  })
}));

describe("worker redis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveJobResult hashes the result under the session key and sets a TTL", async () => {
    const { saveJobResult } = await import("./redis.js");
    await saveJobResult("session-1", "job-1", '{"score":80}');

    expect(redisInstance.hset).toHaveBeenCalledWith("session:session-1:results", "job-1", '{"score":80}');
    expect(redisInstance.expire).toHaveBeenCalledWith("session:session-1:results", 60 * 60 * 2);
  });

  it("getJobResults parses every stored value back into an object", async () => {
    redisInstance.hgetall.mockResolvedValueOnce({
      "job-1": '{"jobId":"job-1","score":80}',
      "job-2": '{"jobId":"job-2","score":50}'
    });

    const { getJobResults } = await import("./redis.js");
    const results = await getJobResults("session-1");

    expect(redisInstance.hgetall).toHaveBeenCalledWith("session:session-1:results");
    expect(results).toEqual([
      { jobId: "job-1", score: 80 },
      { jobId: "job-2", score: 50 }
    ]);
  });

  it("getJobResults returns an empty array for a session with nothing scored yet", async () => {
    redisInstance.hgetall.mockResolvedValueOnce({});

    const { getJobResults } = await import("./redis.js");
    const results = await getJobResults("session-empty");

    expect(results).toEqual([]);
  });

  it("saveStatus appends to a list (not overwrite) and sets a TTL", async () => {
    const { saveStatus } = await import("./redis.js");
    await saveStatus("session-1", "Queued for scoring", 1700000000000);

    expect(redisInstance.rpush).toHaveBeenCalledWith(
      "session:session-1:status",
      JSON.stringify({ text: "Queued for scoring", at: 1700000000000 })
    );
    expect(redisInstance.expire).toHaveBeenCalledWith("session:session-1:status", 60 * 60 * 2);
  });

  it("getStatusHistory returns the full replayed sequence in order", async () => {
    redisInstance.lrange.mockResolvedValueOnce([
      JSON.stringify({ text: "Found jobs", at: 1 }),
      JSON.stringify({ text: "Queued", at: 2 })
    ]);

    const { getStatusHistory } = await import("./redis.js");
    const history = await getStatusHistory("session-1");

    expect(redisInstance.lrange).toHaveBeenCalledWith("session:session-1:status", 0, -1);
    expect(history).toEqual([
      { text: "Found jobs", at: 1 },
      { text: "Queued", at: 2 }
    ]);
  });
});
