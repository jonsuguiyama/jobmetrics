import { connectQueue, consumeJobs } from "./queue.js";
import { scoreAllJobs } from "./gemini.js";
import { saveJobResult } from "./redis.js";
import { broadcastResult, broadcastStatus, startWebSocketServer } from "./websocket.js";
import { config } from "./config.js";

async function main() {
  startWebSocketServer();
  console.log(`WebSocket server listening on port ${config.webSocketPort}`);

  await connectQueue();
  console.log(`Connected to RabbitMQ, consuming "${config.queueName}"`);

  await consumeJobs(async (sessionMessage) => {
    // TEMPORARY DEBUG: each of these mirrors a console.log in this same
    // handler/queue.ts, broadcast live to the debug panel too - so the full
    // dequeue -> Gemini -> save/broadcast timeline is visible on-screen
    // without needing pm2 logs at all.
    broadcastStatus(sessionMessage.sessionId, "Calling Gemini...");
    console.log(`[${new Date().toISOString()}] Calling Gemini for session ${sessionMessage.sessionId}`);
    const results = await scoreAllJobs(sessionMessage);
    console.log(`[${new Date().toISOString()}] Gemini returned for session ${sessionMessage.sessionId}`);
    broadcastStatus(sessionMessage.sessionId, "Gemini responded - saving results...");
    for (const result of results) {
      await saveJobResult(result.sessionId, result.jobId, JSON.stringify(result));
      broadcastResult(result);
    }
    console.log(`[${new Date().toISOString()}] Done saving/broadcasting session ${sessionMessage.sessionId}`);
    broadcastStatus(sessionMessage.sessionId, "Done saving/broadcasting results");
  });
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
