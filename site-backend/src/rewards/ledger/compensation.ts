import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CorrelationId,
  LedgerEntryId,
  PointLotId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import { assertSafeText } from "../shared/privacy.js";
import { scheduleExpirationNotificationCohortInTransaction } from "../operations/expiration-notifications.js";
import { allocateFifoLots } from "./allocation.js";

export interface RewardsOperator {
  id: string;
  permissions: readonly string[];
}

export interface AdjustmentCommand {
  accountId: RewardsAccountId;
  pointsDelta: bigint;
  idempotencyKey: string;
  correlationId: CorrelationId;
  reasonCode: string;
  explanation: string;
}

export interface RefundCommand {
  originalConsumptionEntryId: LedgerEntryId;
  points: bigint | null;
  idempotencyKey: string;
  reasonCode: string;
  explanation: string;
}

export interface LedgerCompensationResult {
  ledgerEntryId: LedgerEntryId;
  pointsDelta: bigint;
  availablePoints: bigint;
  replayed: boolean;
}

export interface LedgerCompensationPort {
  adjust(
    command: AdjustmentCommand & { actorId: string; createdAt: Date },
  ): Promise<LedgerCompensationResult>;
  refund(
    command: RefundCommand & { actorId: string; createdAt: Date },
  ): Promise<LedgerCompensationResult>;
}

export class CompensatePointLedger {
  constructor(
    private readonly compensation: LedgerCompensationPort,
    private readonly clock: Clock,
  ) {}

  adjust(actor: RewardsOperator, command: AdjustmentCommand): Promise<LedgerCompensationResult> {
    authorize(actor);
    validateAudit(command.reasonCode, command.explanation, command.idempotencyKey);
    if (command.pointsDelta === 0n) throw new Error("Adjustment cannot be zero");
    return this.compensation.adjust({ ...command, actorId: actor.id, createdAt: this.clock.now() });
  }

  refund(actor: RewardsOperator, command: RefundCommand): Promise<LedgerCompensationResult> {
    authorize(actor);
    validateAudit(command.reasonCode, command.explanation, command.idempotencyKey);
    if (command.points !== null && command.points <= 0n) {
      throw new Error("Refund points must be positive");
    }
    return this.compensation.refund({ ...command, actorId: actor.id, createdAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { available_points: string }
interface ReplayRow extends QueryResultRow { id: string; points_delta: string; available_points: string }
interface LotRow extends QueryResultRow { lot_id: string; available_points: string }
interface ConsumptionRow extends QueryResultRow {
  account_id: string;
  points: string;
  correlation_id: string;
  refunded_points: string;
}

export class PostgresLedgerCompensation implements LedgerCompensationPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  adjust(
    command: AdjustmentCommand & { actorId: string; createdAt: Date },
  ): Promise<LedgerCompensationResult> {
    return this.transaction(async (client) => {
      const replay = await findReplay(client, command.accountId, command.idempotencyKey);
      if (replay) return replay;
      if (command.pointsDelta > 0n) {
        return this.credit(client, {
          ...command,
          entryType: "ADJUSTMENT",
          points: command.pointsDelta,
        });
      }

      const points = -command.pointsDelta;
      await lockAccount(client, command.accountId);
      const lots = (await client.query<LotRow>(`
        SELECT lot.id::text AS lot_id,
          greatest(lot.remaining_points - COALESCE((
            SELECT sum(a.points) FROM point_allocations a
            WHERE a.lot_id = lot.id AND a.status = 'RESERVED'
          ), 0), 0)::text AS available_points
        FROM point_lots lot
        WHERE lot.account_id = $1 AND lot.expired_at IS NULL
          AND lot.expires_at > $2 AND lot.remaining_points > 0
        ORDER BY lot.expires_at, lot.issued_at, lot.id
        FOR UPDATE OF lot
      `, [command.accountId, command.createdAt])).rows;
      const allocations = allocateFifoLots(lots.map((lot) => ({
        lotId: lot.lot_id as PointLotId,
        availablePoints: BigInt(lot.available_points),
      })), points);
      const ledgerEntryId = this.generateId() as LedgerEntryId;
      await client.query(`
        INSERT INTO ledger_entries (
          id, account_id, entry_type, points_delta, idempotency_key, correlation_id,
          actor_type, actor_id, reason_code, explanation, created_at
        ) VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'OPERATOR', $6, $7, $8, $9)
      `, [ledgerEntryId, command.accountId, command.pointsDelta.toString(), command.idempotencyKey,
        command.correlationId, command.actorId, command.reasonCode, command.explanation, command.createdAt]);
      for (const allocation of allocations) {
        await client.query(`
          INSERT INTO point_allocations (
            id, ledger_entry_id, lot_id, points, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'CONSUMED', $5, $5)
        `, [this.generateId(), ledgerEntryId, allocation.lotId, allocation.points.toString(), command.createdAt]);
        const changed = await client.query(`
          UPDATE point_lots SET remaining_points = remaining_points - $2, updated_at = $3
          WHERE id = $1 AND remaining_points >= $2
        `, [allocation.lotId, allocation.points.toString(), command.createdAt]);
        if (changed.rowCount !== 1) throw rewardsErrors.insufficientPoints();
      }
      const account = (await client.query<AccountRow>(`
        UPDATE rewards_accounts
        SET available_points = available_points - $2, updated_at = $3
        WHERE id = $1 AND available_points >= $2
        RETURNING available_points::text
      `, [command.accountId, points.toString(), command.createdAt])).rows[0];
      if (!account) throw rewardsErrors.insufficientPoints();
      return {
        ledgerEntryId,
        pointsDelta: command.pointsDelta,
        availablePoints: BigInt(account.available_points),
        replayed: false,
      };
    });
  }

  refund(
    command: RefundCommand & { actorId: string; createdAt: Date },
  ): Promise<LedgerCompensationResult> {
    return this.transaction(async (client) => {
      const original = (await client.query<ConsumptionRow>(`
        SELECT
          original.account_id::text,
          abs(original.points_delta)::text AS points,
          original.correlation_id::text,
          COALESCE((
            SELECT sum(refund.points_delta)
            FROM ledger_entries refund
            WHERE refund.correlation_id = original.correlation_id
              AND refund.entry_type = 'REFUND'
          ), 0)::text AS refunded_points
        FROM ledger_entries original
        WHERE original.id = $1 AND original.entry_type = 'CONSUMPTION'
        FOR UPDATE OF original
      `, [command.originalConsumptionEntryId])).rows[0];
      if (!original) throw rewardsErrors.invalidTransition();
      const accountId = original.account_id as RewardsAccountId;
      const replay = await findReplay(client, accountId, command.idempotencyKey);
      if (replay) return replay;
      const refundable = BigInt(original.points) - BigInt(original.refunded_points);
      const points = command.points ?? refundable;
      if (points <= 0n || points > refundable) throw rewardsErrors.invalidTransition();
      return this.credit(client, {
        ...command,
        accountId,
        correlationId: original.correlation_id as CorrelationId,
        entryType: "REFUND",
        points,
      });
    });
  }

  private async credit(
    client: PoolClient,
    command: {
      accountId: RewardsAccountId;
      correlationId: CorrelationId;
      entryType: "ADJUSTMENT" | "REFUND";
      points: bigint;
      idempotencyKey: string;
      actorId: string;
      reasonCode: string;
      explanation: string;
      createdAt: Date;
    },
  ): Promise<LedgerCompensationResult> {
    await lockAccount(client, command.accountId);
    const ledgerEntryId = this.generateId() as LedgerEntryId;
    const lotId = this.generateId();
    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, entry_type, points_delta, idempotency_key, correlation_id,
        actor_type, actor_id, reason_code, explanation, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'OPERATOR', $7, $8, $9, $10)
    `, [ledgerEntryId, command.accountId, command.entryType, command.points.toString(),
      command.idempotencyKey, command.correlationId, command.actorId, command.reasonCode,
      command.explanation, command.createdAt]);
    const lot = await client.query<{ expires_at: Date }>(`
      INSERT INTO point_lots (
        id, account_id, source_ledger_entry_id, issued_points, remaining_points,
        issued_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $4, $5, $5::timestamptz + INTERVAL '18 months', $5, $5)
      RETURNING expires_at
    `, [lotId, command.accountId, ledgerEntryId, command.points.toString(), command.createdAt]);
    await client.query(`
      INSERT INTO scheduled_rewards_jobs (
        id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
      ) VALUES ($1, 'POINT_EXPIRATION', $2, $3, 'PENDING', $4::jsonb, $5, $5)
    `, [this.generateId(), lotId, lot.rows[0]!.expires_at,
      JSON.stringify({ lotId, accountId: command.accountId }), command.createdAt]);
    await scheduleExpirationNotificationCohortInTransaction(
      client,
      { accountId: command.accountId, expiresAt: lot.rows[0]!.expires_at },
      command.createdAt,
      this.generateId,
    );
    const account = (await client.query<AccountRow>(`
      UPDATE rewards_accounts SET available_points = available_points + $2, updated_at = $3
      WHERE id = $1 RETURNING available_points::text
    `, [command.accountId, command.points.toString(), command.createdAt])).rows[0]!;
    return {
      ledgerEntryId,
      pointsDelta: command.points,
      availablePoints: BigInt(account.available_points),
      replayed: false,
    };
  }

  private async transaction(
    operation: (client: PoolClient) => Promise<LedgerCompensationResult>,
  ): Promise<LedgerCompensationResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
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

async function lockAccount(client: PoolClient, accountId: RewardsAccountId): Promise<AccountRow> {
  const account = (await client.query<AccountRow>(`
    SELECT available_points::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
  `, [accountId])).rows[0];
  if (!account) throw rewardsErrors.notEligible();
  return account;
}

async function findReplay(
  client: PoolClient,
  accountId: RewardsAccountId,
  idempotencyKey: string,
): Promise<LedgerCompensationResult | null> {
  const replay = (await client.query<ReplayRow>(`
    SELECT entry.id::text, entry.points_delta::text, account.available_points::text
    FROM ledger_entries entry
    JOIN rewards_accounts account ON account.id = entry.account_id
    WHERE entry.account_id = $1 AND entry.idempotency_key = $2
  `, [accountId, idempotencyKey])).rows[0];
  return replay ? {
    ledgerEntryId: replay.id as LedgerEntryId,
    pointsDelta: BigInt(replay.points_delta),
    availablePoints: BigInt(replay.available_points),
    replayed: true,
  } : null;
}

function authorize(actor: RewardsOperator): void {
  if (!actor.id.trim() || !actor.permissions.includes("rewards:adjust")) {
    throw rewardsErrors.forbidden();
  }
  assertSafeText("Compensation audit actor ID", actor.id, 120);
}

function validateAudit(reasonCode: string, explanation: string, idempotencyKey: string): void {
  assertSafeText("Compensation reason code", reasonCode, 80);
  assertSafeText("Compensation explanation", explanation, 500);
  assertSafeText("Compensation idempotency key", idempotencyKey, 180);
}
