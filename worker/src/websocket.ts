import { WebSocketServer, type WebSocket } from "ws";
import { config } from "./config.js";
import { getJobResults } from "./redis.js";
import type { JobResult } from "./types.js";

const clientsBySession = new Map<string, Set<WebSocket>>();

function sendResult(socket: WebSocket, result: JobResult): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type: "job-result", result }));
  }
}

export function startWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ port: config.webSocketPort });

  wss.on("connection", (socket, request) => {
    const sessionId = new URL(request.url ?? "", "ws://localhost").searchParams.get("sessionId");
    if (!sessionId) {
      socket.close(4000, "missing sessionId");
      return;
    }

    if (!clientsBySession.has(sessionId)) {
      clientsBySession.set(sessionId, new Set());
    }
    clientsBySession.get(sessionId)!.add(socket);

    // Catches this connection up on anything already scored before it
    // connected (or reconnected) - without this, a client that's slow to
    // open the socket, or whose connection drops mid-search, misses those
    // results forever since broadcastResult() only reaches sockets that are
    // open at the exact moment a result is produced.
    getJobResults(sessionId)
      .then((results) => {
        for (const result of results) sendResult(socket, result);
      })
      .catch((error) => console.error(`Failed to replay results for session ${sessionId}:`, error));

    socket.on("close", () => {
      clientsBySession.get(sessionId)?.delete(socket);
    });
  });

  return wss;
}

export function broadcastResult(result: JobResult): void {
  const sockets = clientsBySession.get(result.sessionId);
  if (!sockets) return;

  for (const socket of sockets) sendResult(socket, result);
}

// TEMPORARY DEBUG: lets the frontend show what the worker is doing right
// now instead of the user having to check pm2 logs / RabbitMQ manually.
// Not persisted anywhere (unlike job results), so a client that connects
// after a given status was sent just won't see that one - fine for a
// throwaway debug panel, not worth building real persistence for.
export function broadcastStatus(sessionId: string, statusText: string): void {
  const sockets = clientsBySession.get(sessionId);
  if (!sockets) return;

  const payload = JSON.stringify({ type: "status", status: statusText, at: Date.now() });
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
