import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// config.ts's "import 'dotenv/config'" would otherwise re-populate process.env
// straight from worker/.env on every dynamic import below, silently undoing
// whatever this test just deleted before it gets a chance to matter.
vi.mock("dotenv/config", () => ({}));

const originalEnv = { ...process.env };

function setRequiredEnv() {
  process.env.RABBITMQ_URL = "amqp://localhost";
  process.env.REDIS_URL = "redis://localhost";
  process.env.GEMINI_API_KEY = "test-key";
}

describe("config", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws a clear error when a required env var is missing", async () => {
    setRequiredEnv();
    delete process.env.RABBITMQ_URL;

    await expect(import("./config.js")).rejects.toThrow(
      "Missing required environment variable: RABBITMQ_URL"
    );
  });

  it("builds config from env vars, with sensible defaults for optional ones", async () => {
    setRequiredEnv();
    delete process.env.WEBSOCKET_PORT;
    delete process.env.WORKER_CONCURRENCY;

    const { config } = await import("./config.js");

    expect(config.rabbitUrl).toBe("amqp://localhost");
    expect(config.redisUrl).toBe("redis://localhost");
    expect(config.geminiApiKey).toBe("test-key");
    expect(config.webSocketPort).toBe(8080);
    expect(config.concurrency).toBe(4);
    expect(config.queueName).toBe("jobs-to-score");
  });

  it("respects WEBSOCKET_PORT and WORKER_CONCURRENCY overrides", async () => {
    setRequiredEnv();
    process.env.WEBSOCKET_PORT = "9090";
    process.env.WORKER_CONCURRENCY = "8";

    const { config } = await import("./config.js");

    expect(config.webSocketPort).toBe(9090);
    expect(config.concurrency).toBe(8);
  });
});
