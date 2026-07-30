import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobToScore, SessionScoreMessage } from "./types.js";

vi.mock("./config.js", () => ({
  config: { geminiApiKey: "test-key" }
}));

vi.mock("./rate-limiter.js", () => ({
  throttle: (fn: () => Promise<unknown>) => fn()
}));

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
    return { models: { generateContent: generateContentMock } };
  }),
  Type: { ARRAY: "ARRAY", OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER" }
}));

const { toJobResult, scoreAllJobs } = await import("./gemini.js");

const sessionId = "session-1";
const job: JobToScore = {
  jobId: "job-1",
  jobTitle: "Full-stack developer",
  jobSource: "frontendbr/vagas",
  jobText: "irrelevant for these tests",
  jobUrl: "https://github.com/frontendbr/vagas/issues/1"
};

describe("toJobResult", () => {
  it("passes through a well-formed response", () => {
    const result = toJobResult(sessionId, job, {
      score: 82,
      matchedSkills: ["React", "TypeScript"],
      missingSkills: ["Kafka"],
      summary: "Strong overlap on frontend skills."
    });

    expect(result.score).toBe(82);
    expect(result.matchedSkills).toEqual(["React", "TypeScript"]);
    expect(result.missingSkills).toEqual(["Kafka"]);
    expect(result.status).toBe("scored");
  });

  it("clamps a score above 100", () => {
    const result = toJobResult(sessionId, job, { score: 999 });
    expect(result.score).toBe(100);
  });

  it("clamps a negative score to 0", () => {
    const result = toJobResult(sessionId, job, { score: -50 });
    expect(result.score).toBe(0);
  });

  it("defaults to 0 when score is missing or not a number", () => {
    expect(toJobResult(sessionId, job, {}).score).toBe(0);
    expect(toJobResult(sessionId, job, { score: "a hundred" }).score).toBe(0);
  });

  it("ignores non-array matchedSkills/missingSkills instead of throwing", () => {
    const result = toJobResult(sessionId, job, {
      score: 50,
      matchedSkills: "not an array",
      missingSkills: null
    });

    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
  });

  it("truncates an oversized summary", () => {
    const result = toJobResult(sessionId, job, { score: 50, summary: "a".repeat(1000) });
    expect(result.summary.length).toBe(500);
  });

  it("marks the result as failed when the model dropped this job ID entirely", () => {
    const result = toJobResult(sessionId, job, undefined);
    expect(result.status).toBe("failed");
    expect(result.score).toBe(0);
  });
});

describe("scoreAllJobs", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const message: SessionScoreMessage = {
    sessionId: "session-1",
    resumeText: "React, TypeScript, Node.js",
    jobs: [
      { jobId: "job-1", jobTitle: "Frontend dev", jobSource: "frontendbr/vagas", jobText: "React role", jobUrl: "u1" },
      { jobId: "job-2", jobTitle: "Backend dev", jobSource: "backend-br/vagas", jobText: "Node role", jobUrl: "u2" }
    ]
  };

  it("maps every job in the session to a scored result, matched by job ID", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify([
        { jobId: "job-2", score: 40, matchedSkills: ["Node.js"], missingSkills: [], summary: "ok" },
        { jobId: "job-1", score: 90, matchedSkills: ["React"], missingSkills: [], summary: "great fit" }
      ])
    });

    const results = await scoreAllJobs(message);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.jobId === "job-1")?.score).toBe(90);
    expect(results.find((r) => r.jobId === "job-2")?.score).toBe(40);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-flash-lite-latest",
        contents: expect.stringContaining("React, TypeScript, Node.js")
      })
    );
  });

  it("marks a job as failed if the model's response never mentions its job ID", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify([{ jobId: "job-1", score: 90, matchedSkills: [], missingSkills: [], summary: "" }])
    });

    const results = await scoreAllJobs(message);

    expect(results.find((r) => r.jobId === "job-1")?.status).toBe("scored");
    expect(results.find((r) => r.jobId === "job-2")?.status).toBe("failed");
  });

  it("treats a missing response body as an empty array instead of throwing", async () => {
    generateContentMock.mockResolvedValue({ text: undefined });

    const results = await scoreAllJobs(message);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "failed")).toBe(true);
  });

  it("times out instead of hanging forever on a Gemini call with no response", async () => {
    vi.useFakeTimers();
    generateContentMock.mockReturnValue(new Promise(() => undefined));

    const promise = scoreAllJobs(message);
    const expectation = expect(promise).rejects.toThrow("Gemini call timed out after 45000ms");
    await vi.advanceTimersByTimeAsync(45000);
    await expectation;
  });
});
