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
  { id: "low", label: "Low", classes: "border-danger text-danger", activeClasses: "bg-danger/15" },
  { id: "fair", label: "Fair", classes: "border-orange text-orange", activeClasses: "bg-orange/15" },
  { id: "good", label: "Good", classes: "border-warning text-warning", activeClasses: "bg-warning/15" },
  {
    id: "excellent",
    label: "Excellent",
    classes: "border-accent text-accent",
    activeClasses: "bg-accent/15"
  }
] as const;

type TierId = (typeof TIERS)[number]["id"];

function tierOf(score: number): TierId {
  if (score > 69) return "excellent";
  if (score > 55) return "good";
  if (score > 40) return "fair";
  return "low";
}

function scoreColorClasses(score: number): string {
  return TIERS.find((tier) => tier.id === tierOf(score))!.classes;
}

function ScoreFilter({
  activeTiers,
  onToggle
}: {
  activeTiers: Set<TierId>;
  onToggle: (tier: TierId) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TIERS.map((tier) => {
        const active = activeTiers.has(tier.id);
        return (
          <button
            key={tier.id}
            onClick={() => onToggle(tier.id)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${tier.classes} ${
              active ? tier.activeClasses : "opacity-50 hover:opacity-100"
            }`}
          >
            {tier.label}
          </button>
        );
      })}
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
  const { results, status } = useJobResults(sessionId);
  const [revealedCount, setRevealedCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTiers, setActiveTiers] = useState<Set<TierId>>(new Set());

  useEffect(() => {
    if (revealedCount >= results.length) return undefined;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, results.length]);

  function toggleTier(tier: TierId) {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
    setCurrentPage(1);
  }

  const revealed = results.slice(0, revealedCount);
  const scoring = revealedCount < jobCount;
  const filtered =
    activeTiers.size === 0 ? revealed : revealed.filter((result) => activeTiers.has(tierOf(result.score)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Results {revealedCount > 0 && `(${revealedCount}/${jobCount})`}
        </h2>
        {revealedCount > 0 && <ScoreFilter activeTiers={activeTiers} onToggle={toggleTier} />}
      </div>

      {status === "reconnecting" && (
        <p className="mb-4 flex items-center gap-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span className="size-1.5 rounded-full bg-warning animate-pulse-glow" />
          Connection dropped - reconnecting
          <LoadingDots colorClassName="bg-warning" />
        </p>
      )}

      {revealedCount === 0 && (
        <p className="flex items-center gap-1 text-sm text-muted">
          Scoring {jobCount} job{jobCount === 1 ? "" : "s"}
          <LoadingDots />
        </p>
      )}

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
