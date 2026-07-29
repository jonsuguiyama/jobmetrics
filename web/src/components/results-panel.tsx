"use client";

import { useEffect, useState } from "react";
import { useJobResults } from "@/lib/use-job-results";

// Results now arrive from the worker in one burst (a single Gemini call
// scores every job in the session), not spread out over the search. Revealing
// them on a short timer instead of all at once keeps the "matches coming in"
// feel without actually waiting on the network for it.
const REVEAL_INTERVAL_MS = 200;

function scoreColorClasses(score: number): string {
  if (score >= 70) return "border-accent text-accent";
  if (score >= 40) return "border-warning text-warning";
  return "border-danger text-danger";
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 rounded-full bg-accent animate-loading-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export function ResultsPanel({ sessionId, jobCount }: { sessionId: string; jobCount: number }) {
  const results = useJobResults(sessionId);
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (revealedCount >= results.length) return undefined;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealedCount, results.length]);

  const revealed = results.slice(0, revealedCount);
  const scoring = revealedCount < jobCount;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Results {revealedCount > 0 && `(${revealedCount}/${jobCount})`}
      </h2>

      {revealedCount === 0 && (
        <p className="flex items-center gap-1 text-sm text-muted">
          Waiting for the first match to come in
          <LoadingDots />
        </p>
      )}

      {scoring && (
        <div className="mb-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${(revealedCount / jobCount) * 100}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            Scoring job {Math.min(revealedCount + 1, jobCount)} of {jobCount}
            <LoadingDots />
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {revealed.map((result) => (
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
    </section>
  );
}
