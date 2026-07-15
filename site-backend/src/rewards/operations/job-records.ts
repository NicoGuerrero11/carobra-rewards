import type { JobStatus } from "../shared/enums.js";

export interface ScheduledRewardsJobRecord {
  id: string;
  jobType: string;
  businessKey: string;
  dueAt: Date;
  status: JobStatus;
  attemptCount: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
  safePayload: Readonly<Record<string, unknown>>;
}

export interface RewardsJobExecutionRecord {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: JobStatus;
  workerId: string;
  startedAt: Date;
  finishedAt: Date | null;
  safeErrorCode: string | null;
}
