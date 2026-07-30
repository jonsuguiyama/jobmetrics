import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./config.js", () => ({
  config: {
    rabbitUrl: "amqp://user:pass@localhost:5672",
    queueName: "jobs-to-score",
    concurrency: 4
  }
}));

vi.mock("./websocket.js", () => ({
  broadcastStatus: vi.fn()
}));

function makeChannel() {
  return {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    prefetch: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(undefined),
    ack: vi.fn(),
    nack: vi.fn(),
    sendToQueue: vi.fn().mockReturnValue(true),
    checkQueue: vi.fn().mockResolvedValue(undefined)
  };
}

function makeConnection(channel: ReturnType<typeof makeChannel>) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    createChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockResolvedValue(undefined),
    __emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args)
  };
}

const connectMock = vi.fn();
vi.mock("amqplib", () => ({
  default: { connect: (...args: unknown[]) => connectMock(...args) }
}));

describe("queue", () => {
  let channel: ReturnType<typeof makeChannel>;
  let connection: ReturnType<typeof makeConnection>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    channel = makeChannel();
    connection = makeConnection(channel);
    connectMock.mockReset();
    connectMock.mockResolvedValue(connection);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("connects with a heartbeat query param and sets up the dead-letter topology", async () => {
    const { connectQueue } = await import("./queue.js");
    await connectQueue();

    expect(connectMock).toHaveBeenCalledTimes(1);
    const url = new URL(connectMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("heartbeat")).toBe("10");

    expect(channel.assertExchange).toHaveBeenCalledWith("jobs-dead-letter-exchange", "fanout", { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith("jobs-dead-letter", { durable: true });
    expect(channel.bindQueue).toHaveBeenCalledWith("jobs-dead-letter", "jobs-dead-letter-exchange", "");
    expect(channel.assertQueue).toHaveBeenCalledWith(
      "jobs-to-score",
      expect.objectContaining({ durable: true, deadLetterExchange: "jobs-dead-letter-exchange" })
    );
    expect(channel.prefetch).toHaveBeenCalledWith(4);
  });

  it("publishJob throws before a channel has ever been connected", async () => {
    const { publishJob } = await import("./queue.js");
    expect(() =>
      publishJob({ sessionId: "s1", resumeText: "resume", jobs: [] })
    ).toThrow("Queue channel not connected");
  });

  it("publishJob sends a persistent message to the queue once connected", async () => {
    const { connectQueue, publishJob } = await import("./queue.js");
    await connectQueue();

    const message = { sessionId: "s1", resumeText: "resume", jobs: [] };
    const result = publishJob(message);

    expect(result).toBe(true);
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      "jobs-to-score",
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
  });

  it("acks a message the handler processes successfully", async () => {
    const { connectQueue, consumeJobs } = await import("./queue.js");
    await connectQueue();

    const handler = vi.fn().mockResolvedValue(undefined);
    await consumeJobs(handler);

    const consumeCallback = channel.consume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    const message = {
      content: Buffer.from(JSON.stringify({ sessionId: "s1", resumeText: "r", jobs: [] })),
      properties: { headers: {} }
    };
    await consumeCallback(message);

    expect(handler).toHaveBeenCalledWith({ sessionId: "s1", resumeText: "r", jobs: [] });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("nacks with requeue=true when a failing message hasn't hit the retry limit", async () => {
    const { connectQueue, consumeJobs } = await import("./queue.js");
    await connectQueue();

    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    await consumeJobs(handler);

    const consumeCallback = channel.consume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    const message = {
      content: Buffer.from(JSON.stringify({ sessionId: "s1", resumeText: "r", jobs: [] })),
      properties: { headers: { "x-death": [{ count: 1 }] } }
    };
    await consumeCallback(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it("nacks with requeue=false once a failing message hits MAX_ATTEMPTS", async () => {
    const { connectQueue, consumeJobs } = await import("./queue.js");
    await connectQueue();

    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    await consumeJobs(handler);

    const consumeCallback = channel.consume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    const message = {
      content: Buffer.from(JSON.stringify({ sessionId: "s1", resumeText: "r", jobs: [] })),
      properties: { headers: { "x-death": [{ count: 3 }] } }
    };
    await consumeCallback(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });

  it("ignores a null message from the consumer callback", async () => {
    const { connectQueue, consumeJobs } = await import("./queue.js");
    await connectQueue();

    const handler = vi.fn();
    await consumeJobs(handler);

    const consumeCallback = channel.consume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
    await consumeCallback(null);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it("reconnects and re-registers the consumer when the connection closes", async () => {
    const { connectQueue, consumeJobs } = await import("./queue.js");
    await connectQueue();

    const handler = vi.fn();
    await consumeJobs(handler);
    expect(connectMock).toHaveBeenCalledTimes(1);

    const secondChannel = makeChannel();
    const secondConnection = makeConnection(secondChannel);
    connectMock.mockResolvedValueOnce(secondConnection);

    connection.__emit("close");
    await vi.advanceTimersByTimeAsync(5000);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(secondChannel.consume).toHaveBeenCalledTimes(1);
  });

  it("forces a reconnect when the health check probe times out", async () => {
    const { connectQueue } = await import("./queue.js");
    await connectQueue();

    // Health check fires every 1s but never resolves/rejects in this test,
    // simulating a hung connection - it should give up after the 5s timeout
    // and close the connection to trigger the existing reconnect path.
    channel.checkQueue.mockReturnValue(new Promise(() => undefined));

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);

    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it("forces a reconnect when the health check probe rejects", async () => {
    const { connectQueue } = await import("./queue.js");
    await connectQueue();

    channel.checkQueue.mockRejectedValueOnce(new Error("channel closed"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
