import { WebSocketServer, type WebSocket } from "ws";
import { config } from "./config.js";
import type { JobResult } from "./types.js";

const clientsBySession = new Map<string, Set<WebSocket>>();

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

    socket.on("close", () => {
      clientsBySession.get(sessionId)?.delete(socket);
    });
  });

  return wss;
}

export function broadcastResult(result: JobResult): void {
  const sockets = clientsBySession.get(result.sessionId);
  if (!sockets) return;

  const payload = JSON.stringify({ type: "job-result", result });
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}
