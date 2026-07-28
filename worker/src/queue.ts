import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from "amqplib";
import { config } from "./config.js";
import type { JobMessage } from "./types.js";

const DEAD_LETTER_EXCHANGE = "jobs-dead-letter-exchange";
const DEAD_LETTER_QUEUE = "jobs-dead-letter";
const MAX_ATTEMPTS = 3;

let connection: ChannelModel | undefined;
let channel: Channel | undefined;

export async function connectQueue(): Promise<Channel> {
  connection = await amqplib.connect(config.rabbitUrl);
  channel = await connection.createChannel();

  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "fanout", { durable: true });
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, "");

  await channel.assertQueue(config.queueName, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE
  } as Record<string, unknown>);

  await channel.prefetch(config.concurrency);
  return channel;
}

function getAttemptCount(message: ConsumeMessage): number {
  const headers = message.properties.headers ?? {};
  const xDeath = headers["x-death"] as Array<{ count?: number }> | undefined;
  return xDeath?.[0]?.count ?? 0;
}

export async function consumeJobs(handler: (job: JobMessage) => Promise<void>): Promise<void> {
  if (!channel) throw new Error("Queue channel not connected - call connectQueue() first");

  await channel.consume(config.queueName, async (message) => {
    if (!message) return;

    try {
      const job = JSON.parse(message.content.toString()) as JobMessage;
      await handler(job);
      channel!.ack(message);
    } catch (error) {
      const attempts = getAttemptCount(message);
      const shouldRetry = attempts < MAX_ATTEMPTS;
      // requeue=false lets the dead-letter-exchange binding catch it after
      // MAX_ATTEMPTS retries, instead of looping forever on a bad message.
      channel!.nack(message, false, shouldRetry);
      console.error(`Job failed (attempt ${attempts + 1}/${MAX_ATTEMPTS}):`, error);
    }
  });
}

export function publishJob(job: JobMessage): boolean {
  if (!channel) throw new Error("Queue channel not connected - call connectQueue() first");
  return channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(job)), {
    persistent: true
  });
}
