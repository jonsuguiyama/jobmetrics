import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { JobPosting } from "./github-jobs";

function makeChannel() {
  return {
    assertQueue: vi.fn().mockResolvedValue(undefined),
    sendToQueue: vi.fn().mockReturnValue(true),
    waitForConfirms: vi.fn().mockResolvedValue(undefined)
  };
}

function makeConnection(channel: ReturnType<typeof makeChannel>) {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    __emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args)
  };
}

const connectMock = vi.fn();
vi.mock("amqplib", () => ({
  default: { connect: (...args: unknown[]) => connectMock(...args) }
}));

const jobs: JobPosting[] = [
  { id: "job-1", title: "Frontend dev", body: "React role text", url: "https://x/1", repo: "frontendbr/vagas" }
];

describe("web queue", () => {
  let channel: ReturnType<typeof makeChannel>;
  let connection: ReturnType<typeof makeConnection>;
  const originalUrl = process.env.RABBITMQ_URL;

  beforeEach(async () => {
    vi.resetModules();
    process.env.RABBITMQ_URL = "amqps://user:pass@rabbit.example.com/vhost";
    channel = makeChannel();
    connection = makeConnection(channel);
    connectMock.mockReset();
    connectMock.mockResolvedValue(connection);
  });

  afterAll(() => {
    process.env.RABBITMQ_URL = originalUrl;
  });

  it("throws when RABBITMQ_URL is not configured", async () => {
    delete process.env.RABBITMQ_URL;
    const { publishJobsForScoring } = await import("./queue.js");

    await expect(publishJobsForScoring("s1", "resume", jobs)).rejects.toThrow(
      "Missing required environment variable: RABBITMQ_URL"
    );
  });

  it("connects with a heartbeat query param and opens a confirm channel", async () => {
    const { publishJobsForScoring } = await import("./queue.js");
    await publishJobsForScoring("s1", "resume", jobs);

    const url = new URL(connectMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("heartbeat")).toBe("10");
    expect(connection.createConfirmChannel).toHaveBeenCalledTimes(1);
    expect(channel.assertQueue).toHaveBeenCalledWith(
      "jobs-to-score",
      expect.objectContaining({ durable: true, deadLetterExchange: "jobs-dead-letter-exchange" })
    );
  });

  it("maps job postings to the wire format and waits for the broker's confirm", async () => {
    const { publishJobsForScoring } = await import("./queue.js");
    await publishJobsForScoring("session-1", "my resume text", jobs);

    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    const [queueName, buffer, options] = channel.sendToQueue.mock.calls[0];
    expect(queueName).toBe("jobs-to-score");
    expect(options).toEqual({ persistent: true });

    const message = JSON.parse(buffer.toString());
    expect(message).toEqual({
      sessionId: "session-1",
      resumeText: "my resume text",
      jobs: [{ jobId: "job-1", jobTitle: "Frontend dev", jobSource: "frontendbr/vagas", jobText: "React role text", jobUrl: "https://x/1" }]
    });
    expect(channel.waitForConfirms).toHaveBeenCalledTimes(1);
  });

  it("reuses the same connection across multiple publishes instead of reconnecting", async () => {
    const { publishJobsForScoring } = await import("./queue.js");
    await publishJobsForScoring("s1", "resume", jobs);
    await publishJobsForScoring("s2", "resume", jobs);

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(2);
  });

  it("retries once on a fresh connection if the first publish attempt fails", async () => {
    channel.waitForConfirms.mockRejectedValueOnce(new Error("connection reset"));

    const secondChannel = makeChannel();
    const secondConnection = makeConnection(secondChannel);
    connectMock.mockResolvedValueOnce(connection).mockResolvedValueOnce(secondConnection);

    const { publishJobsForScoring } = await import("./queue.js");
    await publishJobsForScoring("s1", "resume", jobs);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
    expect(secondChannel.sendToQueue).toHaveBeenCalledTimes(1);
    expect(secondChannel.waitForConfirms).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error if the retry also fails, instead of retrying forever", async () => {
    channel.waitForConfirms.mockRejectedValue(new Error("still down"));

    const { publishJobsForScoring } = await import("./queue.js");
    await expect(publishJobsForScoring("s1", "resume", jobs)).rejects.toThrow("still down");

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("reconnects on the next publish after the connection closes", async () => {
    const { publishJobsForScoring } = await import("./queue.js");
    await publishJobsForScoring("s1", "resume", jobs);
    expect(connectMock).toHaveBeenCalledTimes(1);

    connection.__emit("close");

    const secondChannel = makeChannel();
    connectMock.mockResolvedValueOnce(makeConnection(secondChannel));
    await publishJobsForScoring("s2", "resume", jobs);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(secondChannel.sendToQueue).toHaveBeenCalledTimes(1);
  });
});
