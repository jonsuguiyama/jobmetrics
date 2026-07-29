import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LiveDuration } from "./results-panel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LiveDuration", () => {
  it("ticks up every second while ongoing (until: null)", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    render(<LiveDuration from={start} until={null} />);

    expect(screen.getByText("0s")).toBeTruthy();

    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText("3s")).toBeTruthy();

    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText("5s")).toBeTruthy();
  });

  it("renders a fixed value once and does not tick when until is set", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    render(<LiveDuration from={start} until={start + 7000} />);

    expect(screen.getByText("7s")).toBeTruthy();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(screen.getByText("7s")).toBeTruthy();
  });
});
