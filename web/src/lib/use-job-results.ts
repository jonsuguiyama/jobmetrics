"use client";

import { useEffect, useRef, useState } from "react";

export type JobResult = {
  sessionId: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  status: "scored" | "failed";
};

const RECONNECT_DELAY_MS = 1500;

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

export function useJobResults(sessionId: string | null) {
  const [results, setResults] = useState<JobResult[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;

    let stopped = false;
    let hasConnectedOnce = false;
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? "ws://localhost:8080";
      socket = new WebSocket(`${wsUrl}?sessionId=${sessionId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        hasConnectedOnce = true;
        setStatus("open");
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type: string; result: JobResult };
        if (data.type === "job-result") {
          // A reconnect replays everything already scored (see worker's
          // websocket.ts), so de-dupe by jobId instead of assuming every
          // message is new.
          setResults((prev) => {
            if (prev.some((existing) => existing.jobId === data.result.jobId)) return prev;
            return [...prev, data.result].sort((a, b) => b.score - a.score);
          });
        }
      };

      // A worker deploy/restart (or any network blip) closes this socket
      // server-side with no client-side signal beyond onclose - without
      // retrying here, the page is left waiting forever with no way to
      // recover short of a manual reload. status surfaces this in the UI
      // instead of failing silently.
      socket.onclose = () => {
        if (stopped) return;
        console.warn(`WebSocket disconnected for session ${sessionId}, reconnecting...`);
        setStatus(hasConnectedOnce ? "reconnecting" : "connecting");
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket.onclose = null;
      socket.close();
    };
  }, [sessionId]);

  return { results, status };
}
