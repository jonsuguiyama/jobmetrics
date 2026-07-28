import { connectQueue, consumeJobs } from "./queue.js";
import { scoreJobMatch } from "./gemini.js";
import { saveJobResult } from "./redis.js";
import { broadcastResult, startWebSocketServer } from "./websocket.js";
import { config } from "./config.js";

async function main() {
  startWebSocketServer();
  console.log(`WebSocket server listening on port ${config.webSocketPort}`);

  await connectQueue();
  console.log(`Connected to RabbitMQ, consuming "${config.queueName}"`);

  await consumeJobs(async (job) => {
    const result = await scoreJobMatch(job);
    await saveJobResult(job.sessionId, job.jobId, JSON.stringify(result));
    broadcastResult(result);
  });
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
