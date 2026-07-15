import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { InventoryMode } from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CatalogItemId,
  CorrelationId,
  PointLotId,
  RedemptionId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";
import { allocateFifoLots } from "../ledger/allocation.js";
import {
  findEffectiveRedemptionLimitPolicy,
  requireEnabledRedemptionLimitPolicy,
} from "./redemption-limit-policy.js";

export interface CreatePointRedemptionCommand {
  accountId: RewardsAccountId;
  catalogItemId: CatalogItemId;
  idempotencyKey: string;
  correlationId: CorrelationId;
}

export interface PointRedemptionResult {
  redemptionId: RedemptionId;
  status: "PENDING";
  pointsCost: bigint;
  availablePoints: bigint;
  replayed: boolean;
}

export interface PointRedemptionPort {
  create(
    command: CreatePointRedemptionCommand & { requestedAt: Date },
  ): Promise<PointRedemptionResult>;
}

export class CreatePointRedemption {
  constructor(
    private readonly redemptions: PointRedemptionPort,
    private readonly clock: Clock,
  ) {}

  create(command: CreatePointRedemptionCommand): Promise<PointRedemptionResult> {
    requireIdentifier(command.accountId);
    requireIdentifier(command.catalogItemId);
    requireIdentifier(command.idempotencyKey);
    requireIdentifier(command.correlationId);
    return this.redemptions.create({ ...command, requestedAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface RedemptionRow extends QueryResultRow {
  id: string;
  account_id: string;
  catalog_item_id: string;
  status: string;
  points_cost: string;
}
interface AccountRow extends QueryResultRow { available_points: string }
interface CatalogRedemptionRow extends QueryResultRow {
  mode: string;
  inventory_mode: InventoryMode;
  enabled: boolean;
  point_price: string | null;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  partner_dependency: string | null;
  total_capacity: number | null;
  reserved_quantity: number;
  fulfilled_quantity: number;
}
interface GateRow extends QueryResultRow {
  enabled: boolean;
  disabled_reason: string | null;
}
interface LotRow extends QueryResultRow { lot_id: string; available_points: string }

export class PostgresPointRedemptions implements PointRedemptionPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  create(
    command: CreatePointRedemptionCommand & { requestedAt: Date },
  ): Promise<PointRedemptionResult> {
    return this.transaction(async (client) => {
      const replay = (await client.query<RedemptionRow>(`
        SELECT id::text, account_id::text, catalog_item_id::text, status, points_cost::text
        FROM redemptions WHERE idempotency_key = $1
      `, [command.idempotencyKey])).rows[0];
      if (replay) {
        if (replay.account_id !== command.accountId || replay.catalog_item_id !== command.catalogItemId) {
          throw rewardsErrors.duplicateEvent();
        }
        const account = (await client.query<AccountRow>(`
          SELECT available_points::text FROM rewards_accounts WHERE id = $1
        `, [command.accountId])).rows[0];
        return {
          redemptionId: replay.id as RedemptionId,
          status: "PENDING",
          pointsCost: BigInt(replay.points_cost),
          availablePoints: BigInt(account?.available_points ?? "0"),
          replayed: true,
        };
      }
      const account = (await client.query<AccountRow>(`
        SELECT available_points::text FROM rewards_accounts
        WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE
      `, [command.accountId])).rows[0];
      if (!account) throw rewardsErrors.notEligible();
      const gate = (await client.query<GateRow>(`
        SELECT enabled, disabled_reason
        FROM behavior_rule_versions
        WHERE code = 'CATALOG_REDEMPTION'
          AND effective_from <= $1
          AND (effective_to IS NULL OR effective_to > $1)
        ORDER BY version DESC, effective_from DESC
        LIMIT 1
      `, [command.requestedAt])).rows[0];
      if (!gate?.enabled) throw rewardsErrors.ruleDisabled(gate?.disabled_reason ?? "Catalog redemption is disabled");
      const item = (await client.query<CatalogRedemptionRow>(`
        SELECT item.mode, item.inventory_mode, item.enabled, item.point_price::text, item.effective_from,
          item.effective_to, item.disabled_reason, item.partner_dependency,
          inventory.total_capacity, inventory.reserved_quantity, inventory.fulfilled_quantity
        FROM catalog_items AS item
        JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = item.id
        WHERE item.id = $1
        FOR UPDATE OF item, inventory
      `, [command.catalogItemId])).rows[0];
      validatePointItem(item, command.requestedAt);
      const limitPolicy = requireEnabledRedemptionLimitPolicy(
        await findEffectiveRedemptionLimitPolicy(client, {
          catalogItemId: command.catalogItemId,
          inventoryMode: item.inventory_mode,
          effectiveAt: command.requestedAt,
        }, true),
      );
      const monthlyCount = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM redemptions AS redemption
        JOIN catalog_items AS counted_item ON counted_item.id = redemption.catalog_item_id
        WHERE redemption.account_id = $1
          AND redemption.status NOT IN ('CANCELLED', 'REFUNDED')
          AND date_trunc('month', redemption.requested_at AT TIME ZONE $3)
            = date_trunc('month', $2::timestamptz AT TIME ZONE $3)
          AND (
            $4 = 'GLOBAL' OR
            ($4 = 'CATALOG_ITEM' AND redemption.catalog_item_id::text = $5) OR
            ($4 = 'INVENTORY_MODE' AND counted_item.inventory_mode = $5)
          )
      `, [command.accountId, command.requestedAt, limitPolicy.businessTimezone,
        limitPolicy.scopeType, limitPolicy.scopeKey]);
      if (Number(monthlyCount.rows[0]?.count ?? "0") >= limitPolicy.monthlyLimit) {
        throw rewardsErrors.monthlyLimitReached();
      }
      const pointsCost = BigInt(item.point_price!);
      if (item.total_capacity !== null
        && item.reserved_quantity + item.fulfilled_quantity >= item.total_capacity) {
        throw rewardsErrors.inventoryUnavailable();
      }
      const lots = (await client.query<LotRow>(`
        SELECT lot.id::text AS lot_id,
          greatest(lot.remaining_points - COALESCE((
            SELECT sum(allocation.points) FROM point_allocations AS allocation
            WHERE allocation.lot_id = lot.id AND allocation.status = 'RESERVED'
          ), 0), 0)::text AS available_points
        FROM point_lots AS lot
        WHERE lot.account_id = $1 AND lot.expired_at IS NULL
          AND lot.expires_at > $2 AND lot.remaining_points > 0
        ORDER BY lot.expires_at, lot.issued_at, lot.id
        FOR UPDATE OF lot
      `, [command.accountId, command.requestedAt])).rows;
      const allocations = allocateFifoLots(lots.map((lot) => ({
        lotId: lot.lot_id as PointLotId,
        availablePoints: BigInt(lot.available_points),
      })), pointsCost);
      const redemptionId = this.generateId() as RedemptionId;
      const consumptionEntryId = this.generateId();
      await client.query(`
        INSERT INTO ledger_entries (
          id, account_id, entry_type, points_delta, idempotency_key,
          correlation_id, actor_type, created_at
        ) VALUES ($1, $2, 'CONSUMPTION', $3, $4, $5, 'CUSTOMER', $6)
      `, [consumptionEntryId, command.accountId, (-pointsCost).toString(),
        `redemption:${command.idempotencyKey}`, command.correlationId, command.requestedAt]);
      await client.query(`
        INSERT INTO redemptions (
          id, account_id, catalog_item_id, status, points_cost, quantity,
          idempotency_key, correlation_id, limit_policy_version_id,
          requested_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'PENDING', $4, 1, $5, $6, $7, $8, $8, $8)
      `, [redemptionId, command.accountId, command.catalogItemId, pointsCost.toString(),
        command.idempotencyKey, command.correlationId, limitPolicy.id, command.requestedAt]);
      for (const allocation of allocations) {
        const pointAllocationId = this.generateId();
        await client.query(`
          INSERT INTO point_allocations (
            id, ledger_entry_id, lot_id, points, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'CONSUMED', $5, $5)
        `, [pointAllocationId, consumptionEntryId, allocation.lotId,
          allocation.points.toString(), command.requestedAt]);
        const changed = await client.query(`
          UPDATE point_lots SET remaining_points = remaining_points - $2, updated_at = $3
          WHERE id = $1 AND remaining_points >= $2
        `, [allocation.lotId, allocation.points.toString(), command.requestedAt]);
        if (changed.rowCount !== 1) throw rewardsErrors.insufficientPoints();
        await client.query(`
          INSERT INTO redemption_allocations (
            id, redemption_id, point_allocation_id, points, created_at
          ) VALUES ($1, $2, $3, $4, $5)
        `, [this.generateId(), redemptionId, pointAllocationId,
          allocation.points.toString(), command.requestedAt]);
      }
      const updatedAccount = (await client.query<AccountRow>(`
        UPDATE rewards_accounts
        SET available_points = available_points - $2, updated_at = $3
        WHERE id = $1 AND available_points >= $2
        RETURNING available_points::text
      `, [command.accountId, pointsCost.toString(), command.requestedAt])).rows[0];
      if (!updatedAccount) throw rewardsErrors.insufficientPoints();
      await client.query(`
        UPDATE catalog_inventory
        SET reserved_quantity = reserved_quantity + 1, updated_at = $2
        WHERE catalog_item_id = $1
      `, [command.catalogItemId, command.requestedAt]);
      return {
        redemptionId,
        status: "PENDING",
        pointsCost,
        availablePoints: BigInt(updatedAccount.available_points),
        replayed: false,
      };
    });
  }

  private async transaction<TResult>(operation: (client: PoolClient) => Promise<TResult>): Promise<TResult> {
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

function validatePointItem(item: CatalogRedemptionRow | undefined, asOf: Date): asserts item is CatalogRedemptionRow {
  if (!item || item.mode !== "POINTS" || item.point_price === null) throw rewardsErrors.invalidTransition();
  if (!item.enabled) throw rewardsErrors.ruleDisabled(item.disabled_reason ?? "Catalog item is disabled");
  if (asOf < item.effective_from || (item.effective_to !== null && asOf >= item.effective_to)) {
    throw rewardsErrors.inventoryUnavailable();
  }
  if (item.partner_dependency !== null) throw rewardsErrors.inventoryUnavailable();
}
