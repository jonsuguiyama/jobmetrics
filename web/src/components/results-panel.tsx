"use client";

import { useJobResults } from "@/lib/use-job-results";

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
  const scoring = results.length < jobCount;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Results {results.length > 0 && `(${results.length}/${jobCount})`}
      </h2>

      {results.length === 0 && (
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
              style={{ width: `${(results.length / jobCount) * 100}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            Scoring job {Math.min(results.length + 1, jobCount)} of {jobCount}
            <LoadingDots />
            <span className="ml-1">
              — the free Gemini tier limits how fast this can go, so this may take a minute or
              two.
            </span>
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {results.map((result) => (
          <li key={result.jobId} className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="font-medium">{result.jobTitle}</span>
              <span className="rounded-full border border-accent px-2.5 py-0.5 text-xs font-semibold text-accent">
                {result.score}% match
              </span>
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
          </li>
        ))}
      </ul>
    </section>
  );
}
