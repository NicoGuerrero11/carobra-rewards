import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CatalogItemId,
  EntitlementId,
  RewardEventId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";

export interface GrantFreeEntitlementCommand {
  accountId: RewardsAccountId;
  catalogItemId: CatalogItemId;
  rewardEventId: RewardEventId | null;
  idempotencyKey: string;
  expiresAt: Date | null;
  safeMetadata: Readonly<Record<string, unknown>>;
}

export interface UseFreeEntitlementCommand {
  accountId: RewardsAccountId;
  entitlementId: EntitlementId;
  idempotencyKey: string;
}

export interface FreeEntitlementResult {
  entitlementId: EntitlementId;
  status: "AVAILABLE" | "USED";
  replayed: boolean;
}

export interface FreeEntitlementPort {
  grant(
    command: GrantFreeEntitlementCommand & { grantedAt: Date },
  ): Promise<FreeEntitlementResult>;
  use(
    command: UseFreeEntitlementCommand & { usedAt: Date },
  ): Promise<FreeEntitlementResult>;
}

export class ManageFreeEntitlements {
  constructor(
    private readonly entitlements: FreeEntitlementPort,
    private readonly clock: Clock,
  ) {}

  grant(command: GrantFreeEntitlementCommand): Promise<FreeEntitlementResult> {
    validateGrant(command);
    const grantedAt = this.clock.now();
    if (command.expiresAt !== null && command.expiresAt <= grantedAt) {
      throw new Error("Entitlement expiration must be after grant time");
    }
    return this.entitlements.grant({ ...command, grantedAt });
  }

  use(command: UseFreeEntitlementCommand): Promise<FreeEntitlementResult> {
    requireIdentifier(command.accountId);
    requireIdentifier(command.entitlementId);
    requireIdentifier(command.idempotencyKey);
    return this.entitlements.use({ ...command, usedAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }

interface EntitlementRow extends QueryResultRow {
  id: string;
  account_id: string;
  catalog_item_id: string;
  reward_event_id: string | null;
  status: "AVAILABLE" | "USED" | "EXPIRED" | "CANCELLED";
  idempotency_key: string;
  use_idempotency_key: string | null;
  granted_at: Date;
  used_at: Date | null;
  expires_at: Date | null;
}

interface FreeItemRow extends QueryResultRow {
  mode: string;
  enabled: boolean;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  total_capacity: number | null;
  reserved_quantity: number;
  fulfilled_quantity: number;
}

export class PostgresFreeEntitlements implements FreeEntitlementPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  grant(
    command: GrantFreeEntitlementCommand & { grantedAt: Date },
  ): Promise<FreeEntitlementResult> {
    return this.transaction(async (client) => {
      const replay = (await client.query<EntitlementRow>(`
        SELECT * FROM entitlements WHERE idempotency_key = $1
      `, [command.idempotencyKey])).rows[0];
      if (replay) {
        if (replay.account_id !== command.accountId
          || replay.catalog_item_id !== command.catalogItemId
          || replay.reward_event_id !== command.rewardEventId) {
          throw rewardsErrors.duplicateEvent();
        }
        return { entitlementId: replay.id as EntitlementId, status: replay.status as "AVAILABLE" | "USED", replayed: true };
      }
      const account = await client.query(`
        SELECT id FROM rewards_accounts WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE
      `, [command.accountId]);
      if (account.rowCount !== 1) throw rewardsErrors.notEligible();
      const item = await lockFreeItem(client, command.catalogItemId);
      validateFreeItemAvailability(item, command.grantedAt);
      if (item.total_capacity !== null
        && item.reserved_quantity + item.fulfilled_quantity >= item.total_capacity) {
        throw rewardsErrors.inventoryUnavailable();
      }
      const entitlementId = this.generateId() as EntitlementId;
      await client.query(`
        UPDATE catalog_inventory
        SET reserved_quantity = reserved_quantity + 1, updated_at = $2
        WHERE catalog_item_id = $1
      `, [command.catalogItemId, command.grantedAt]);
      await client.query(`
        INSERT INTO entitlements (
          id, account_id, catalog_item_id, reward_event_id, status, idempotency_key,
          granted_at, expires_at, safe_metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'AVAILABLE', $5, $6, $7, $8::jsonb, $6, $6)
      `, [entitlementId, command.accountId, command.catalogItemId, command.rewardEventId,
        command.idempotencyKey, command.grantedAt, command.expiresAt,
        JSON.stringify(command.safeMetadata)]);
      return { entitlementId, status: "AVAILABLE", replayed: false };
    });
  }

  use(command: UseFreeEntitlementCommand & { usedAt: Date }): Promise<FreeEntitlementResult> {
    return this.transaction(async (client) => {
      const replay = (await client.query<EntitlementRow>(`
        SELECT * FROM entitlements WHERE use_idempotency_key = $1
      `, [command.idempotencyKey])).rows[0];
      if (replay) {
        if (replay.account_id !== command.accountId || replay.id !== command.entitlementId) {
          throw rewardsErrors.duplicateEvent();
        }
        return { entitlementId: replay.id as EntitlementId, status: "USED", replayed: true };
      }
      const entitlement = (await client.query<EntitlementRow>(`
        SELECT * FROM entitlements WHERE id = $1 FOR UPDATE
      `, [command.entitlementId])).rows[0];
      if (!entitlement || entitlement.account_id !== command.accountId) throw rewardsErrors.notEligible();
      if (entitlement.status !== "AVAILABLE"
        || (entitlement.expires_at !== null && entitlement.expires_at <= command.usedAt)) {
        throw rewardsErrors.invalidTransition();
      }
      const item = await lockFreeItem(client, entitlement.catalog_item_id as CatalogItemId);
      if (item.reserved_quantity < 1) throw rewardsErrors.invalidTransition();
      await client.query(`
        UPDATE entitlements
        SET status = 'USED', used_at = $2, use_idempotency_key = $3, updated_at = $2
        WHERE id = $1
      `, [command.entitlementId, command.usedAt, command.idempotencyKey]);
      await client.query(`
        UPDATE catalog_inventory
        SET reserved_quantity = reserved_quantity - 1,
          fulfilled_quantity = fulfilled_quantity + 1,
          updated_at = $2
        WHERE catalog_item_id = $1 AND reserved_quantity >= 1
      `, [entitlement.catalog_item_id, command.usedAt]);
      return { entitlementId: command.entitlementId, status: "USED", replayed: false };
    });
  }

  private async transaction<TResult>(
    operation: (client: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
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

async function lockFreeItem(client: PoolClient, catalogItemId: CatalogItemId): Promise<FreeItemRow> {
  const item = (await client.query<FreeItemRow>(`
    SELECT item.mode, item.enabled, item.effective_from, item.effective_to,
      item.disabled_reason, inventory.total_capacity, inventory.reserved_quantity,
      inventory.fulfilled_quantity
    FROM catalog_items AS item
    JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = item.id
    WHERE item.id = $1
    FOR UPDATE OF item, inventory
  `, [catalogItemId])).rows[0];
  if (!item || item.mode !== "FREE_ENTITLEMENT") throw rewardsErrors.invalidTransition();
  return item;
}

function validateFreeItemAvailability(item: FreeItemRow, asOf: Date): void {
  if (!item.enabled) throw rewardsErrors.ruleDisabled(item.disabled_reason ?? "Catalog item is disabled");
  if (asOf < item.effective_from || (item.effective_to !== null && asOf >= item.effective_to)) {
    throw rewardsErrors.inventoryUnavailable();
  }
}

function validateGrant(command: GrantFreeEntitlementCommand): void {
  requireIdentifier(command.accountId);
  requireIdentifier(command.catalogItemId);
  requireIdentifier(command.idempotencyKey);
  if (command.rewardEventId !== null) requireIdentifier(command.rewardEventId);
  if (command.expiresAt !== null && Number.isNaN(command.expiresAt.getTime())) {
    throw new Error("Entitlement expiration is invalid");
  }
}
