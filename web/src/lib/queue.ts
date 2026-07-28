import amqplib, { type ChannelModel, type Channel } from "amqplib";
import type { JobPosting } from "./github-jobs";

const QUEUE_NAME = "jobs-to-score";

let connection: ChannelModel | undefined;
let channel: Channel | undefined;

async function getChannel(): Promise<Channel> {
  if (channel) return channel;

  if (!process.env.RABBITMQ_URL) {
    throw new Error("Missing required environment variable: RABBITMQ_URL");
  }

  connection = await amqplib.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
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
