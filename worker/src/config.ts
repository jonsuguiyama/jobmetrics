import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  rabbitUrl: required("RABBITMQ_URL"),
  redisUrl: required("REDIS_URL"),
  geminiApiKey: required("GEMINI_API_KEY"),
  webSocketPort: Number(process.env.WEBSOCKET_PORT ?? 8080),
  queueName: "jobs-to-score",
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4)
};
