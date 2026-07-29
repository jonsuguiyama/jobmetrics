import amqplib, { type ChannelModel, type ConfirmChannel } from "amqplib";
import type { JobPosting } from "./github-jobs";

const QUEUE_NAME = "jobs-to-score";
// Must match worker/src/queue.ts exactly - RabbitMQ rejects a queue
// re-declaration whose arguments don't match the queue's original ones
// (406 PRECONDITION-FAILED) instead of silently reconciling them.
const DEAD_LETTER_EXCHANGE = "jobs-dead-letter-exchange";
const HEARTBEAT_SECONDS = 10;

let connection: ChannelModel | undefined;
let channel: ConfirmChannel | undefined;

function withHeartbeat(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("heartbeat", String(HEARTBEAT_SECONDS));
  return parsed.toString();
}

// A serverless function instance can sit warm for a long time between
// requests - long enough for CloudAMQP's free-tier connection to go stale
// underneath a cached channel with no signal beyond the next send silently
// going nowhere. Clearing the cache on close/error forces the next call to
// open a fresh connection instead of reusing a dead one indefinitely.
async function getChannel(): Promise<ConfirmChannel> {
  if (channel) return channel;

  if (!process.env.RABBITMQ_URL) {
    throw new Error("Missing required environment variable: RABBITMQ_URL");
  }

  connection = await amqplib.connect(withHeartbeat(process.env.RABBITMQ_URL));
  connection.on("error", (error) => console.error("RabbitMQ connection error:", error));
  connection.on("close", () => {
    connection = undefined;
    channel = undefined;
  });

  channel = await connection.createConfirmChannel();
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE
  } as Record<string, unknown>);
  return channel;
}

export type JobToScore = {
  jobId: string;
  jobTitle: string;
  jobSource: string;
  jobText: string;
  jobUrl: string;
};

// Must match worker/src/types.ts's SessionScoreMessage - one message per
// search session, not per job, so the worker can score every job posting in
// a single LLM call instead of one call per job.
export type SessionScoreMessage = {
  sessionId: string;
  resumeText: string;
  jobs: JobToScore[];
};

export async function publishJobsForScoring(
  sessionId: string,
  resumeText: string,
  jobs: JobPosting[]
): Promise<void> {
  const ch = await getChannel();

  const message: SessionScoreMessage = {
    sessionId,
    resumeText,
    jobs: jobs.map((job) => ({
      jobId: job.id,
      jobTitle: job.title,
      jobSource: job.repo,
      jobText: job.body,
      jobUrl: job.url
    }))
  };

  ch.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(message)), { persistent: true });

  // sendToQueue only buffers locally - without waiting for the broker's ack,
  // a stale/dead connection would swallow the message with no error and the
  // caller would think the job was queued when it never left this process.
  await ch.waitForConfirms();
}
