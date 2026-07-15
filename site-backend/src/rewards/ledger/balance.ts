import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { RewardsAccountId } from "../shared/identifiers.js";

export interface PointBalance {
  accountId: RewardsAccountId;
  availablePoints: bigint;
  reservedPoints: bigint;
  nextExpiringPoints: bigint;
  nextExpirationAt: Date | null;
}

export interface PointBalanceReconciliation {
  balance: PointBalance;
  previousAvailablePoints: bigint;
  previousReservedPoints: bigint;
  repaired: boolean;
}

export interface PointBalanceStore {
  get(accountId: RewardsAccountId, asOf: Date): Promise<PointBalance | null>;
  reconcile(accountId: RewardsAccountId, asOf: Date): Promise<PointBalanceReconciliation>;
}

export class QueryPointBalance {
  constructor(
    private readonly balances: PointBalanceStore,
    private readonly clock: Clock,
  ) {}

  get(accountId: RewardsAccountId): Promise<PointBalance | null> {
    return this.balances.get(accountId, this.clock.now());
  }
}

export class ReconcilePointBalance {
  constructor(
    private readonly balances: PointBalanceStore,
    private readonly clock: Clock,
  ) {}

  execute(accountId: RewardsAccountId): Promise<PointBalanceReconciliation> {
    return this.balances.reconcile(accountId, this.clock.now());
  }
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}
interface TransactionalDatabase extends Queryable { connect(): Promise<PoolClient> }
interface BalanceRow extends QueryResultRow {
  account_id: string;
  cached_available_points: string;
  cached_reserved_points: string;
  available_points: string;
  reserved_points: string;
  next_expiring_points: string;
  next_expiration_at: Date | null;
}

export class PostgresPointBalanceStore implements PointBalanceStore {
  constructor(private readonly database: TransactionalDatabase) {}

  async get(accountId: RewardsAccountId, asOf: Date): Promise<PointBalance | null> {
    const row = (await queryBalance(this.database, accountId, asOf, false)).rows[0];
    return row ? mapBalance(row) : null;
  }

  async reconcile(
    accountId: RewardsAccountId,
    asOf: Date,
  ): Promise<PointBalanceReconciliation> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const row = (await queryBalance(client, accountId, asOf, true)).rows[0];
      if (!row) throw new Error("Rewards account was not found for reconciliation");
      const previousAvailablePoints = BigInt(row.cached_available_points);
      const previousReservedPoints = BigInt(row.cached_reserved_points);
      const balance = mapBalance(row);
      const repaired =
        previousAvailablePoints !== balance.availablePoints ||
        previousReservedPoints !== balance.reservedPoints;
      if (repaired) {
        await client.query(`
          UPDATE rewards_accounts
          SET available_points = $2, reserved_points = $3, updated_at = $4
          WHERE id = $1
        `, [
          accountId,
          balance.availablePoints.toString(),
          balance.reservedPoints.toString(),
          asOf,
        ]);
      }
      await client.query("COMMIT");
      return { balance, previousAvailablePoints, previousReservedPoints, repaired };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function queryBalance(
  database: Queryable,
  accountId: RewardsAccountId,
  asOf: Date,
  lockAccount: boolean,
): Promise<QueryResult<BalanceRow>> {
  return database.query<BalanceRow>(`
    WITH account AS (
      SELECT id, available_points, reserved_points
      FROM rewards_accounts
      WHERE id = $1
      ${lockAccount ? "FOR UPDATE" : ""}
    ), reserved_by_lot AS (
      SELECT allocation.lot_id, sum(allocation.points) AS points
      FROM point_allocations AS allocation
      JOIN point_lots AS lot ON lot.id = allocation.lot_id
      WHERE lot.account_id = $1 AND allocation.status = 'RESERVED'
      GROUP BY allocation.lot_id
    ), live_lots AS (
      SELECT
        lot.expires_at,
        greatest(lot.remaining_points - COALESCE(reserved.points, 0), 0) AS available,
        COALESCE(reserved.points, 0) AS reserved
      FROM point_lots AS lot
      LEFT JOIN reserved_by_lot AS reserved ON reserved.lot_id = lot.id
      WHERE lot.account_id = $1
        AND lot.expired_at IS NULL
        AND lot.expires_at > $2
        AND lot.remaining_points > 0
    ), totals AS (
      SELECT COALESCE(sum(available), 0) AS available, COALESCE(sum(reserved), 0) AS reserved
      FROM live_lots
    ), next_expiration AS (
      SELECT expires_at, sum(available) AS points
      FROM live_lots
      WHERE available > 0
      GROUP BY expires_at
      ORDER BY expires_at
      LIMIT 1
    )
    SELECT
      account.id::text AS account_id,
      account.available_points::text AS cached_available_points,
      account.reserved_points::text AS cached_reserved_points,
      totals.available::text AS available_points,
      totals.reserved::text AS reserved_points,
      COALESCE(next_expiration.points, 0)::text AS next_expiring_points,
      next_expiration.expires_at AS next_expiration_at
    FROM account
    CROSS JOIN totals
    LEFT JOIN next_expiration ON true
  `, [accountId, asOf]);
}

function mapBalance(row: BalanceRow): PointBalance {
  return {
    accountId: row.account_id as RewardsAccountId,
    availablePoints: BigInt(row.available_points),
    reservedPoints: BigInt(row.reserved_points),
    nextExpiringPoints: BigInt(row.next_expiring_points),
    nextExpirationAt: row.next_expiration_at,
  };
}
