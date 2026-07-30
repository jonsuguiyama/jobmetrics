import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useJobResults } from "./use-job-results";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose() {
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useJobResults", () => {
  it("does nothing while sessionId is null", () => {
    renderHook(() => useJobResults(null));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("connects to the session-scoped WebSocket URL and reports open once connected", async () => {
    const { result } = renderHook(() => useJobResults("session-1"));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toMatch(/\?sessionId=session-1$/);
    expect(result.current.status).toBe("connecting");

    act(() => FakeWebSocket.instances[0].emitOpen());
    await waitFor(() => expect(result.current.status).toBe("open"));
  });

  it("appends job results and sorts by score descending", async () => {
    const { result } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitMessage({ type: "job-result", result: { jobId: "j1", score: 40 } }));
    act(() => socket.emitMessage({ type: "job-result", result: { jobId: "j2", score: 90 } }));

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.results.map((r) => r.jobId)).toEqual(["j2", "j1"]);
  });

  it("de-dupes a replayed result instead of appending it twice", async () => {
    const { result } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitMessage({ type: "job-result", result: { jobId: "j1", score: 40 } }));
    act(() => socket.emitMessage({ type: "job-result", result: { jobId: "j1", score: 40 } }));

    await waitFor(() => expect(result.current.results).toHaveLength(1));
  });

  it("appends status updates and derives the client/server clock offset from them", async () => {
    const { result } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    const serverAt = Date.now() + 130_000; // simulates a client clock running ~130s behind
    act(() => socket.emitMessage({ type: "status", status: "Queued for scoring via RabbitMQ", at: serverAt }));

    await waitFor(() => expect(result.current.statusLog).toHaveLength(1));
    expect(result.current.statusLog[0]).toEqual({ text: "Queued for scoring via RabbitMQ", at: serverAt });
    expect(result.current.clockOffsetMs).toBeGreaterThan(100_000);
  });

  it("de-dupes an identical replayed status entry", async () => {
    const { result } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitMessage({ type: "status", status: "Queued", at: 1000 }));
    act(() => socket.emitMessage({ type: "status", status: "Queued", at: 1000 }));

    await waitFor(() => expect(result.current.statusLog).toHaveLength(1));
  });

  it("reconnects after the socket closes and reports a reconnecting status", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.emitOpen());
    expect(result.current.status).toBe("open");

    act(() => socket.emitClose());
    expect(result.current.status).toBe("reconnecting");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("closes the socket and does not reconnect after unmounting", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useJobResults("session-1"));
    const socket = FakeWebSocket.instances[0];

    unmount();
    expect(socket.close).toHaveBeenCalledTimes(1);

    act(() => socket.emitClose());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
