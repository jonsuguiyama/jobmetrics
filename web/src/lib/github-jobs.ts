export type JobPosting = {
  id: string;
  title: string;
  body: string;
  url: string;
  repo: string;
};

type GitHubIssue = {
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
};

const GITHUB_API_BASE = "https://api.github.com";

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Community-run repos where Brazilian tech job postings are shared as
// Issues - see the root README for why this is the source used here.
export const JOB_SOURCE_REPOS = [
  "frontendbr/vagas",
  "backend-br/vagas",
  "react-brasil/vagas",
  "DevOps-Brasil/Vagas"
] as const;

export type JobSourceRepo = (typeof JOB_SOURCE_REPOS)[number];

export async function fetchJobPostings(repos: readonly JobSourceRepo[]): Promise<JobPosting[]> {
  const results = await Promise.all(repos.map((repo) => fetchOpenIssues(repo)));
  return results.flat();
}

async function fetchOpenIssues(repo: string): Promise<JobPosting[]> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/issues?state=open&per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...authHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${repo}: ${response.status} ${response.statusText}`);
  }

  const issues = (await response.json()) as GitHubIssue[];

  return issues
    .filter((issue) => !issue.pull_request) // the issues endpoint also returns PRs
    .map((issue) => ({
      id: String(issue.id),
      title: issue.title,
      body: issue.body ?? "",
      url: issue.html_url,
      repo
    }));
}
