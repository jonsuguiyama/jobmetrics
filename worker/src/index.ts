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

  // Each broadcastStatus call here mirrors a console.log at the same point,
  // surfaced live in the UI as a "Live pipeline" feature - lets anyone
  // watching see the RabbitMQ producer/consumer handoff and the LLM call
  // happen in real time, instead of a plain loading spinner.
  await consumeJobs(async (sessionMessage) => {
    broadcastStatus(sessionMessage.sessionId, "Scoring matches with the Gemini API...");
    console.log(`[${new Date().toISOString()}] Calling Gemini for session ${sessionMessage.sessionId}`);
    const results = await scoreAllJobs(sessionMessage);
    console.log(`[${new Date().toISOString()}] Gemini returned for session ${sessionMessage.sessionId}`);
    broadcastStatus(sessionMessage.sessionId, "Scores received - saving and streaming results...");
    for (const result of results) {
      await saveJobResult(result.sessionId, result.jobId, JSON.stringify(result));
      broadcastResult(result);
    }
    console.log(`[${new Date().toISOString()}] Done saving/broadcasting session ${sessionMessage.sessionId}`);
    broadcastStatus(sessionMessage.sessionId, "All results delivered");
  });
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
