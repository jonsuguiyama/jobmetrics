"use client";

import { useEffect, useState } from "react";
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

// Ticks its own seconds counter independently - "until: null" means still
// ongoing (ticks off its own interval), a fixed number means already ended
// (renders once, no interval needed). Isolated on purpose: each duration
// manages itself instead of the whole pipeline sharing one "now" clock that
// every entry's math depended on getting right.
export function LiveDuration({ from, until }: { from: number; until: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until !== null) return undefined;
    const interval = setInterval(() => {
      const next = Date.now();
      if (typeof document !== "undefined") {
        console.log("[LiveDuration] tick", {
          from,
          next,
          visibilityState: document.visibilityState,
          hidden: document.hidden
        });
      }
      setNow(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [until, from]);

  const seconds = Math.max(0, Math.round(((until ?? now) - from) / 1000));
  console.log("[LiveDuration] render", { from, until, now, seconds });
  return <span className="ml-auto text-xs text-muted">{seconds}s</span>;
}

// Surfaces the RabbitMQ producer/consumer handoff and the Gemini call as
// they actually happen, instead of hiding them behind a generic spinner -
// the message-queue architecture is the point of this project, so this
// makes it visible rather than just plumbing.
function LivePipeline({
  timeline,
  isComplete
}: {
  timeline: { label: string; at: number }[];
  isComplete: boolean;
}) {
  const lastAt = timeline[timeline.length - 1].at;

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4">
      <p className="mb-3 flex items-center justify-between text-xs font-semibold text-muted">
        <span>LIVE PIPELINE — RabbitMQ · Node.js worker · Gemini API</span>
        <span className="text-muted/80">
          {isComplete ? "completed in " : ""}
          <LiveDuration from={timeline[0].at} until={isComplete ? lastAt : null} />
          {isComplete ? "" : " elapsed"}
        </span>
      </p>
      <ul className="flex flex-col gap-2">
        {timeline.map((entry, i) => {
          const isLastEntry = i === timeline.length - 1;
          const isCurrent = isLastEntry && !isComplete;
          // The very last entry (once the search is complete) has nothing
          // left to measure a duration against - it's just the final
          // confirmation, no number needed next to it.
          const showDuration = !(isLastEntry && isComplete);
          const nextAt = i + 1 < timeline.length ? timeline[i + 1].at : entry.at;
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
              {isCurrent && <LoadingDots />}
              {showDuration && <LiveDuration from={entry.at} until={isCurrent ? null : nextAt} />}
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

function WaitingNotice() {
  return (
    <p className="flex items-center gap-1 text-sm text-muted">
      This can take a minute or two - hang tight
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
  const { results, status, statusLog } = useJobResults(sessionId);
  const [revealedCount, setRevealedCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterValue, setFilterValue] = useState<FilterValue>("all");

  useEffect(() => {
    if (revealedCount >= results.length) return undefined;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, results.length]);

  useEffect(() => {
    function onVisibilityChange() {
      console.log("[ResultsPanel] visibilitychange", {
        visibilityState: document.visibilityState,
        hidden: document.hidden,
        at: Date.now()
      });
    }
    console.log("[ResultsPanel] mounted", {
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      at: Date.now()
    });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const searchDone = jobCount > 0 && results.length >= jobCount;

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

  // A timeline of every real stage this search has gone through - entirely
  // server-sourced (web app + worker), each entry's duration measured to
  // the next one (or to "now", live, for whichever stage is still ongoing).
  // Deliberately has no client-clock timestamps mixed in: a client with a
  // wrong system clock would otherwise throw every duration off.
  const timeline = statusLog.map((s) => ({ label: s.text, at: s.at }));

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      {timeline.length > 0 && <LivePipeline timeline={timeline} isComplete={searchDone} />}

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

      {revealedCount === 0 && <WaitingNotice />}

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
