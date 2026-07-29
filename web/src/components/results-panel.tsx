"use client";

import { useEffect, useMemo, useState } from "react";
import { useJobResults } from "@/lib/use-job-results";

// Results now arrive from the worker in one burst (a single Gemini call
// scores every job in the session), not spread out over the search. Revealing
// them on a short timer instead of all at once keeps the "matches coming in"
// feel without actually waiting on the network for it.
const REVEAL_INTERVAL_MS = 200;
const PAGE_SIZE = 10;
const JUMP_SIZE = 10;

const TIERS = [
  { id: "low", label: "Low", textClass: "text-danger", borderClass: "border-danger", fillClass: "bg-danger" },
  {
    id: "fair",
    label: "Fair",
    textClass: "text-orange",
    borderClass: "border-orange",
    fillClass: "bg-orange"
  },
  {
    id: "good",
    label: "Good",
    textClass: "text-warning",
    borderClass: "border-warning",
    fillClass: "bg-warning"
  },
  {
    id: "excellent",
    label: "Excellent",
    textClass: "text-accent",
    borderClass: "border-accent",
    fillClass: "bg-accent"
  }
] as const;

type TierId = (typeof TIERS)[number]["id"];
type FilterValue = "all" | TierId;

function tierOf(score: number): TierId {
  if (score > 69) return "excellent";
  if (score > 55) return "good";
  if (score > 40) return "fair";
  return "low";
}

function scoreColorClasses(score: number): string {
  const tier = TIERS.find((t) => t.id === tierOf(score))!;
  return `${tier.borderClass} ${tier.textClass}`;
}

function ScoreFilter({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onChange("all")}
        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
          value === "all"
            ? "border-transparent bg-foreground text-background"
            : "border-border text-muted hover:border-muted"
        }`}
      >
        All
      </button>
      {TIERS.map((tier) => {
        const active = value === tier.id;
        return (
          <button
            key={tier.id}
            onClick={() => onChange(tier.id)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              active
                ? `border-transparent ${tier.fillClass} text-background`
                : `${tier.borderClass} ${tier.textClass} opacity-50 hover:opacity-100`
            }`}
          >
            {tier.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-3.5 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

// Surfaces the RabbitMQ producer/consumer handoff and the Gemini call as
// they actually happen, instead of hiding them behind a generic spinner -
// the message-queue architecture is the point of this project, so this
// makes it visible rather than just plumbing.
function LivePipeline({
  timeline,
  now,
  isComplete
}: {
  timeline: { label: string; at: number }[];
  now: number;
  isComplete: boolean;
}) {
  const elapsedS = Math.max(0, Math.round(((isComplete ? timeline[timeline.length - 1].at : now) - timeline[0].at) / 1000));

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4">
      <p className="mb-3 flex items-center justify-between text-xs font-semibold text-muted">
        <span>LIVE PIPELINE — RabbitMQ · Node.js worker · Gemini API</span>
        <span className="text-muted/80">{isComplete ? `completed in ${elapsedS}s` : `${elapsedS}s elapsed`}</span>
      </p>
      <ul className="flex flex-col gap-2">
        {timeline.map((entry, i) => {
          const isCurrent = i === timeline.length - 1 && !isComplete;
          const nextAt = timeline[i + 1]?.at ?? now;
          const durationS = Math.max(0, Math.round((nextAt - entry.at) / 1000));
          return (
            <li key={`${entry.label}-${entry.at}`} className="flex items-center gap-2 text-sm">
              <span className="flex size-4 shrink-0 items-center justify-center">
                {isCurrent ? (
                  <span className="size-1.5 rounded-full bg-accent animate-pulse-glow" />
                ) : (
                  <CheckIcon />
                )}
              </span>
              <span className={isCurrent ? "text-foreground" : "text-muted"}>{entry.label}</span>
              {isCurrent ? <LoadingDots /> : <span className="ml-auto text-xs text-muted">{durationS}s</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoadingDots({ colorClassName = "bg-accent" }: { colorClassName?: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`size-1 rounded-full animate-loading-dot ${colorClassName}`}
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

type LoadingStep = { text: string; durationMs: number };

// A fake but truthful step-by-step sequence for the ~1-2 minute wait while
// Gemini scores the batch - grounded in what the pipeline actually does
// (fetch postings, queue them, call the model), plus a couple of count-up
// steps using the real job count. Runs once through and holds on the last
// step instead of looping, so it doesn't read as an obviously fake loop.
function buildLoadingSteps(jobCount: number): LoadingStep[] {
  const steps: LoadingStep[] = [{ text: "Fetching job postings...", durationMs: 1200 }];

  for (let n = 1; n <= jobCount; n++) {
    steps.push({ text: `${n} job${n === 1 ? "" : "s"} found`, durationMs: 120 });
  }

  steps.push(
    { text: "Preparing your resume for comparison...", durationMs: 1000 },
    { text: "Queuing jobs for scoring...", durationMs: 1000 },
    { text: "Sending the batch to the AI model...", durationMs: 1300 }
  );

  for (let n = 1; n <= jobCount; n++) {
    steps.push({ text: `Scoring ${n} job${n === 1 ? "" : "s"}...`, durationMs: 150 });
  }

  steps.push({ text: "This can take a minute or two - hang tight", durationMs: Number.POSITIVE_INFINITY });
  return steps;
}

function LoadingSteps({ jobCount }: { jobCount: number }) {
  const steps = useMemo(() => buildLoadingSteps(jobCount), [jobCount]);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= steps.length - 1) return undefined;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), steps[stepIndex].durationMs);
    return () => clearTimeout(timer);
  }, [stepIndex, steps]);

  return (
    <p className="flex items-center gap-1 text-sm text-muted">
      <span key={stepIndex} className="animate-step-in">
        {steps[stepIndex].text}
      </span>
      <LoadingDots />
    </p>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  active
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-8 rounded-md px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const abridged = totalPages > 10;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
      <PageButton onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
        &lt;
      </PageButton>
      {abridged && (
        <PageButton
          onClick={() => onPageChange(Math.max(1, currentPage - JUMP_SIZE))}
          disabled={currentPage === 1}
        >
          &lt;&lt;
        </PageButton>
      )}

      {abridged ? (
        <>
          {[1, 2, 3].map((page) => (
            <PageButton key={page} onClick={() => onPageChange(page)} active={page === currentPage}>
              {page}
            </PageButton>
          ))}
          <span className="px-1 text-sm text-muted">...</span>
          {[totalPages - 2, totalPages - 1, totalPages].map((page) => (
            <PageButton key={page} onClick={() => onPageChange(page)} active={page === currentPage}>
              {page}
            </PageButton>
          ))}
        </>
      ) : (
        Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <PageButton key={page} onClick={() => onPageChange(page)} active={page === currentPage}>
            {page}
          </PageButton>
        ))
      )}

      {abridged && (
        <PageButton
          onClick={() => onPageChange(Math.min(totalPages, currentPage + JUMP_SIZE))}
          disabled={currentPage === totalPages}
        >
          &gt;&gt;
        </PageButton>
      )}
      <PageButton onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
        &gt;
      </PageButton>
    </div>
  );
}

export function ResultsPanel({ sessionId, jobCount }: { sessionId: string; jobCount: number }) {
  const { results, status, statusLog, firstResultAt } = useJobResults(sessionId);
  const [revealedCount, setRevealedCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValue, setFilterValue] = useState<FilterValue>("all");
  const [now, setNow] = useState(() => Date.now());
  // Captured client-side the moment this search started - persisted per
  // sessionId so a page refresh restores the real start instead of
  // resetting it to the moment of the reload.
  const [searchStartedAt] = useState(() => {
    if (typeof window === "undefined") return Date.now();
    const key = `jobmetrics:pipeline:${sessionId}:startedAt`;
    const stored = sessionStorage.getItem(key);
    if (stored) return Number(stored);
    const now = Date.now();
    sessionStorage.setItem(key, String(now));
    return now;
  });

  useEffect(() => {
    if (revealedCount >= results.length) return undefined;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, results.length]);

  const searchDone = jobCount > 0 && results.length >= jobCount;

  // Re-render every second so the pipeline's elapsed-time readout stays
  // live - stops once every job is back so it doesn't keep climbing to a
  // meaningless number while the tab just sits open afterward.
  useEffect(() => {
    if (searchDone) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [searchDone]);

  function handleFilterChange(value: FilterValue) {
    setFilterValue(value);
    setCurrentPage(1);
  }

  const revealed = results.slice(0, revealedCount);
  const scoring = revealedCount < jobCount;
  const filtered =
    filterValue === "all" ? revealed : revealed.filter((result) => tierOf(result.score) === filterValue);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // A timeline of every real stage this search has gone through, each
  // entry's duration measured to the next one (or to "now", live, for
  // whichever stage is still ongoing).
  const timeline = [
    { label: "Search submitted", at: searchStartedAt },
    ...statusLog.map((s) => ({ label: s.text, at: s.at })),
    ...(firstResultAt !== null ? [{ label: "First match streamed to your browser", at: firstResultAt }] : [])
  ];

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <LivePipeline timeline={timeline} now={now} isComplete={searchDone} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Results {revealedCount > 0 && `(${revealedCount}/${jobCount})`}
        </h2>
        {revealedCount > 0 && <ScoreFilter value={filterValue} onChange={handleFilterChange} />}
      </div>

      {status === "reconnecting" && (
        <p className="mb-4 flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span className="size-1.5 rounded-full bg-warning animate-pulse-glow" />
          Connection dropped - reconnecting
          <LoadingDots colorClassName="bg-warning" />
        </p>
      )}

      {revealedCount === 0 && <LoadingSteps jobCount={jobCount} />}

      {scoring && revealedCount > 0 && (
        <div className="mb-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${(revealedCount / jobCount) * 100}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            Showing {revealedCount} of {jobCount}
            <LoadingDots />
          </p>
        </div>
      )}

      {revealedCount > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted">No matches in the selected score range.</p>
      )}

      <ul className="flex flex-col gap-3">
        {pageItems.map((result) => (
          <li
            key={result.jobId}
            className="animate-result-in rounded-lg border border-border bg-surface-2 p-4"
          >
            <div className="mb-2 overflow-hidden">
              <span
                className={`float-right ml-3 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${scoreColorClasses(result.score)}`}
              >
                {result.score}% match
              </span>
              <span className="font-medium">{result.jobTitle}</span>
            </div>
            <p className="mb-2 text-sm text-muted">{result.summary}</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {result.matchedSkills.map((skill) => (
                <span key={skill} className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
                  {skill}
                </span>
              ))}
              {result.missingSkills.map((skill) => (
                <span key={skill} className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                  {skill}
                </span>
              ))}
            </div>
            {result.jobUrl && (
              <a
                href={result.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                View posting &amp; apply →
              </a>
            )}
          </li>
        ))}
      </ul>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setCurrentPage} />
    </section>
  );
}
