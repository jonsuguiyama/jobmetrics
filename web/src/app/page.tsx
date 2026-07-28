"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ResultsPanel } from "@/components/results-panel";
import { SignInButton } from "@/components/sign-in-button";

const JOB_SOURCES: { id: string; label: string }[] = [
  { id: "frontendbr/vagas", label: "frontendbr/vagas" },
  { id: "backend-br/vagas", label: "backend-br/vagas" },
  { id: "react-brasil/vagas", label: "react-brasil/vagas" },
  { id: "DevOps-Brasil/Vagas", label: "DevOps-Brasil/Vagas" }
];

export default function Home() {
  const { data: session, status } = useSession();

  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([JOB_SOURCES[0].id]);
  const [pastedJob, setPastedJob] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  async function processResumeFile(file: File) {
    setError(null);
    setResumeFileName(file.name);
    setIsParsingResume(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not read that file");
        setResumeFileName(null);
        return;
      }

      setResumeText(data.text);
    } catch {
      setError("Could not reach the server. Try again.");
      setResumeFileName(null);
    } finally {
      setIsParsingResume(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processResumeFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processResumeFile(file);
  }

  function toggleRepo(id: string) {
    setSelectedRepos((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handleSearch() {
    setError(null);
    setSessionId(null);
    setIsSearching(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, repos: selectedRepos, pastedJob })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setJobCount(data.jobCount);
      setSessionId(data.sessionId);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setIsSearching(false);
    }
  }

  if (status === "loading") return null;

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Match your resume against real job postings, live.
        </h1>
        <p className="max-w-md text-lg text-muted">
          Upload your resume, pick a source of dev job postings, and get a live-updating
          match score for each one - powered by an LLM and a real message queue.
        </p>
        <SignInButton />
      </div>
    );
  }

  const canSearch = resumeText.trim().length > 0 && (selectedRepos.length > 0 || pastedJob.trim().length > 0);

  let uploadLabel = "Click to upload or drop your resume here";
  if (isParsingResume) uploadLabel = "Reading your resume...";
  else if (resumeFileName) uploadLabel = `Loaded: ${resumeFileName}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">1. Your resume</h2>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
            isDraggingFile ? "border-accent bg-surface-2" : "border-border bg-surface-2 hover:border-accent"
          }`}
        >
          <span className="text-sm text-muted">{uploadLabel}</span>
          {!resumeFileName && !isParsingResume && (
            <span className="text-xs text-muted/70">.pdf, .docx, or .txt</span>
          )}
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <h2 className="mb-3 mt-6 text-lg font-semibold">2. Job sources</h2>
        <div className="flex flex-col gap-2">
          {JOB_SOURCES.map((source) => (
            <label key={source.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedRepos.includes(source.id)}
                onChange={() => toggleRepo(source.id)}
                className="size-4 accent-[var(--accent)]"
              />
              {source.label}
            </label>
          ))}
        </div>

        <h2 className="mb-2 mt-6 text-lg font-semibold">3. Or paste a specific job</h2>
        <textarea
          value={pastedJob}
          onChange={(e) => setPastedJob(e.target.value)}
          placeholder="Paste a job description here (optional)"
          rows={4}
          className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <button
          onClick={handleSearch}
          disabled={!canSearch || isSearching}
          className="mt-6 w-full rounded-lg bg-accent py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSearching ? "Starting search..." : "Find matches"}
        </button>
      </section>

      {sessionId && <ResultsPanel key={sessionId} sessionId={sessionId} jobCount={jobCount} />}
    </div>
  );
}
