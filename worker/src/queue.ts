import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from "amqplib";
import { config } from "./config.js";
import { broadcastStatus } from "./websocket.js";
import type { SessionScoreMessage } from "./types.js";

const DEAD_LETTER_EXCHANGE = "jobs-dead-letter-exchange";
const DEAD_LETTER_QUEUE = "jobs-dead-letter";
const MAX_ATTEMPTS = 3;

const RECONNECT_DELAY_MS = 5_000;
// A worker sitting idle for a while (typical between test searches) can
// have its TCP connection silently dropped by a NAT/firewall in between,
// with neither side noticing until the next send/receive hangs - this
// heartbeat lets both ends detect a dead connection quickly instead of
// only ever working right after a manual restart.
const HEARTBEAT_SECONDS = 10;

// Passive heartbeat detection still needs ~2 missed heartbeats before
// amqplib gives up on a connection. This actively probes the connection on
// a short cycle instead of only waiting on that, so a dead connection gets
// caught and replaced in seconds, not tens of seconds.
const HEALTH_CHECK_INTERVAL_MS = 1_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

let connection: ChannelModel | undefined;
let channel: Channel | undefined;
let currentHandler: ((sessionMessage: SessionScoreMessage) => Promise<void>) | undefined;

function withHeartbeat(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("heartbeat", String(HEARTBEAT_SECONDS));
  return parsed.toString();
}

async function setUpChannel(): Promise<Channel> {
  connection = await amqplib.connect(withHeartbeat(config.rabbitUrl));

  connection.on("error", (error) => console.error("RabbitMQ connection error:", error));
  connection.on("close", () => {
    console.error("RabbitMQ connection closed - reconnecting...");
    channel = undefined;
    setTimeout(() => {
      setUpChannel()
        .then(() => {
          if (currentHandler) return registerConsumer(currentHandler);
          return undefined;
        })
        .catch((error) => console.error("Reconnect to RabbitMQ failed:", error));
    }, RECONNECT_DELAY_MS);
  });

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

function forceReconnect(reason: string, error?: unknown): void {
  console.error(`RabbitMQ health check: ${reason} - forcing reconnect`, error ?? "");
  // Closing the connection triggers setUpChannel's "close" handler, which
  // already knows how to reconnect and re-register the consumer.
  connection?.close().catch(() => undefined);
}

function startHealthCheck(): void {
  setInterval(() => {
    if (!channel) return;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      forceReconnect(`no response within ${HEALTH_CHECK_TIMEOUT_MS}ms`);
    }, HEALTH_CHECK_TIMEOUT_MS);

    channel
      .checkQueue(config.queueName)
      .then(() => {
        settled = true;
        clearTimeout(timeout);
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        forceReconnect("check failed", error);
      });
  }, HEALTH_CHECK_INTERVAL_MS);
}

export async function connectQueue(): Promise<Channel> {
  const result = await setUpChannel();
  startHealthCheck();
  return result;
}

function getAttemptCount(message: ConsumeMessage): number {
  const headers = message.properties.headers ?? {};
  const xDeath = headers["x-death"] as Array<{ count?: number }> | undefined;
  return xDeath?.[0]?.count ?? 0;
}

async function registerConsumer(
  handler: (sessionMessage: SessionScoreMessage) => Promise<void>
): Promise<void> {
  if (!channel) throw new Error("Queue channel not connected - call connectQueue() first");

  await channel.consume(config.queueName, async (message) => {
    if (!message) return;

    try {
      const sessionMessage = JSON.parse(message.content.toString()) as SessionScoreMessage;
      console.log(
        `[${new Date().toISOString()}] Dequeued session ${sessionMessage.sessionId} (${sessionMessage.jobs.length} jobs)`
      );
      broadcastStatus(
        sessionMessage.sessionId,
        `Picked up by the scoring worker (${sessionMessage.jobs.length} job${sessionMessage.jobs.length === 1 ? "" : "s"} queued via RabbitMQ)`
      );
      await handler(sessionMessage);
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

// Stores the handler so a reconnect (see setUpChannel's connection.on("close"))
// can re-register the same consumer on the fresh channel automatically,
// instead of the worker silently going deaf until someone manually restarts it.
export async function consumeJobs(
  handler: (sessionMessage: SessionScoreMessage) => Promise<void>
): Promise<void> {
  currentHandler = handler;
  await registerConsumer(handler);
}

export function publishJob(job: SessionScoreMessage): boolean {
  if (!channel) throw new Error("Queue channel not connected - call connectQueue() first");
  return channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(job)), {
    persistent: true
  });
}
