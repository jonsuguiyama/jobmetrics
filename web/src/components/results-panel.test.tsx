import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import { ResultsPanel } from "./results-panel";
import type { JobResult } from "@/lib/use-job-results";

const useJobResultsMock = vi.fn();
vi.mock("@/lib/use-job-results", () => ({
  useJobResults: (...args: unknown[]) => useJobResultsMock(...args)
}));

function makeResult(overrides: Partial<JobResult>): JobResult {
  return {
    sessionId: "s1",
    jobId: "job-1",
    jobTitle: "Frontend Developer",
    jobUrl: "https://example.com/job",
    score: 50,
    matchedSkills: [],
    missingSkills: [],
    summary: "",
    status: "scored",
    ...overrides
  };
}

// Advancing fake timers past the REVEAL_INTERVAL_MS setTimeout does update
// component state, but jsdom + React 19 doesn't reliably flush that into
// the DOM on its own here - forcing a rerender (with the same props, so it
// doesn't change what's being tested) is what actually surfaces it.
async function advance(rerender: RenderResult["rerender"], ui: React.ReactElement, ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  rerender(ui);
}

// The reveal effect only registers its *next* setTimeout once the previous
// one's state update has actually committed - advancing the full duration
// in one jump fires every tick against the same stale closure. Ticking one
// REVEAL_INTERVAL_MS at a time (with a rerender in between) lets each
// commit happen before the next timer is scheduled, same as the real app.
async function revealAll(rerender: RenderResult["rerender"], ui: React.ReactElement, count: number) {
  for (let i = 0; i < count; i++) {
    await advance(rerender, ui, 200);
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  useJobResultsMock.mockReset();
});

describe("ResultsPanel", () => {
  it("shows the waiting notice before anything has been revealed", () => {
    useJobResultsMock.mockReturnValue({ results: [], status: "connecting", statusLog: [], clockOffsetMs: 0 });
    render(<ResultsPanel sessionId="s1" jobCount={5} />);

    expect(screen.getByText(/This can take a minute or two/)).toBeTruthy();
  });

  it("shows the reconnecting banner when the socket drops", () => {
    useJobResultsMock.mockReturnValue({ results: [], status: "reconnecting", statusLog: [], clockOffsetMs: 0 });
    render(<ResultsPanel sessionId="s1" jobCount={5} />);

    expect(screen.getByText(/Connection dropped/)).toBeTruthy();
  });

  it("renders the live pipeline with server-sourced stage labels once a status arrives", () => {
    useJobResultsMock.mockReturnValue({
      results: [],
      status: "open",
      statusLog: [
        { text: "Found 3 job postings on GitHub", at: 1000 },
        { text: "Queued for scoring via RabbitMQ", at: 2000 }
      ],
      clockOffsetMs: 0
    });
    render(<ResultsPanel sessionId="s1" jobCount={3} />);

    expect(screen.getByText("Found 3 job postings on GitHub")).toBeTruthy();
    expect(screen.getByText("Queued for scoring via RabbitMQ")).toBeTruthy();
    expect(screen.getByText(/elapsed/)).toBeTruthy();
  });

  it("shows 'completed in' instead of 'elapsed' once every job has a result", () => {
    useJobResultsMock.mockReturnValue({
      results: [makeResult({ jobId: "job-1" })],
      status: "open",
      statusLog: [
        { text: "Found 1 job posting on GitHub", at: 1000 },
        { text: "All results delivered", at: 2000 }
      ],
      clockOffsetMs: 0
    });
    render(<ResultsPanel sessionId="s1" jobCount={1} />);

    expect(screen.getByText(/completed in/)).toBeTruthy();
    expect(screen.queryByText(/ elapsed/)).toBeNull();
  });

  it("reveals results one at a time on the reveal timer instead of dumping them all at once", async () => {
    vi.useFakeTimers();
    useJobResultsMock.mockReturnValue({
      results: [makeResult({ jobId: "job-1", jobTitle: "First" }), makeResult({ jobId: "job-2", jobTitle: "Second" })],
      status: "open",
      statusLog: [],
      clockOffsetMs: 0
    });
    const ui = <ResultsPanel sessionId="s1" jobCount={2} />;
    const { rerender } = render(ui);

    expect(screen.queryByText("First")).toBeNull();

    await advance(rerender, ui, 200);
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByText("Second")).toBeNull();

    await advance(rerender, ui, 200);
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("filters revealed results by score tier", async () => {
    vi.useFakeTimers();
    useJobResultsMock.mockReturnValue({
      results: [
        makeResult({ jobId: "job-low", jobTitle: "Low job", score: 20 }),
        makeResult({ jobId: "job-excellent", jobTitle: "Excellent job", score: 90 })
      ],
      status: "open",
      statusLog: [],
      clockOffsetMs: 0
    });
    const ui = <ResultsPanel sessionId="s1" jobCount={2} />;
    const { rerender } = render(ui);
    await revealAll(rerender, ui, 2);

    expect(screen.getByText("Low job")).toBeTruthy();
    expect(screen.getByText("Excellent job")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Excellent" }));

    expect(screen.queryByText("Low job")).toBeNull();
    expect(screen.getByText("Excellent job")).toBeTruthy();
  });

  it("shows a message when the filter matches nothing", async () => {
    vi.useFakeTimers();
    useJobResultsMock.mockReturnValue({
      results: [makeResult({ jobId: "job-1", score: 20 })],
      status: "open",
      statusLog: [],
      clockOffsetMs: 0
    });
    const ui = <ResultsPanel sessionId="s1" jobCount={1} />;
    const { rerender } = render(ui);
    await advance(rerender, ui, 200);

    fireEvent.click(screen.getByRole("button", { name: "Excellent" }));

    expect(screen.getByText(/No matches in the selected score range/)).toBeTruthy();
  });

  it("renders matched and missing skill tags for a revealed result", async () => {
    vi.useFakeTimers();
    useJobResultsMock.mockReturnValue({
      results: [makeResult({ jobId: "job-1", matchedSkills: ["React"], missingSkills: ["Kafka"] })],
      status: "open",
      statusLog: [],
      clockOffsetMs: 0
    });
    const ui = <ResultsPanel sessionId="s1" jobCount={1} />;
    const { rerender } = render(ui);
    await advance(rerender, ui, 200);

    expect(screen.getByText("React")).toBeTruthy();
    expect(screen.getByText("Kafka")).toBeTruthy();
  });

  it("paginates once there are more than 10 revealed results, and switching pages works", async () => {
    vi.useFakeTimers();
    const results = Array.from({ length: 15 }, (_, i) =>
      makeResult({ jobId: `job-${i}`, jobTitle: `Job ${i}`, score: 60 })
    );
    useJobResultsMock.mockReturnValue({ results, status: "open", statusLog: [], clockOffsetMs: 0 });
    const ui = <ResultsPanel sessionId="s1" jobCount={15} />;
    const { rerender } = render(ui);
    await revealAll(rerender, ui, 15);

    expect(screen.getByText("Job 0")).toBeTruthy();
    expect(screen.queryByText("Job 10")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.queryByText("Job 0")).toBeNull();
    expect(screen.getByText("Job 10")).toBeTruthy();
  });

  it("does not render pagination controls for a single page of results", async () => {
    vi.useFakeTimers();
    useJobResultsMock.mockReturnValue({
      results: [makeResult({ jobId: "job-1" })],
      status: "open",
      statusLog: [],
      clockOffsetMs: 0
    });
    const ui = <ResultsPanel sessionId="s1" jobCount={1} />;
    const { rerender } = render(ui);
    await advance(rerender, ui, 200);

    expect(screen.queryByRole("button", { name: "2" })).toBeNull();
  });
});
