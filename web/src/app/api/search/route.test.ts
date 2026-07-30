import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const getOrCreateUserMock = vi.fn();
vi.mock("@/lib/db", () => ({ getOrCreateUser: getOrCreateUserMock }));

const checkRateLimitMock = vi.fn();
const incrementSearchCountMock = vi.fn();
const isOwnerMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  incrementSearchCount: incrementSearchCountMock,
  isOwner: isOwnerMock
}));

const fetchJobPostingsMock = vi.fn();
vi.mock("@/lib/github-jobs", () => ({
  fetchJobPostings: fetchJobPostingsMock,
  JOB_SOURCE_REPOS: ["frontendbr/vagas", "backend-br/vagas", "react-brasil/vagas", "DevOps-Brasil/Vagas"]
}));

const publishJobsForScoringMock = vi.fn();
vi.mock("@/lib/queue", () => ({ publishJobsForScoring: publishJobsForScoringMock }));

const savePipelineStatusMock = vi.fn();
vi.mock("@/lib/redis", () => ({ savePipelineStatus: savePipelineStatusMock }));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "dev@example.com" } });
    getOrCreateUserMock.mockResolvedValue({ id: "user-1", email: "dev@example.com" });
    isOwnerMock.mockReturnValue(false);
    checkRateLimitMock.mockResolvedValue({ allowed: true, used: 0, remaining: 5, limit: 5 });
    fetchJobPostingsMock.mockResolvedValue([
      { id: "job-1", title: "Dev", body: "text", url: "https://x", repo: "frontendbr/vagas" }
    ]);
    publishJobsForScoringMock.mockResolvedValue(undefined);
    savePipelineStatusMock.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated request", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty resume", async () => {
    const res = await POST(makeRequest({ resumeText: "   ", repos: ["frontendbr/vagas"] }));
    expect(res.status).toBe(400);
  });

  it("rejects a request with neither a job source nor a pasted job", async () => {
    const res = await POST(makeRequest({ resumeText: "resume", repos: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 429 once the daily limit is reached, and never queues anything", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false, used: 5, remaining: 0, limit: 5 });

    const res = await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));

    expect(res.status).toBe(429);
    expect(publishJobsForScoringMock).not.toHaveBeenCalled();
  });

  it("exempts the owner from the rate limit check entirely", async () => {
    isOwnerMock.mockReturnValue(true);

    await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));

    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(incrementSearchCountMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the GitHub fetch fails, without publishing anything", async () => {
    fetchJobPostingsMock.mockRejectedValue(new Error("GitHub is down"));

    const res = await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));

    expect(res.status).toBe(502);
    expect(publishJobsForScoringMock).not.toHaveBeenCalled();
  });

  it("prepends a manually pasted job ahead of the fetched postings", async () => {
    await POST(
      makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"], pastedJob: "A pasted job description" })
    );

    const [, , jobsArg] = publishJobsForScoringMock.mock.calls[0];
    expect(jobsArg[0].body).toBe("A pasted job description");
    expect(jobsArg[0].repo).toBe("manual");
    expect(jobsArg).toHaveLength(2);
  });

  it("accepts a pasted job on its own, with no job source selected", async () => {
    await POST(makeRequest({ resumeText: "resume", repos: [], pastedJob: "Standalone pasted job" }));

    expect(fetchJobPostingsMock).not.toHaveBeenCalled();
    const [, , jobsArg] = publishJobsForScoringMock.mock.calls[0];
    expect(jobsArg).toHaveLength(1);
    expect(jobsArg[0].repo).toBe("manual");
  });

  it("returns 502 when publishing to the queue fails", async () => {
    publishJobsForScoringMock.mockRejectedValue(new Error("RabbitMQ unreachable"));

    const res = await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
  });

  it("records both pipeline status checkpoints and increments the search count on success", async () => {
    const res = await POST(makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas"] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobCount).toBe(1);
    expect(typeof body.sessionId).toBe("string");
    expect(body.remaining).toBe(4);

    expect(savePipelineStatusMock).toHaveBeenNthCalledWith(
      1,
      body.sessionId,
      expect.stringMatching(/^Found 1 job posting on GitHub$/)
    );
    expect(savePipelineStatusMock).toHaveBeenNthCalledWith(
      2,
      body.sessionId,
      "Queued for scoring via RabbitMQ"
    );
    expect(incrementSearchCountMock).toHaveBeenCalledWith("user-1");
  });

  it("only fetches from repos in the allow-list, ignoring anything else in the request", async () => {
    await POST(
      makeRequest({ resumeText: "resume", repos: ["frontendbr/vagas", "not-a-real-repo/vagas"] })
    );

    expect(fetchJobPostingsMock).toHaveBeenCalledWith(["frontendbr/vagas"]);
  });
});
