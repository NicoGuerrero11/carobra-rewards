import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import { rewardsErrors } from "../shared/errors.js";
import type {
  CorrelationId,
  LedgerEntryId,
  PointLotId,
  RewardsAccountId,
} from "../shared/identifiers.js";

export interface FifoLot {
  lotId: PointLotId;
  availablePoints: bigint;
}

export interface LotAllocation {
  lotId: PointLotId;
  points: bigint;
}

export interface PointAllocationResult {
  ledgerEntryId: LedgerEntryId;
  points: bigint;
  allocations: readonly LotAllocation[];
  availablePoints: bigint;
  reservedPoints: bigint;
  replayed: boolean;
}

export interface ReservePointsCommand {
  accountId: RewardsAccountId;
  points: bigint;
  idempotencyKey: string;
  correlationId: CorrelationId;
  createdAt: Date;
}

export interface TransitionReservationCommand {
  reservationLedgerEntryId: LedgerEntryId;
  idempotencyKey: string;
  correlationId: CorrelationId;
  createdAt: Date;
}

export interface PointAllocationPort {
  reserve(command: ReservePointsCommand): Promise<PointAllocationResult>;
  consume(command: TransitionReservationCommand): Promise<PointAllocationResult>;
  release(command: TransitionReservationCommand): Promise<PointAllocationResult>;
}

export function allocateFifoLots(
  lots: readonly FifoLot[],
  requestedPoints: bigint,
): readonly LotAllocation[] {
  if (requestedPoints <= 0n) throw new Error("Requested points must be positive");
  let remaining = requestedPoints;
  const allocations: LotAllocation[] = [];
  for (const lot of lots) {
    if (lot.availablePoints <= 0n) continue;
    const points = lot.availablePoints < remaining ? lot.availablePoints : remaining;
    allocations.push({ lotId: lot.lotId, points });
    remaining -= points;
    if (remaining === 0n) return allocations;
  }
  throw rewardsErrors.insufficientPoints();
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow {
  available_points: string;
  reserved_points: string;
}
interface LotRow extends QueryResultRow {
  lot_id: string;
  available_points: string;
}
interface ReservationRow extends QueryResultRow { account_id: string }
interface ReservedAllocationRow extends QueryResultRow { lot_id: string; points: string }
interface ReplayRow extends QueryResultRow {
  id: string;
  entry_type: string;
  points_delta: string;
}

export class PostgresPointAllocation implements PointAllocationPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  reserve(command: ReservePointsCommand): Promise<PointAllocationResult> {
    return this.transaction((client) => this.reserveInTransaction(client, command));
  }

  consume(command: TransitionReservationCommand): Promise<PointAllocationResult> {
    return this.transaction((client) => this.transitionInTransaction(client, command, "CONSUMPTION"));
  }

  release(command: TransitionReservationCommand): Promise<PointAllocationResult> {
    return this.transaction((client) => this.transitionInTransaction(client, command, "RELEASE"));
  }

  private async transaction(
    operation: (client: PoolClient) => Promise<PointAllocationResult>,
  ): Promise<PointAllocationResult> {
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

  private async reserveInTransaction(
    client: PoolClient,
    command: ReservePointsCommand,
  ): Promise<PointAllocationResult> {
    validateOperation(command.points, command.idempotencyKey);
    await lockAccount(client, command.accountId);
    const replay = await replayResult(client, command.accountId, command.idempotencyKey);
    if (replay) return replay;

    const lotRows = (await client.query<LotRow>(`
      SELECT
        lot.id::text AS lot_id,
        greatest(
          lot.remaining_points - COALESCE((
            SELECT sum(reserved.points)
            FROM point_allocations AS reserved
            WHERE reserved.lot_id = lot.id AND reserved.status = 'RESERVED'
          ), 0),
          0
        )::text AS available_points
      FROM point_lots AS lot
      WHERE lot.account_id = $1
        AND lot.expired_at IS NULL
        AND lot.expires_at > $2
        AND lot.remaining_points > 0
      ORDER BY lot.expires_at, lot.issued_at, lot.id
      FOR UPDATE OF lot
    `, [command.accountId, command.createdAt])).rows;
    const allocations = allocateFifoLots(
      lotRows.map((lot) => ({
        lotId: lot.lot_id as PointLotId,
        availablePoints: BigInt(lot.available_points),
      })),
      command.points,
    );
    const ledgerEntryId = this.generateId() as LedgerEntryId;
    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, entry_type, points_delta, idempotency_key,
        correlation_id, actor_type, created_at
      ) VALUES ($1, $2, 'RESERVATION', $3, $4, $5, 'SYSTEM', $6)
    `, [
      ledgerEntryId,
      command.accountId,
      (-command.points).toString(),
      command.idempotencyKey,
      command.correlationId,
      command.createdAt,
    ]);
    for (const allocation of allocations) {
      await client.query(`
        INSERT INTO point_allocations (
          id, ledger_entry_id, lot_id, points, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'RESERVED', $5, $5)
      `, [
        this.generateId(),
        ledgerEntryId,
        allocation.lotId,
        allocation.points.toString(),
        command.createdAt,
      ]);
    }
    const updated = await client.query<AccountRow>(`
      UPDATE rewards_accounts
      SET
        available_points = available_points - $2,
        reserved_points = reserved_points + $2,
        updated_at = $3
      WHERE id = $1 AND available_points >= $2
      RETURNING available_points::text, reserved_points::text
    `, [command.accountId, command.points.toString(), command.createdAt]);
    if (!updated.rows[0]) throw rewardsErrors.insufficientPoints();
    return result(ledgerEntryId, command.points, allocations, updated.rows[0], false);
  }

  private async transitionInTransaction(
    client: PoolClient,
    command: TransitionReservationCommand,
    transition: "CONSUMPTION" | "RELEASE",
  ): Promise<PointAllocationResult> {
    const reservation = (await client.query<ReservationRow>(`
      SELECT account_id::text
      FROM ledger_entries
      WHERE id = $1 AND entry_type = 'RESERVATION'
    `, [command.reservationLedgerEntryId])).rows[0];
    if (!reservation) throw rewardsErrors.invalidTransition();
    const accountId = reservation.account_id as RewardsAccountId;
    await lockAccount(client, accountId);
    const replay = await replayResult(client, accountId, command.idempotencyKey);
    if (replay) return replay;

    const reserved = (await client.query<ReservedAllocationRow>(`
      SELECT allocation.lot_id::text, allocation.points::text
      FROM point_allocations AS allocation
      JOIN point_lots AS lot ON lot.id = allocation.lot_id
      WHERE allocation.ledger_entry_id = $1 AND allocation.status = 'RESERVED'
      ORDER BY lot.expires_at, lot.issued_at, lot.id
      FOR UPDATE OF allocation, lot
    `, [command.reservationLedgerEntryId])).rows;
    if (reserved.length === 0) throw rewardsErrors.invalidTransition();
    const allocations = reserved.map((allocation) => ({
      lotId: allocation.lot_id as PointLotId,
      points: BigInt(allocation.points),
    }));
    const points = allocations.reduce((sum, allocation) => sum + allocation.points, 0n);
    const ledgerEntryId = this.generateId() as LedgerEntryId;
    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, entry_type, points_delta, idempotency_key,
        correlation_id, actor_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'SYSTEM', $7)
    `, [
      ledgerEntryId,
      accountId,
      transition,
      (transition === "CONSUMPTION" ? -points : points).toString(),
      command.idempotencyKey,
      command.correlationId,
      command.createdAt,
    ]);
    for (const allocation of allocations) {
      await client.query(`
        INSERT INTO point_allocations (
          id, ledger_entry_id, lot_id, points, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      `, [
        this.generateId(),
        ledgerEntryId,
        allocation.lotId,
        allocation.points.toString(),
        transition === "CONSUMPTION" ? "CONSUMED" : "RELEASED",
        command.createdAt,
      ]);
      if (transition === "CONSUMPTION") {
        const consumed = await client.query(`
          UPDATE point_lots
          SET remaining_points = remaining_points - $2, updated_at = $3
          WHERE id = $1 AND remaining_points >= $2
        `, [allocation.lotId, allocation.points.toString(), command.createdAt]);
        if (consumed.rowCount !== 1) throw rewardsErrors.insufficientPoints();
      }
    }
    await client.query(`
      UPDATE point_allocations
      SET status = $2, updated_at = $3
      WHERE ledger_entry_id = $1 AND status = 'RESERVED'
    `, [
      command.reservationLedgerEntryId,
      transition === "CONSUMPTION" ? "CONSUMED" : "RELEASED",
      command.createdAt,
    ]);
    const updated = (await client.query<AccountRow>(`
      UPDATE rewards_accounts
      SET
        available_points = available_points + $3,
        reserved_points = reserved_points - $2,
        updated_at = $4
      WHERE id = $1 AND reserved_points >= $2
      RETURNING available_points::text, reserved_points::text
    `, [accountId, points.toString(), transition === "RELEASE" ? points.toString() : "0", command.createdAt])).rows[0];
    if (!updated) throw rewardsErrors.invalidTransition();
    return result(ledgerEntryId, points, allocations, updated, false);
  }
}

async function lockAccount(client: PoolClient, accountId: RewardsAccountId): Promise<AccountRow> {
  const account = (await client.query<AccountRow>(`
    SELECT available_points::text, reserved_points::text
    FROM rewards_accounts WHERE id = $1 FOR UPDATE
  `, [accountId])).rows[0];
  if (!account) throw rewardsErrors.notEligible();
  return account;
}

async function replayResult(
  client: PoolClient,
  accountId: RewardsAccountId,
  idempotencyKey: string,
): Promise<PointAllocationResult | null> {
  const entry = (await client.query<ReplayRow>(`
    SELECT id::text, entry_type, points_delta::text
    FROM ledger_entries WHERE account_id = $1 AND idempotency_key = $2
  `, [accountId, idempotencyKey])).rows[0];
  if (!entry) return null;
  const allocations = (await client.query<ReservedAllocationRow>(`
    SELECT lot_id::text, points::text
    FROM point_allocations WHERE ledger_entry_id = $1 ORDER BY created_at, id
  `, [entry.id])).rows.map((allocation) => ({
    lotId: allocation.lot_id as PointLotId,
    points: BigInt(allocation.points),
  }));
  const account = await lockAccount(client, accountId);
  return result(
    entry.id as LedgerEntryId,
    BigInt(entry.points_delta) < 0n ? -BigInt(entry.points_delta) : BigInt(entry.points_delta),
    allocations,
    account,
    true,
  );
}

function result(
  ledgerEntryId: LedgerEntryId,
  points: bigint,
  allocations: readonly LotAllocation[],
  account: AccountRow,
  replayed: boolean,
): PointAllocationResult {
  return {
    ledgerEntryId,
    points,
    allocations,
    availablePoints: BigInt(account.available_points),
    reservedPoints: BigInt(account.reserved_points),
    replayed,
  };
}

function validateOperation(points: bigint, idempotencyKey: string): void {
  if (points <= 0n) throw new Error("Requested points must be positive");
  if (!idempotencyKey.trim()) throw new Error("Idempotency key cannot be empty");
}
