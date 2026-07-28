"use client";

import { useJobResults } from "@/lib/use-job-results";

export function ResultsPanel({ sessionId, jobCount }: { sessionId: string; jobCount: number }) {
  const results = useJobResults(sessionId);

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Results {results.length > 0 && `(${results.length}/${jobCount})`}
      </h2>

      {results.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="size-2 rounded-full bg-accent animate-pulse-glow" />
          Waiting for the first match to come in...
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {results.map((result) => (
          <li key={result.jobId} className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="font-medium">{result.jobTitle}</span>
              <span className="rounded-full border border-accent px-2.5 py-0.5 text-xs font-semibold text-accent">
                {result.score}%
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
