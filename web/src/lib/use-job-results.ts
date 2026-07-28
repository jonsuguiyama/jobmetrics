"use client";

import { useEffect, useRef, useState } from "react";

export type JobResult = {
  sessionId: string;
  jobId: string;
  jobTitle: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  status: "scored" | "failed";
};

export function useJobResults(sessionId: string | null) {
  const [results, setResults] = useState<JobResult[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;

    const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? "ws://localhost:8080";
    const socket = new WebSocket(`${wsUrl}?sessionId=${sessionId}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type: string; result: JobResult };
      if (data.type === "job-result") {
        setResults((prev) => [...prev, data.result].sort((a, b) => b.score - a.score));
      }
    };

    return () => socket.close();
  }, [sessionId]);

  return results;
}
