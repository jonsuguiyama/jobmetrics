import { describe, it, expect } from "vitest";
import { toJobResult } from "./gemini.js";
import type { JobMessage } from "./types.js";

const baseMessage: JobMessage = {
  sessionId: "session-1",
  jobId: "job-1",
  jobTitle: "Full-stack developer",
  jobSource: "frontendbr/vagas",
  jobText: "irrelevant for these tests",
  resumeText: "irrelevant for these tests"
};

describe("toJobResult", () => {
  it("passes through a well-formed response", () => {
    const result = toJobResult(baseMessage, {
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
    const result = toJobResult(baseMessage, { score: 999 });
    expect(result.score).toBe(100);
  });

  it("clamps a negative score to 0", () => {
    const result = toJobResult(baseMessage, { score: -50 });
    expect(result.score).toBe(0);
  });

  it("defaults to 0 when score is missing or not a number", () => {
    expect(toJobResult(baseMessage, {}).score).toBe(0);
    expect(toJobResult(baseMessage, { score: "a hundred" }).score).toBe(0);
  });

  it("ignores non-array matchedSkills/missingSkills instead of throwing", () => {
    const result = toJobResult(baseMessage, {
      score: 50,
      matchedSkills: "not an array",
      missingSkills: null
    });

    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
  });

  it("truncates an oversized summary", () => {
    const result = toJobResult(baseMessage, { score: 50, summary: "a".repeat(1000) });
    expect(result.summary.length).toBe(500);
  });
});
