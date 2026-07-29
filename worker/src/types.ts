export type JobToScore = {
  jobId: string;
  jobTitle: string;
  jobSource: string;
  jobText: string;
};

// One message per search session, not per job - every job posting for a
// session is scored in a single Gemini call so the whole session costs one
// request against the free-tier RPM cap instead of one per job.
export type SessionScoreMessage = {
  sessionId: string;
  resumeText: string;
  jobs: JobToScore[];
};

export type JobResult = {
  sessionId: string;
  jobId: string;
  jobTitle: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  status: "scored" | "failed";
};
