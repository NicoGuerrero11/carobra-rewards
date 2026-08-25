import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import { assertSafeText } from "../shared/privacy.js";

export interface RewardsJobOperator {
  id: string;
  permissions: readonly string[];
}

export interface FailedRewardsJob {
  jobId: string;
  jobType: string;
  dueAt: Date;
  attemptCount: number;
  failedAt: Date;
  safeErrorCode: string;
}

export interface RetryFailedJobCommand {
  jobId: string;
  idempotencyKey: string;
  reasonCode: string;
  explanation: string;
}

export interface RetryFailedJobResult {
  jobId: string;
  status: "PENDING";
  replayed: boolean;
}

export interface RewardsJobOperationsPort {
  listFailed(limit: number): Promise<readonly FailedRewardsJob[]>;
  retry(command: RetryFailedJobCommand & {
    actorId: string;
    requestedAt: Date;
  }): Promise<RetryFailedJobResult>;
}

export class OperateRewardsJobs {
  constructor(
    private readonly operations: RewardsJobOperationsPort,
    private readonly clock: Clock,
  ) {}

  listFailed(actor: RewardsJobOperator, limit: number): Promise<readonly FailedRewardsJob[]> {
    authorize(actor, "rewards:jobs:view");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Failed-job view limit must be between 1 and 100");
    }
    return this.operations.listFailed(limit);
  }

  retry(
    actor: RewardsJobOperator,
    command: RetryFailedJobCommand,
  ): Promise<RetryFailedJobResult> {
    authorize(actor, "rewards:jobs:retry");
    assertSafeText("Manual retry job ID", command.jobId, 180);
    assertSafeText("Manual retry idempotency key", command.idempotencyKey, 180);
    assertSafeText("Manual retry reason code", command.reasonCode, 80);
    assertSafeText("Manual retry explanation", command.explanation, 500);
    return this.operations.retry({
      ...command,
      actorId: actor.id,
      requestedAt: this.clock.now(),
    });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface FailedJobRow extends QueryResultRow {
  job_id: string;
  job_type: string;
  due_at: Date;
  attempt_count: number;
  failed_at: Date;
  safe_error_code: string | null;
}
interface RetryAuditRow extends QueryResultRow { job_id: string }
interface JobStatusRow extends QueryResultRow { status: string }

export class PostgresRewardsJobOperations implements RewardsJobOperationsPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async listFailed(limit: number): Promise<readonly FailedRewardsJob[]> {
    const client = await this.database.connect();
    try {
      const rows = (await client.query<FailedJobRow>(`
        SELECT job.id::text AS job_id, job.job_type, job.due_at, job.attempt_count,
          COALESCE(execution.finished_at, job.updated_at) AS failed_at,
          execution.safe_error_code
        FROM scheduled_rewards_jobs job
        LEFT JOIN LATERAL (
          SELECT failed.finished_at, failed.safe_error_code
          FROM rewards_job_executions failed
          WHERE failed.job_id = job.id AND failed.status = 'FAILED'
          ORDER BY failed.attempt_number DESC
          LIMIT 1
        ) execution ON true
        WHERE job.status = 'FAILED'
        ORDER BY job.updated_at DESC, job.id
        LIMIT $1
      `, [limit])).rows;
      return rows.map((row) => ({
        jobId: row.job_id,
        jobType: row.job_type,
        dueAt: row.due_at,
        attemptCount: row.attempt_count,
        failedAt: row.failed_at,
        safeErrorCode: row.safe_error_code ?? "JOB_FAILED",
      }));
    } finally {
      client.release();
    }
  }

  async retry(command: RetryFailedJobCommand & {
    actorId: string;
    requestedAt: Date;
  }): Promise<RetryFailedJobResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const replay = (await client.query<RetryAuditRow>(`
        SELECT job_id::text FROM rewards_job_manual_retries WHERE idempotency_key = $1
      `, [command.idempotencyKey])).rows[0];
      if (replay) {
        if (replay.job_id !== command.jobId) throw rewardsErrors.invalidTransition();
        await client.query("COMMIT");
        return { jobId: replay.job_id, status: "PENDING", replayed: true };
      }
      const job = (await client.query<JobStatusRow>(`
        SELECT status FROM scheduled_rewards_jobs WHERE id = $1 FOR UPDATE
      `, [command.jobId])).rows[0];
      if (!job || job.status !== "FAILED") throw rewardsErrors.invalidTransition();
      await client.query(`
        INSERT INTO rewards_job_manual_retries (
          id, job_id, actor_id, reason_code, explanation, idempotency_key,
          status_before, status_after, requested_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'FAILED', 'PENDING', $7, $7)
      `, [this.generateId(), command.jobId, command.actorId, command.reasonCode,
        command.explanation, command.idempotencyKey, command.requestedAt]);
      const updated = await client.query(`
        UPDATE scheduled_rewards_jobs
        SET status = 'PENDING', completed_at = NULL, locked_at = NULL, locked_by = NULL,
          updated_at = $2
        WHERE id = $1 AND status = 'FAILED'
      `, [command.jobId, command.requestedAt]);
      if (updated.rowCount !== 1) throw rewardsErrors.invalidTransition();
      await client.query("COMMIT");
      return { jobId: command.jobId, status: "PENDING", replayed: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function authorize(actor: RewardsJobOperator, permission: string): void {
  if (!actor.id.trim() || !actor.permissions.includes(permission)) {
    throw rewardsErrors.forbidden();
  }
  assertSafeText("Job audit actor ID", actor.id, 120);
}
