import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import { addUtcMonths } from "../behaviors/afore-anniversary.js";
import type { PointIssuancePort } from "../ledger/issuance.js";
import { normalizeRewardEvent } from "../ledger/reward-event.js";
import type { Clock } from "../shared/clock.js";
import { RewardsError, rewardsErrors } from "../shared/errors.js";
import type { CustomerId, ReferralId, RewardsAccountId } from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";

export const referralPermanenceMonths = [6, 12] as const;
export type ReferralPermanenceMonths = (typeof referralPermanenceMonths)[number];

export interface ScheduleReferralPermanenceCommand {
  referralId: ReferralId;
  activeServiceStartedAt: Date;
}

export interface ReferralPermanenceScheduleResult {
  scheduledJobs: number;
  existingJobs: number;
}

export interface ReferralPermanenceSchedulePort {
  schedule(
    command: ScheduleReferralPermanenceCommand & { observedAt: Date },
  ): Promise<ReferralPermanenceScheduleResult>;
}

export class ScheduleReferralPermanence {
  constructor(
    private readonly schedulePort: ReferralPermanenceSchedulePort,
    private readonly clock: Clock,
  ) {}

  schedule(command: ScheduleReferralPermanenceCommand): Promise<ReferralPermanenceScheduleResult> {
    requireIdentifier(command.referralId);
    const observedAt = this.clock.now();
    if (Number.isNaN(command.activeServiceStartedAt.getTime())
      || command.activeServiceStartedAt > observedAt) {
      throw new Error("Referral active-service start must be valid and already observed");
    }
    return this.schedulePort.schedule({ ...command, observedAt });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface ReferralScheduleRow extends QueryResultRow {
  status: string;
  referred_customer_id: string | null;
  active_service_started_at: Date | null;
}

export class PostgresReferralPermanenceSchedule implements ReferralPermanenceSchedulePort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async schedule(
    command: ScheduleReferralPermanenceCommand & { observedAt: Date },
  ): Promise<ReferralPermanenceScheduleResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const referral = (await client.query<ReferralScheduleRow>(`
        SELECT status, referred_customer_id::text, active_service_started_at
        FROM referrals WHERE id = $1 FOR UPDATE
      `, [command.referralId])).rows[0];
      if (!referral || !["REGISTERED", "ACTIVE"].includes(referral.status)
        || referral.referred_customer_id === null) {
        throw rewardsErrors.invalidTransition();
      }
      if (referral.active_service_started_at !== null
        && referral.active_service_started_at.getTime() !== command.activeServiceStartedAt.getTime()) {
        throw rewardsErrors.invalidTransition();
      }
      await client.query(`
        UPDATE referrals SET status = 'ACTIVE', active_service_started_at = $2, updated_at = $3
        WHERE id = $1
      `, [command.referralId, command.activeServiceStartedAt, command.observedAt]);

      let scheduledJobs = 0;
      for (const months of referralPermanenceMonths) {
        const inserted = await client.query(`
          INSERT INTO scheduled_rewards_jobs (
            id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
          ) VALUES ($1, 'REFERRAL_PERMANENCE', $2, $3, 'PENDING', $4::jsonb, $5, $5)
          ON CONFLICT (job_type, business_key) DO NOTHING
        `, [this.generateId(), referralPermanenceKey(command.referralId, months),
          addUtcMonths(command.activeServiceStartedAt, months),
          JSON.stringify({ referralId: command.referralId, months }), command.observedAt]);
        scheduledJobs += inserted.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return { scheduledJobs, existingJobs: referralPermanenceMonths.length - scheduledJobs };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export interface ReferralPermanenceEvidence {
  referralId: ReferralId;
  referringAccountId: RewardsAccountId;
  referringCustomerId: CustomerId;
  referredCustomerId: CustomerId;
  activeServiceStartedAt: Date;
  months: ReferralPermanenceMonths;
}

export interface ReferralPermanenceEligibilityPort {
  isEligible(evidence: ReferralPermanenceEvidence, asOf: Date): Promise<boolean>;
}

export interface ReferralPermanenceBatchResult {
  processedJobs: number;
  awardedJobs: number;
  ineligibleJobs: number;
  failedJobs: number;
}

interface PermanenceJobRow extends QueryResultRow {
  job_id: string;
  referral_id: string;
  months: ReferralPermanenceMonths;
  due_at: Date;
  attempt_count: number;
}
interface ReferralEvidenceRow extends QueryResultRow {
  referring_account_id: string;
  referring_customer_id: string;
  referred_customer_id: string | null;
  active_service_started_at: Date | null;
  status: string;
}

export class PostgresReferralPermanenceScheduler {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly issuance: PointIssuancePort,
    private readonly eligibility: ReferralPermanenceEligibilityPort,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async processDue(
    asOf: Date,
    batchSize: number,
    workerId: string,
  ): Promise<ReferralPermanenceBatchResult> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new Error("Referral permanence batch size must be between 1 and 1000");
    }
    if (!workerId.trim()) throw new Error("Referral permanence worker ID cannot be empty");
    const result: ReferralPermanenceBatchResult = {
      processedJobs: 0, awardedJobs: 0, ineligibleJobs: 0, failedJobs: 0,
    };
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const jobs = (await client.query<PermanenceJobRow>(`
        SELECT id::text AS job_id,
          safe_payload->>'referralId' AS referral_id,
          (safe_payload->>'months')::integer AS months,
          due_at, attempt_count
        FROM scheduled_rewards_jobs
        WHERE job_type = 'REFERRAL_PERMANENCE'
          AND status IN ('PENDING', 'FAILED') AND due_at <= $1
        ORDER BY due_at, id LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [asOf, batchSize])).rows;
      for (const job of jobs) {
        result.processedJobs += 1;
        const executionId = this.generateId();
        const attempt = job.attempt_count + 1;
        await startJob(client, job.job_id, executionId, attempt, workerId, asOf);
        await client.query("SAVEPOINT referral_permanence_job");
        try {
          const evidence = await loadEvidence(client, job);
          let awarded = false;
          if (await this.eligibility.isEligible(evidence, job.due_at)) {
            await this.issuance.issue({
              accountId: evidence.referringAccountId,
              ruleCode: referralPermanenceRuleCode(job.months),
              event: normalizeRewardEvent({
                source: "SCHEDULED",
                sourceId: referralPermanenceKey(evidence.referralId, job.months),
                eventType: referralPermanenceRuleCode(job.months),
                customerId: evidence.referringCustomerId,
                occurredAt: job.due_at,
                receivedAt: asOf,
                serviceId: evidence.referralId,
                safeMetadata: { referralId: evidence.referralId, activeAforeMonths: job.months },
              }),
              issuedAt: asOf,
            });
            awarded = true;
          }
          await finishJob(client, job.job_id, executionId, asOf, "SUCCEEDED", null);
          await client.query("RELEASE SAVEPOINT referral_permanence_job");
          if (awarded) result.awardedJobs += 1;
          else result.ineligibleJobs += 1;
        } catch (error) {
          result.failedJobs += 1;
          await client.query("ROLLBACK TO SAVEPOINT referral_permanence_job");
          await finishJob(client, job.job_id, executionId, asOf, "FAILED",
            error instanceof RewardsError ? error.code : "referral_permanence_failed");
          await client.query("RELEASE SAVEPOINT referral_permanence_job");
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

export function referralPermanenceRuleCode(months: ReferralPermanenceMonths): string {
  return `REFERRAL_PERMANENCE_${months}_MONTHS`;
}

export function referralPermanenceKey(
  referralId: ReferralId,
  months: ReferralPermanenceMonths,
): string {
  return `referral-permanence:${referralId}:${months}m`;
}

async function loadEvidence(
  client: PoolClient,
  job: PermanenceJobRow,
): Promise<ReferralPermanenceEvidence> {
  const row = (await client.query<ReferralEvidenceRow>(`
    SELECT referring_account_id::text, referring_customer_id::text,
      referred_customer_id::text, active_service_started_at, status
    FROM referrals WHERE id = $1
  `, [job.referral_id])).rows[0];
  if (!row || row.status !== "ACTIVE" || row.referred_customer_id === null
    || row.active_service_started_at === null) {
    throw rewardsErrors.invalidTransition();
  }
  return {
    referralId: job.referral_id as ReferralId,
    referringAccountId: row.referring_account_id as RewardsAccountId,
    referringCustomerId: row.referring_customer_id as CustomerId,
    referredCustomerId: row.referred_customer_id as CustomerId,
    activeServiceStartedAt: row.active_service_started_at,
    months: job.months,
  };
}

async function startJob(
  client: PoolClient,
  jobId: string,
  executionId: string,
  attempt: number,
  workerId: string,
  at: Date,
): Promise<void> {
  await client.query(`
    UPDATE scheduled_rewards_jobs SET status = 'RUNNING', attempt_count = $2,
      locked_at = $3, locked_by = $4, updated_at = $3 WHERE id = $1
  `, [jobId, attempt, at, workerId]);
  await client.query(`
    INSERT INTO rewards_job_executions (
      id, job_id, attempt_number, status, worker_id, started_at
    ) VALUES ($1, $2, $3, 'RUNNING', $4, $5)
  `, [executionId, jobId, attempt, workerId, at]);
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
      UPDATE scheduled_rewards_jobs
      SET status = 'SUCCEEDED', completed_at = $2,
        locked_at = NULL, locked_by = NULL, updated_at = $2
      WHERE id = $1
    `, [jobId, at]);
    await client.query(`
      UPDATE rewards_job_executions
      SET status = 'SUCCEEDED', finished_at = $2, safe_error_code = NULL
      WHERE id = $1
    `, [executionId, at]);
    return;
  }
  await client.query(`
    UPDATE scheduled_rewards_jobs
    SET status = 'FAILED', completed_at = NULL,
      locked_at = NULL, locked_by = NULL, updated_at = $2
    WHERE id = $1
  `, [jobId, at]);
  await client.query(`
    UPDATE rewards_job_executions
    SET status = 'FAILED', finished_at = $2, safe_error_code = $3
    WHERE id = $1
  `, [executionId, at, safeErrorCode]);
}
