import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";

export interface PointExpirationBatchResult {
  processedJobs: number;
  expiredLots: number;
  expiredPoints: bigint;
}

export interface PointExpirationPort {
  processDue(asOf: Date, batchSize: number, workerId: string): Promise<PointExpirationBatchResult>;
}

export class ProcessPointExpirations {
  constructor(
    private readonly expiration: PointExpirationPort,
    private readonly clock: Clock,
  ) {}

  execute(batchSize: number, workerId: string): Promise<PointExpirationBatchResult> {
    return this.expiration.processDue(this.clock.now(), batchSize, workerId);
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface ExpirationJobRow extends QueryResultRow {
  job_id: string;
  account_id: string;
  lot_id: string;
  remaining_points: string;
  expired_at: Date | null;
}
interface AttemptRow extends QueryResultRow { attempt_count: number }

export class PostgresPointExpiration implements PointExpirationPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async processDue(
    asOf: Date,
    batchSize: number,
    workerId: string,
  ): Promise<PointExpirationBatchResult> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new Error("Expiration batch size must be between 1 and 1000");
    }
    if (!workerId.trim()) throw new Error("Expiration worker ID cannot be empty");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const jobs = (await client.query<ExpirationJobRow>(`
        SELECT
          job.id::text AS job_id,
          lot.account_id::text,
          lot.id::text AS lot_id,
          lot.remaining_points::text,
          lot.expired_at
        FROM scheduled_rewards_jobs AS job
        JOIN point_lots AS lot ON lot.id = (job.safe_payload->>'lotId')::uuid
        WHERE job.job_type = 'POINT_EXPIRATION'
          AND job.status IN ('PENDING', 'FAILED')
          AND job.due_at <= $1
          AND NOT EXISTS (
            SELECT 1 FROM point_allocations AS allocation
            WHERE allocation.lot_id = lot.id AND allocation.status = 'RESERVED'
          )
        ORDER BY job.due_at, job.id
        LIMIT $2
        FOR UPDATE OF job, lot SKIP LOCKED
      `, [asOf, batchSize])).rows;
      let expiredLots = 0;
      let expiredPoints = 0n;
      for (const job of jobs) {
        const attempt = (await client.query<AttemptRow>(`
          UPDATE scheduled_rewards_jobs
          SET status = 'RUNNING', attempt_count = attempt_count + 1,
              locked_at = $2, locked_by = $3, updated_at = $2
          WHERE id = $1
          RETURNING attempt_count
        `, [job.job_id, asOf, workerId])).rows[0];
        if (!attempt) throw new Error("Expiration job could not be claimed");
        const executionId = this.generateId();
        await client.query(`
          INSERT INTO rewards_job_executions (
            id, job_id, attempt_number, status, worker_id, started_at
          ) VALUES ($1, $2, $3, 'RUNNING', $4, $5)
        `, [executionId, job.job_id, attempt.attempt_count, workerId, asOf]);

        const points = BigInt(job.remaining_points);
        if (job.expired_at === null && points > 0n) {
          const ledgerEntryId = this.generateId();
          await client.query(`
            INSERT INTO ledger_entries (
              id, account_id, entry_type, points_delta, idempotency_key,
              correlation_id, actor_type, reason_code, created_at
            ) VALUES ($1, $2, 'EXPIRATION', $3, $4, $5, 'SYSTEM', 'LOT_EXPIRATION', $6)
            ON CONFLICT (idempotency_key) DO NOTHING
          `, [
            ledgerEntryId,
            job.account_id,
            (-points).toString(),
            pointExpirationIdempotencyKey(job.lot_id),
            this.generateId(),
            asOf,
          ]);
          const entry = (await client.query<{ id: string }>(`
            SELECT id::text FROM ledger_entries WHERE idempotency_key = $1
          `, [pointExpirationIdempotencyKey(job.lot_id)])).rows[0];
          if (!entry) throw new Error("Expiration ledger entry was not persisted");
          await client.query(`
            INSERT INTO point_allocations (
              id, ledger_entry_id, lot_id, points, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'EXPIRED', $5, $5)
            ON CONFLICT (ledger_entry_id, lot_id) DO NOTHING
          `, [this.generateId(), entry.id, job.lot_id, points.toString(), asOf]);
          const expired = await client.query(`
            UPDATE point_lots
            SET remaining_points = 0, expired_at = $2, updated_at = $2
            WHERE id = $1 AND expired_at IS NULL
          `, [job.lot_id, asOf]);
          if (expired.rowCount === 1) {
            const account = await client.query(`
              UPDATE rewards_accounts
              SET available_points = available_points - $2, updated_at = $3
              WHERE id = $1 AND available_points >= $2
            `, [job.account_id, points.toString(), asOf]);
            if (account.rowCount !== 1) throw new Error("Expiration would make balance negative");
            expiredLots += 1;
            expiredPoints += points;
          }
        }
        await client.query(`
          UPDATE scheduled_rewards_jobs
          SET status = 'SUCCEEDED', completed_at = $2, locked_at = NULL,
              locked_by = NULL, updated_at = $2
          WHERE id = $1
        `, [job.job_id, asOf]);
        await client.query(`
          UPDATE rewards_job_executions
          SET status = 'SUCCEEDED', finished_at = $2
          WHERE id = $1
        `, [executionId, asOf]);
      }
      await client.query("COMMIT");
      return { processedJobs: jobs.length, expiredLots, expiredPoints };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function pointExpirationIdempotencyKey(lotId: string): string {
  const normalized = lotId.trim();
  if (!normalized) throw new Error("Point lot ID cannot be empty");
  return `point-expiration:${normalized}`;
}
