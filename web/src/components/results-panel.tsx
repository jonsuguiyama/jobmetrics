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

function scoreColorClasses(score: number): string {
  if (score > 69) return "border-accent text-accent";
  if (score > 55) return "border-warning text-warning";
  if (score > 40) return "border-orange text-orange";
  return "border-danger text-danger";
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

  useEffect(() => {
    if (revealedCount >= results.length) return undefined;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, results.length]);

  const revealed = results.slice(0, revealedCount);
  const scoring = revealedCount < jobCount;
  const totalPages = Math.max(1, Math.ceil(revealed.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageItems = revealed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Results {revealedCount > 0 && `(${revealedCount}/${jobCount})`}
      </h2>

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
