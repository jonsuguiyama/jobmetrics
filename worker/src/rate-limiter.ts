// Gemini's free tier caps at 15 requests/minute for this model. Each search
// session is now one Gemini call (all its jobs scored in a single batched
// request), but multiple sessions can still get pulled off the queue
// concurrently (see WORKER_CONCURRENCY), so calls across sessions must stay
// serialized with this minimum gap between them - a 429 mid-batch (which
// happened in production before this existed) means every concurrent call
// after the first burst just fails and retries into the same wall.
const MIN_INTERVAL_MS = 4_200; // ~14.3 calls/min, a safety margin under 15/min

let queue: Promise<void> = Promise.resolve();

// Test-only escape hatch: the queue above is module-level state, so without
// this, one test's pending setTimeout (orphaned when the suite swaps fake
// timers back to real ones) leaves the next test's throttle() call chained
// onto a promise that will never resolve.
export function __resetThrottleForTests(): void {
  queue = Promise.resolve();
}

export function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const runPromise = queue.then(fn);

  // Advance the chain regardless of whether fn() succeeded or failed, so one
  // failed call doesn't stall every job queued behind it.
  queue = runPromise.then(
    () => undefined,
    () => undefined
  ).then(() => new Promise<void>((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)));

  return runPromise;
}
