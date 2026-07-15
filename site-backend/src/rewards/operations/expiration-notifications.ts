import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { RewardsAccountId } from "../shared/identifiers.js";

export const expirationNotificationWindows = [60, 30] as const;
export type ExpirationNotificationWindow = (typeof expirationNotificationWindows)[number];

export interface ExpirationNotificationCohort {
  accountId: RewardsAccountId;
  expiresAt: Date;
}

export interface ExpirationNotificationScheduleResult {
  scheduledJobs: number;
  existingJobs: number;
}

export interface ExpirationNotificationBatchResult {
  processedJobs: number;
  deliveredJobs: number;
  skippedJobs: number;
  replayedJobs: number;
  failedJobs: number;
}

export interface ExpirationNotificationDeliveryCommand {
  accountId: RewardsAccountId;
  cohortExpiresAt: Date;
  windowDays: ExpirationNotificationWindow;
  idempotencyKey: string;
}

export interface ExpirationNotificationDeliveryPort {
  deliver(command: ExpirationNotificationDeliveryCommand): Promise<{
    safeOutcomeCode: string;
  }>;
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface CohortRow extends QueryResultRow { account_id: string; expires_at: Date }
interface NotificationJobRow extends QueryResultRow {
  job_id: string;
  account_id: string;
  expires_at: string;
  window_days: ExpirationNotificationWindow;
  due_at: Date;
  attempt_count: number;
}
interface DeliveryRow extends QueryResultRow { status: string }

export class PostgresExpirationNotificationSchedule {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async scheduleExisting(
    observedAt: Date,
    batchSize: number,
  ): Promise<ExpirationNotificationScheduleResult> {
    requireBatchSize(batchSize);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const cohorts = (await client.query<CohortRow>(`
        SELECT lot.account_id::text, lot.expires_at
        FROM point_lots lot
        WHERE lot.expired_at IS NULL AND lot.remaining_points > 0
          AND EXISTS (
            SELECT 1
            FROM (VALUES (60), (30)) AS notification_window(days)
            WHERE NOT EXISTS (
              SELECT 1 FROM scheduled_rewards_jobs job
              WHERE job.job_type = 'POINT_EXPIRATION_NOTIFICATION'
                AND job.business_key =
                  'point-expiration-notification:' || lot.account_id::text || ':' ||
                  to_char(lot.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ':' ||
                  notification_window.days::text || 'd'
            )
          )
        GROUP BY lot.account_id, lot.expires_at
        ORDER BY lot.expires_at, lot.account_id
        LIMIT $1
      `, [batchSize])).rows;
      let scheduledJobs = 0;
      let existingJobs = 0;
      for (const cohort of cohorts) {
        const scheduled = await scheduleExpirationNotificationCohortInTransaction(
          client,
          {
            accountId: cohort.account_id as RewardsAccountId,
            expiresAt: cohort.expires_at,
          },
          observedAt,
          this.generateId,
        );
        scheduledJobs += scheduled.scheduledJobs;
        existingJobs += scheduled.existingJobs;
      }
      await client.query("COMMIT");
      return { scheduledJobs, existingJobs };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export class PostgresExpirationNotificationScheduler {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly delivery: ExpirationNotificationDeliveryPort,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async processDue(
    asOf: Date,
    batchSize: number,
    workerId: string,
  ): Promise<ExpirationNotificationBatchResult> {
    requireBatchSize(batchSize);
    if (!workerId.trim()) throw new Error("Expiration notification worker ID cannot be empty");
    const result: ExpirationNotificationBatchResult = {
      processedJobs: 0,
      deliveredJobs: 0,
      skippedJobs: 0,
      replayedJobs: 0,
      failedJobs: 0,
    };
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const jobs = (await client.query<NotificationJobRow>(`
        SELECT id::text AS job_id,
          safe_payload->>'accountId' AS account_id,
          safe_payload->>'expiresAt' AS expires_at,
          (safe_payload->>'windowDays')::integer AS window_days,
          due_at, attempt_count
        FROM scheduled_rewards_jobs
        WHERE job_type = 'POINT_EXPIRATION_NOTIFICATION'
          AND status IN ('PENDING', 'FAILED') AND due_at <= $1
        ORDER BY due_at, id LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [asOf, batchSize])).rows;
      for (const job of jobs) {
        result.processedJobs += 1;
        const executionId = this.generateId();
        const attempt = job.attempt_count + 1;
        await startJob(client, job.job_id, executionId, attempt, workerId, asOf);
        await client.query("SAVEPOINT expiration_notification_job");
        try {
          let outcome: "DELIVERED" | "SKIPPED" | "REPLAYED";
          const cohortExpiresAt = new Date(job.expires_at);
          if (Number.isNaN(cohortExpiresAt.getTime())
            || !isExpirationWindow(job.window_days)) {
            throw new Error("Expiration notification job payload is invalid");
          }
          const key = expirationNotificationKey(
            job.account_id as RewardsAccountId,
            cohortExpiresAt,
            job.window_days,
          );
          const delivery = await getOrStartDelivery(
            client,
            job,
            cohortExpiresAt,
            key,
            asOf,
            this.generateId,
          );
          if (delivery.status === "DELIVERED" || delivery.status === "SKIPPED") {
            outcome = "REPLAYED";
          } else if (!await hasUnusedPoints(client, job.account_id, cohortExpiresAt)) {
            await finishDelivery(client, key, "SKIPPED", "NO_UNUSED_POINTS", asOf);
            outcome = "SKIPPED";
          } else {
            const delivered = await this.delivery.deliver({
              accountId: job.account_id as RewardsAccountId,
              cohortExpiresAt,
              windowDays: job.window_days,
              idempotencyKey: key,
            });
            const safeOutcomeCode = requireSafeOutcomeCode(delivered.safeOutcomeCode);
            await finishDelivery(client, key, "DELIVERED", safeOutcomeCode, asOf);
            outcome = "DELIVERED";
          }
          await finishJob(client, job.job_id, executionId, asOf, "SUCCEEDED", null);
          await client.query("RELEASE SAVEPOINT expiration_notification_job");
          if (outcome === "DELIVERED") result.deliveredJobs += 1;
          if (outcome === "SKIPPED") result.skippedJobs += 1;
          if (outcome === "REPLAYED") result.replayedJobs += 1;
        } catch {
          result.failedJobs += 1;
          await client.query("ROLLBACK TO SAVEPOINT expiration_notification_job");
          const cohortExpiresAt = new Date(job.expires_at);
          if (!Number.isNaN(cohortExpiresAt.getTime()) && isExpirationWindow(job.window_days)) {
            const key = expirationNotificationKey(
              job.account_id as RewardsAccountId,
              cohortExpiresAt,
              job.window_days,
            );
            await recordFailedDelivery(client, job, cohortExpiresAt, key, asOf, this.generateId);
          }
          await finishJob(client, job.job_id, executionId, asOf, "FAILED",
            "expiration_notification_failed");
          await client.query("RELEASE SAVEPOINT expiration_notification_job");
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

export async function scheduleExpirationNotificationCohortInTransaction(
  client: PoolClient,
  cohort: ExpirationNotificationCohort,
  observedAt: Date,
  generateId: () => string = randomUUID,
): Promise<ExpirationNotificationScheduleResult> {
  if (Number.isNaN(cohort.expiresAt.getTime()) || Number.isNaN(observedAt.getTime())) {
    throw new Error("Expiration notification schedule times must be valid");
  }
  let scheduledJobs = 0;
  for (const windowDays of expirationNotificationWindows) {
    const inserted = await client.query(`
      INSERT INTO scheduled_rewards_jobs (
        id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
      ) VALUES ($1, 'POINT_EXPIRATION_NOTIFICATION', $2, $3, 'PENDING', $4::jsonb, $5, $5)
      ON CONFLICT (job_type, business_key) DO NOTHING
    `, [
      generateId(),
      expirationNotificationKey(cohort.accountId, cohort.expiresAt, windowDays),
      expirationNotificationDueAt(cohort.expiresAt, windowDays),
      JSON.stringify({
        accountId: cohort.accountId,
        expiresAt: cohort.expiresAt.toISOString(),
        windowDays,
      }),
      observedAt,
    ]);
    scheduledJobs += inserted.rowCount ?? 0;
  }
  return { scheduledJobs, existingJobs: expirationNotificationWindows.length - scheduledJobs };
}

export function expirationNotificationDueAt(
  expiresAt: Date,
  windowDays: ExpirationNotificationWindow,
): Date {
  if (Number.isNaN(expiresAt.getTime()) || !isExpirationWindow(windowDays)) {
    throw new Error("Expiration notification date inputs must be valid");
  }
  return new Date(expiresAt.getTime() - windowDays * 24 * 60 * 60 * 1000);
}

export function expirationNotificationKey(
  accountId: RewardsAccountId,
  expiresAt: Date,
  windowDays: ExpirationNotificationWindow,
): string {
  if (!accountId.trim() || Number.isNaN(expiresAt.getTime()) || !isExpirationWindow(windowDays)) {
    throw new Error("Expiration notification key inputs must be valid");
  }
  return `point-expiration-notification:${accountId}:${expiresAt.toISOString()}:${windowDays}d`;
}

function isExpirationWindow(value: number): value is ExpirationNotificationWindow {
  return value === 60 || value === 30;
}

function requireBatchSize(batchSize: number): void {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Expiration notification batch size must be between 1 and 1000");
  }
}

async function hasUnusedPoints(
  client: PoolClient,
  accountId: string,
  expiresAt: Date,
): Promise<boolean> {
  const row = (await client.query<{ has_points: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM point_lots
      WHERE account_id = $1 AND expires_at = $2
        AND expired_at IS NULL AND remaining_points > 0
    ) AS has_points
  `, [accountId, expiresAt])).rows[0];
  return row?.has_points ?? false;
}

async function getOrStartDelivery(
  client: PoolClient,
  job: NotificationJobRow,
  expiresAt: Date,
  key: string,
  at: Date,
  generateId: () => string,
): Promise<DeliveryRow> {
  await client.query(`
    INSERT INTO expiration_notification_deliveries (
      id, job_id, account_id, cohort_expires_at, window_days,
      status, idempotency_key, attempt_count, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, 1, $7, $7)
    ON CONFLICT (idempotency_key) DO UPDATE
      SET attempt_count = expiration_notification_deliveries.attempt_count + 1,
          status = CASE
            WHEN expiration_notification_deliveries.status IN ('DELIVERED', 'SKIPPED')
              THEN expiration_notification_deliveries.status
            ELSE 'PENDING'
          END,
          safe_outcome_code = CASE
            WHEN expiration_notification_deliveries.status IN ('DELIVERED', 'SKIPPED')
              THEN expiration_notification_deliveries.safe_outcome_code
            ELSE NULL
          END,
          updated_at = $7
  `, [generateId(), job.job_id, job.account_id, expiresAt, job.window_days, key, at]);
  const delivery = (await client.query<DeliveryRow>(`
    SELECT status FROM expiration_notification_deliveries WHERE idempotency_key = $1
  `, [key])).rows[0];
  if (!delivery) throw new Error("Expiration notification delivery was not persisted");
  return delivery;
}

async function finishDelivery(
  client: PoolClient,
  key: string,
  status: "DELIVERED" | "SKIPPED",
  safeOutcomeCode: string,
  at: Date,
): Promise<void> {
  await client.query(`
    UPDATE expiration_notification_deliveries
    SET status = $2::varchar, safe_outcome_code = $3::varchar,
      delivered_at = CASE
        WHEN $2::varchar = 'DELIVERED' THEN $4::timestamptz
        ELSE NULL::timestamptz
      END,
      updated_at = $4::timestamptz
    WHERE idempotency_key = $1
  `, [key, status, safeOutcomeCode, at]);
}

async function recordFailedDelivery(
  client: PoolClient,
  job: NotificationJobRow,
  expiresAt: Date,
  key: string,
  at: Date,
  generateId: () => string,
): Promise<void> {
  await client.query(`
    INSERT INTO expiration_notification_deliveries (
      id, job_id, account_id, cohort_expires_at, window_days,
      status, idempotency_key, safe_outcome_code, attempt_count, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'FAILED', $6,
      'DELIVERY_FAILED', 1, $7, $7)
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = CASE
            WHEN expiration_notification_deliveries.status IN ('DELIVERED', 'SKIPPED')
              THEN expiration_notification_deliveries.status
            ELSE 'FAILED'
          END,
          safe_outcome_code = CASE
            WHEN expiration_notification_deliveries.status IN ('DELIVERED', 'SKIPPED')
              THEN expiration_notification_deliveries.safe_outcome_code
            ELSE 'DELIVERY_FAILED'
          END,
          attempt_count = expiration_notification_deliveries.attempt_count + 1,
          updated_at = $7
  `, [generateId(), job.job_id, job.account_id, expiresAt, job.window_days, key, at]);
}

function requireSafeOutcomeCode(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Z0-9_]{1,80}$/.test(normalized)) {
    throw new Error("Expiration notification outcome code is invalid");
  }
  return normalized;
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
