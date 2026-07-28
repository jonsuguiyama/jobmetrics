export type JobMessage = {
  sessionId: string;
  jobId: string;
  jobTitle: string;
  jobSource: string;
  jobText: string;
  resumeText: string;
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
