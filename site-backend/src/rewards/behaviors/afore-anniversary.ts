import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { PointIssuancePort } from "../ledger/issuance.js";
import { normalizeRewardEvent } from "../ledger/reward-event.js";
import { RewardsError, rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";

export const aforeAnniversaryMonths = [6, 12, 18] as const;
export type AforeAnniversaryMonths = (typeof aforeAnniversaryMonths)[number];

export interface AforeRelationEvidence {
  accountId: RewardsAccountId;
  customerId: CustomerId;
  relationId: string;
  startedAt: Date;
}

export interface AforeAnniversaryScheduleResult {
  scheduledJobs: number;
  existingJobs: number;
}

export interface AforeAnniversarySchedulePort {
  schedule(evidence: AforeRelationEvidence, observedAt: Date): Promise<AforeAnniversaryScheduleResult>;
}

export class PostgresAforeAnniversarySchedule implements AforeAnniversarySchedulePort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async schedule(
    evidence: AforeRelationEvidence,
    observedAt: Date,
  ): Promise<AforeAnniversaryScheduleResult> {
    const relationId = bounded("AFORE relation ID", evidence.relationId, 120);
    if (Number.isNaN(evidence.startedAt.getTime()) || evidence.startedAt > observedAt) {
      throw new Error("AFORE relation start time must be valid and observed chronologically");
    }
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
      `, [evidence.accountId])).rows[0];
      if (!account || account.customer_id !== evidence.customerId) throw rewardsErrors.notEligible();
      let scheduledJobs = 0;
      for (const months of aforeAnniversaryMonths) {
        const inserted = await client.query(`
          INSERT INTO scheduled_rewards_jobs (
            id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
          ) VALUES ($1, 'AFORE_ANNIVERSARY', $2, $3, 'PENDING', $4::jsonb, $5, $5)
          ON CONFLICT (job_type, business_key) DO NOTHING
        `, [this.generateId(), anniversaryKey(relationId, months), addUtcMonths(evidence.startedAt, months),
          JSON.stringify({ accountId: evidence.accountId, customerId: evidence.customerId,
            relationId, startedAt: evidence.startedAt.toISOString(), months }), observedAt]);
        scheduledJobs += inserted.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return { scheduledJobs, existingJobs: aforeAnniversaryMonths.length - scheduledJobs };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export interface AforeMilestoneEligibilityPort {
  isActive(evidence: AforeRelationEvidence, asOf: Date): Promise<boolean>;
}

export interface AforeAnniversaryBatchResult {
  processedJobs: number;
  awardedJobs: number;
  ineligibleJobs: number;
  failedJobs: number;
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { customer_id: string }
interface AnniversaryJobRow extends QueryResultRow {
  job_id: string;
  account_id: string;
  customer_id: string;
  relation_id: string;
  started_at: string;
  months: AforeAnniversaryMonths;
  due_at: Date;
  attempt_count: number;
}

export class PostgresAforeAnniversaryScheduler {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly issuance: PointIssuancePort,
    private readonly eligibility: AforeMilestoneEligibilityPort,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async processDue(
    asOf: Date,
    batchSize: number,
    workerId: string,
  ): Promise<AforeAnniversaryBatchResult> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new Error("AFORE anniversary batch size must be between 1 and 1000");
    }
    if (!workerId.trim()) throw new Error("AFORE anniversary worker ID cannot be empty");
    const result: AforeAnniversaryBatchResult = {
      processedJobs: 0, awardedJobs: 0, ineligibleJobs: 0, failedJobs: 0,
    };
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const jobs = (await client.query<AnniversaryJobRow>(`
        SELECT id::text AS job_id,
          safe_payload->>'accountId' AS account_id,
          safe_payload->>'customerId' AS customer_id,
          safe_payload->>'relationId' AS relation_id,
          safe_payload->>'startedAt' AS started_at,
          (safe_payload->>'months')::integer AS months,
          due_at, attempt_count
        FROM scheduled_rewards_jobs
        WHERE job_type = 'AFORE_ANNIVERSARY'
          AND status IN ('PENDING', 'FAILED') AND due_at <= $1
        ORDER BY due_at, id LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [asOf, batchSize])).rows;
      for (const job of jobs) {
        result.processedJobs += 1;
        const executionId = this.generateId();
        const attempt = job.attempt_count + 1;
        await client.query(`
          UPDATE scheduled_rewards_jobs SET status = 'RUNNING', attempt_count = $2,
            locked_at = $3, locked_by = $4, updated_at = $3 WHERE id = $1
        `, [job.job_id, attempt, asOf, workerId]);
        await client.query(`
          INSERT INTO rewards_job_executions (
            id, job_id, attempt_number, status, worker_id, started_at
          ) VALUES ($1, $2, $3, 'RUNNING', $4, $5)
        `, [executionId, job.job_id, attempt, workerId, asOf]);
        try {
          const evidence: AforeRelationEvidence = {
            accountId: job.account_id as RewardsAccountId,
            customerId: job.customer_id as CustomerId,
            relationId: job.relation_id,
            startedAt: new Date(job.started_at),
          };
          if (await this.eligibility.isActive(evidence, asOf)) {
            await this.issuance.issue({
              accountId: evidence.accountId,
              ruleCode: anniversaryRuleCode(job.months),
              event: normalizeRewardEvent({
                source: "SCHEDULED",
                sourceId: anniversaryKey(evidence.relationId, job.months),
                eventType: anniversaryRuleCode(job.months),
                customerId: evidence.customerId,
                occurredAt: job.due_at,
                receivedAt: asOf,
                serviceId: evidence.relationId,
                safeMetadata: { activeAforeMonths: job.months },
              }),
              issuedAt: asOf,
            });
            result.awardedJobs += 1;
          } else result.ineligibleJobs += 1;
          await finishJob(client, job.job_id, executionId, asOf, "SUCCEEDED", null);
        } catch (error) {
          result.failedJobs += 1;
          await finishJob(client, job.job_id, executionId, asOf, "FAILED",
            error instanceof RewardsError ? error.code : "afore_anniversary_failed");
        }
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function anniversaryRuleCode(months: AforeAnniversaryMonths): string {
  return `AFORE_ANNIVERSARY_${months}_MONTHS`;
}

export function anniversaryKey(relationId: string, months: AforeAnniversaryMonths): string {
  return `afore-anniversary:${relationId}:${months}m`;
}

export function addUtcMonths(startedAt: Date, months: number): Date {
  if (Number.isNaN(startedAt.getTime()) || !Number.isInteger(months)) {
    throw new Error("AFORE milestone date inputs must be valid");
  }
  const year = startedAt.getUTCFullYear();
  const monthIndex = startedAt.getUTCMonth() + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth,
    Math.min(startedAt.getUTCDate(), lastDay), startedAt.getUTCHours(),
    startedAt.getUTCMinutes(), startedAt.getUTCSeconds(), startedAt.getUTCMilliseconds()));
}

async function finishJob(
  client: PoolClient,
  jobId: string,
  executionId: string,
  at: Date,
  status: "SUCCEEDED" | "FAILED",
  safeErrorCode: string | null,
): Promise<void> {
  if (status === "SUCCEEDED") {
    await client.query(`
      UPDATE scheduled_rewards_jobs SET status = 'SUCCEEDED', completed_at = $2,
        locked_at = NULL, locked_by = NULL, updated_at = $2 WHERE id = $1
    `, [jobId, at]);
    await client.query(`
      UPDATE rewards_job_executions SET status = 'SUCCEEDED', finished_at = $2,
        safe_error_code = NULL WHERE id = $1
    `, [executionId, at]);
    return;
  }
  await client.query(`
    UPDATE scheduled_rewards_jobs SET status = 'FAILED', completed_at = NULL,
      locked_at = NULL, locked_by = NULL, updated_at = $2 WHERE id = $1
  `, [jobId, at]);
  await client.query(`
    UPDATE rewards_job_executions SET status = 'FAILED', finished_at = $2,
      safe_error_code = $3 WHERE id = $1
  `, [executionId, at, safeErrorCode]);
}

function bounded(name: string, value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} cannot be empty`);
  if (normalized.length > maximum) throw new Error(`${name} cannot exceed ${maximum} characters`);
  return normalized;
}
