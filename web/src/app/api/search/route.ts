import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { getOrCreateUser } from "@/lib/db";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { fetchJobPostings, JOB_SOURCE_REPOS, type JobSourceRepo, type JobPosting } from "@/lib/github-jobs";
import { publishJobsForScoring } from "@/lib/queue";

const MAX_RESUME_CHARS = 20_000;
const MAX_PASTED_JOB_CHARS = 20_000;

type SearchRequestBody = {
  resumeText?: unknown;
  repos?: unknown;
  pastedJob?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SearchRequestBody | null;
  if (!body || typeof body.resumeText !== "string" || !body.resumeText.trim()) {
    return NextResponse.json({ error: "Missing resume text" }, { status: 400 });
  }

  const resumeText = body.resumeText.slice(0, MAX_RESUME_CHARS);

  const repos = Array.isArray(body.repos)
    ? (body.repos.filter((r): r is JobSourceRepo => JOB_SOURCE_REPOS.includes(r as JobSourceRepo)))
    : [];

  const pastedJob =
    typeof body.pastedJob === "string" && body.pastedJob.trim()
      ? body.pastedJob.slice(0, MAX_PASTED_JOB_CHARS)
      : null;

  if (repos.length === 0 && !pastedJob) {
    return NextResponse.json({ error: "Select at least one job source or paste a job" }, { status: 400 });
  }

  const user = await getOrCreateUser(session.user.email, session.user.email.endsWith("@gmail.com") ? "google" : "github");

  const decision = await checkAndIncrementRateLimit(user.id);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: `Daily search limit reached (${decision.limit}/day). Try again tomorrow.` },
      { status: 429 }
    );
  }

  let jobs: JobPosting[] = [];
  try {
    jobs = repos.length > 0 ? await fetchJobPostings(repos) : [];
  } catch {
    return NextResponse.json({ error: "Failed to fetch job postings from GitHub" }, { status: 502 });
  }

  if (pastedJob) {
    jobs = [
      {
        id: `manual-${randomUUID()}`,
        title: "Pasted job posting",
        body: pastedJob,
        url: "",
        repo: "manual"
      },
      ...jobs
    ];
  }

  const sessionId = randomUUID();
  await publishJobsForScoring(sessionId, resumeText, jobs);

  return NextResponse.json({ sessionId, jobCount: jobs.length, remaining: decision.remaining });
}
