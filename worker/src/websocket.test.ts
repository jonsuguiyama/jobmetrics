import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./config.js", () => ({
  config: { webSocketPort: 8080 }
}));

const redisMock = {
  getJobResults: vi.fn().mockResolvedValue([]),
  getStatusHistory: vi.fn().mockResolvedValue([]),
  saveStatus: vi.fn().mockResolvedValue(undefined)
};
vi.mock("./redis.js", () => redisMock);

let connectionHandler: (socket: unknown, request: unknown) => void;
const wssInstance = {
  on: vi.fn((event: string, handler: typeof connectionHandler) => {
    if (event === "connection") connectionHandler = handler;
  })
};
const WebSocketServerMock = vi.fn().mockImplementation(function WebSocketServer() {
  return wssInstance;
});
vi.mock("ws", () => ({
  WebSocketServer: WebSocketServerMock
}));

function makeSocket() {
  const listeners: Record<string, () => void> = {};
  return {
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      listeners[event] = handler;
    }),
    __close: () => listeners.close?.()
  };
}

describe("websocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.getJobResults.mockResolvedValue([]);
    redisMock.getStatusHistory.mockResolvedValue([]);
  });

  it("startWebSocketServer listens on the configured port", async () => {
    const { startWebSocketServer } = await import("./websocket.js");
    startWebSocketServer();
    expect(WebSocketServerMock).toHaveBeenCalledWith({ port: 8080 });
  });

  it("closes a connection with no sessionId instead of registering it", async () => {
    const { startWebSocketServer } = await import("./websocket.js");
    startWebSocketServer();

    const socket = { ...makeSocket(), close: vi.fn() };
    connectionHandler(socket, { url: "/" });

    expect(socket.close).toHaveBeenCalledWith(4000, "missing sessionId");
    expect(redisMock.getJobResults).not.toHaveBeenCalled();
  });

  it("replays already-scored results and status history to a new connection", async () => {
    redisMock.getJobResults.mockResolvedValueOnce([
      { sessionId: "s1", jobId: "j1", jobTitle: "t", jobUrl: "u", score: 90, matchedSkills: [], missingSkills: [], summary: "", status: "scored" }
    ]);
    redisMock.getStatusHistory.mockResolvedValueOnce([{ text: "Queued", at: 123 }]);

    const { startWebSocketServer } = await import("./websocket.js");
    startWebSocketServer();

    const socket = makeSocket();
    connectionHandler(socket, { url: "/?sessionId=s1" });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "job-result",
        result: { sessionId: "s1", jobId: "j1", jobTitle: "t", jobUrl: "u", score: 90, matchedSkills: [], missingSkills: [], summary: "", status: "scored" }
      })
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "status", status: "Queued", at: 123 })
    );
  });

  it("broadcastResult sends only to sockets registered for that session", async () => {
    const { startWebSocketServer, broadcastResult } = await import("./websocket.js");
    startWebSocketServer();

    const socketA = makeSocket();
    connectionHandler(socketA, { url: "/?sessionId=session-a" });
    await vi.waitFor(() => expect(redisMock.getJobResults).toHaveBeenCalled());
    socketA.send.mockClear();

    broadcastResult({
      sessionId: "session-a",
      jobId: "j2",
      jobTitle: "t",
      jobUrl: "u",
      score: 40,
      matchedSkills: [],
      missingSkills: [],
      summary: "",
      status: "scored"
    });
    broadcastResult({
      sessionId: "session-other",
      jobId: "j3",
      jobTitle: "t",
      jobUrl: "u",
      score: 40,
      matchedSkills: [],
      missingSkills: [],
      summary: "",
      status: "scored"
    });

    expect(socketA.send).toHaveBeenCalledTimes(1);
  });

  it("broadcastResult is a no-op when nobody is connected for that session", async () => {
    const { broadcastResult } = await import("./websocket.js");
    expect(() =>
      broadcastResult({
        sessionId: "nobody-here",
        jobId: "j1",
        jobTitle: "t",
        jobUrl: "u",
        score: 1,
        matchedSkills: [],
        missingSkills: [],
        summary: "",
        status: "scored"
      })
    ).not.toThrow();
  });

  it("broadcastStatus persists the status and pushes it to connected sockets", async () => {
    const { startWebSocketServer, broadcastStatus } = await import("./websocket.js");
    startWebSocketServer();

    const socket = makeSocket();
    connectionHandler(socket, { url: "/?sessionId=session-b" });
    await vi.waitFor(() => expect(redisMock.getJobResults).toHaveBeenCalled());
    socket.send.mockClear();

    broadcastStatus("session-b", "Scoring matches with the Gemini API...");

    expect(redisMock.saveStatus).toHaveBeenCalledWith(
      "session-b",
      "Scoring matches with the Gemini API...",
      expect.any(Number)
    );
    expect(socket.send).toHaveBeenCalledTimes(1);
    const [payload] = socket.send.mock.calls[0];
    expect(JSON.parse(payload).type).toBe("status");
  });

  it("stops sending to a socket after it disconnects", async () => {
    const { startWebSocketServer, broadcastResult } = await import("./websocket.js");
    startWebSocketServer();

    const socket = makeSocket();
    connectionHandler(socket, { url: "/?sessionId=session-c" });
    await vi.waitFor(() => expect(redisMock.getJobResults).toHaveBeenCalled());
    socket.__close();
    socket.send.mockClear();

    broadcastResult({
      sessionId: "session-c",
      jobId: "j1",
      jobTitle: "t",
      jobUrl: "u",
      score: 1,
      matchedSkills: [],
      missingSkills: [],
      summary: "",
      status: "scored"
    });

    expect(socket.send).not.toHaveBeenCalled();
  });
});
