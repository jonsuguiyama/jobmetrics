import amqplib, { type ChannelModel, type Channel } from "amqplib";
import type { JobPosting } from "./github-jobs";

const QUEUE_NAME = "jobs-to-score";
// Must match worker/src/queue.ts exactly - RabbitMQ rejects a queue
// re-declaration whose arguments don't match the queue's original ones
// (406 PRECONDITION-FAILED) instead of silently reconciling them.
const DEAD_LETTER_EXCHANGE = "jobs-dead-letter-exchange";

let connection: ChannelModel | undefined;
let channel: Channel | undefined;

async function getChannel(): Promise<Channel> {
  if (channel) return channel;

  if (!process.env.RABBITMQ_URL) {
    throw new Error("Missing required environment variable: RABBITMQ_URL");
  }

  connection = await amqplib.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE
  } as Record<string, unknown>);
  return channel;
}

export type JobMessage = {
  sessionId: string;
  jobId: string;
  jobTitle: string;
  jobSource: string;
  jobText: string;
  resumeText: string;
};

export async function publishJobsForScoring(
  sessionId: string,
  resumeText: string,
  jobs: JobPosting[]
): Promise<void> {
  const ch = await getChannel();

  for (const job of jobs) {
    const message: JobMessage = {
      sessionId,
      jobId: job.id,
      jobTitle: job.title,
      jobSource: job.repo,
      jobText: job.body,
      resumeText
    };

    ch.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(message)), { persistent: true });
  }
}
