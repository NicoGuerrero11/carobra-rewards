import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { CatalogMode, InventoryMode } from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import type { CatalogItemId, CorrelationId } from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";
import { assertSafeMetadata, assertSafeText } from "../shared/privacy.js";
import {
  validateCatalogInventory,
  validateCatalogItemPolicy,
  type CatalogInventoryState,
  type CatalogItemPolicy,
} from "./domain.js";

export interface CatalogOperator {
  id: string;
  permissions: readonly string[];
}

interface CatalogAuditCommand {
  idempotencyKey: string;
  correlationId: CorrelationId;
  reasonCode: string;
  explanation: string;
}

export interface CreateCatalogVersionCommand extends CatalogAuditCommand {
  code: string;
  expectedCurrentVersion: number | null;
  name: string;
  description: string;
  mode: CatalogMode;
  enabled: boolean;
  pointPrice: bigint | null;
  eligibilityRule: Readonly<Record<string, unknown>>;
  inventoryMode: InventoryMode;
  fulfillmentMode: string;
  partnerDependency: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
  totalCapacity: number | null;
}

export interface CloseCatalogVersionCommand extends CatalogAuditCommand {
  catalogItemId: CatalogItemId;
  closeAt: Date;
}

export interface ChangeCatalogCapacityCommand extends CatalogAuditCommand {
  catalogItemId: CatalogItemId;
  totalCapacity: number | null;
}

export interface CatalogVersionResult {
  catalogItemId: CatalogItemId;
  version: number;
  replayed: boolean;
}

export interface CatalogCloseResult {
  catalogItemId: CatalogItemId;
  effectiveTo: Date;
  replayed: boolean;
}

export interface CatalogCapacityResult {
  catalogItemId: CatalogItemId;
  totalCapacity: number | null;
  replayed: boolean;
}

type WithAuditActor<TCommand> = TCommand & { actorId: string; createdAt: Date };

export interface CatalogAdministrationPort {
  createVersion(command: WithAuditActor<CreateCatalogVersionCommand>): Promise<CatalogVersionResult>;
  closeVersion(command: WithAuditActor<CloseCatalogVersionCommand>): Promise<CatalogCloseResult>;
  changeCapacity(command: WithAuditActor<ChangeCatalogCapacityCommand>): Promise<CatalogCapacityResult>;
}

export class ManageCatalog {
  constructor(
    private readonly administration: CatalogAdministrationPort,
    private readonly clock: Clock,
  ) {}

  createVersion(
    actor: CatalogOperator,
    command: CreateCatalogVersionCommand,
  ): Promise<CatalogVersionResult> {
    authorize(actor);
    validateAudit(command);
    assertSafeMetadata(command.eligibilityRule, "catalog eligibility rule");
    requireIdentifier(command.code);
    requireIdentifier(command.name);
    requireIdentifier(command.description);
    if (command.expectedCurrentVersion !== null
      && (!Number.isInteger(command.expectedCurrentVersion) || command.expectedCurrentVersion < 1)) {
      throw new Error("Expected catalog version must be positive");
    }
    validateCatalogItemPolicy(asPolicy(command, command.expectedCurrentVersion ?? 1));
    validateCatalogInventory(command.inventoryMode, emptyInventory(command.totalCapacity));
    return this.administration.createVersion({ ...command, actorId: actor.id, createdAt: this.clock.now() });
  }

  closeVersion(
    actor: CatalogOperator,
    command: CloseCatalogVersionCommand,
  ): Promise<CatalogCloseResult> {
    authorize(actor);
    validateAudit(command);
    requireIdentifier(command.catalogItemId);
    if (Number.isNaN(command.closeAt.getTime())) throw new Error("Catalog close time is invalid");
    return this.administration.closeVersion({ ...command, actorId: actor.id, createdAt: this.clock.now() });
  }

  changeCapacity(
    actor: CatalogOperator,
    command: ChangeCatalogCapacityCommand,
  ): Promise<CatalogCapacityResult> {
    authorize(actor);
    validateAudit(command);
    requireIdentifier(command.catalogItemId);
    if (command.totalCapacity !== null
      && (!Number.isInteger(command.totalCapacity) || command.totalCapacity < 0)) {
      throw new Error("Catalog capacity must be a non-negative integer");
    }
    return this.administration.changeCapacity({ ...command, actorId: actor.id, createdAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }

interface CatalogRow extends QueryResultRow {
  id: string;
  code: string;
  version: number;
  name: string;
  description: string;
  mode: CatalogMode;
  enabled: boolean;
  point_price: string | null;
  eligibility_rule: Readonly<Record<string, unknown>>;
  inventory_mode: InventoryMode;
  fulfillment_mode: string;
  partner_dependency: string | null;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  total_capacity: number | null;
  reserved_quantity: number;
  fulfilled_quantity: number;
  released_quantity: number;
}

interface AuditReplayRow extends QueryResultRow {
  catalog_item_id: string;
  operation: string;
  after_state: Record<string, unknown>;
}

export class PostgresCatalogAdministration implements CatalogAdministrationPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  createVersion(
    command: WithAuditActor<CreateCatalogVersionCommand>,
  ): Promise<CatalogVersionResult> {
    return this.transaction(async (client) => {
      const replay = await findReplay(client, command.idempotencyKey, ["CREATE", "VERSION"]);
      if (replay) return {
        catalogItemId: replay.catalog_item_id as CatalogItemId,
        version: numberState(replay.after_state, "version"),
        replayed: true,
      };
      const current = (await client.query<CatalogRow>(`
        SELECT item.*, inventory.total_capacity, inventory.reserved_quantity,
          inventory.fulfilled_quantity, inventory.released_quantity
        FROM catalog_items AS item
        JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = item.id
        WHERE item.code = $1
        ORDER BY item.version DESC
        LIMIT 1
        FOR UPDATE OF item, inventory
      `, [command.code])).rows[0];
      if (current) {
        if (command.expectedCurrentVersion !== current.version) throw rewardsErrors.invalidTransition();
        if (command.effectiveFrom <= current.effective_from
          || (current.effective_to !== null && command.effectiveFrom < current.effective_to)) {
          throw new Error("New catalog version cannot overlap the current version");
        }
      } else if (command.expectedCurrentVersion !== null) {
        throw rewardsErrors.invalidTransition();
      }

      const version = (current?.version ?? 0) + 1;
      const policy = asPolicy(command, version);
      validateCatalogItemPolicy(policy);
      validateCatalogInventory(command.inventoryMode, emptyInventory(command.totalCapacity));
      if (current?.effective_to === null) {
        await client.query(`
          UPDATE catalog_items SET effective_to = $2, updated_at = $3 WHERE id = $1
        `, [current.id, command.effectiveFrom, command.createdAt]);
      }

      const catalogItemId = this.generateId() as CatalogItemId;
      await client.query(`
        INSERT INTO catalog_items (
          id, code, version, name, description, mode, enabled, point_price,
          eligibility_rule, inventory_mode, fulfillment_mode, partner_dependency,
          effective_from, effective_to, disabled_reason, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12,
          $13, $14, $15, $16, $16
        )
      `, [catalogItemId, command.code, version, command.name, command.description,
        command.mode, command.enabled, command.pointPrice?.toString() ?? null,
        JSON.stringify(command.eligibilityRule), command.inventoryMode, command.fulfillmentMode,
        command.partnerDependency, command.effectiveFrom, command.effectiveTo,
        command.disabledReason, command.createdAt]);
      await client.query(`
        INSERT INTO catalog_inventory (
          id, catalog_item_id, total_capacity, reserved_quantity, fulfilled_quantity,
          released_quantity, created_at, updated_at
        ) VALUES ($1, $2, $3, 0, 0, 0, $4, $4)
      `, [this.generateId(), catalogItemId, command.totalCapacity, command.createdAt]);
      const afterState = versionState(catalogItemId, command, version);
      await insertAudit(client, this.generateId(), catalogItemId,
        current ? "VERSION" : "CREATE", command, current ? snapshot(current) : null, afterState);
      return { catalogItemId, version, replayed: false };
    });
  }

  closeVersion(command: WithAuditActor<CloseCatalogVersionCommand>): Promise<CatalogCloseResult> {
    return this.transaction(async (client) => {
      const replay = await findReplay(client, command.idempotencyKey, ["CLOSE"]);
      if (replay) return {
        catalogItemId: replay.catalog_item_id as CatalogItemId,
        effectiveTo: dateState(replay.after_state, "effectiveTo"),
        replayed: true,
      };
      const current = await lockCatalogItem(client, command.catalogItemId);
      if (current.effective_to !== null || command.closeAt <= current.effective_from) {
        throw rewardsErrors.invalidTransition();
      }
      const beforeState = snapshot(current);
      await client.query(`
        UPDATE catalog_items SET effective_to = $2, updated_at = $3 WHERE id = $1
      `, [command.catalogItemId, command.closeAt, command.createdAt]);
      const afterState = { ...beforeState, effectiveTo: command.closeAt.toISOString() };
      await insertAudit(client, this.generateId(), command.catalogItemId, "CLOSE",
        command, beforeState, afterState);
      return { catalogItemId: command.catalogItemId, effectiveTo: command.closeAt, replayed: false };
    });
  }

  changeCapacity(
    command: WithAuditActor<ChangeCatalogCapacityCommand>,
  ): Promise<CatalogCapacityResult> {
    return this.transaction(async (client) => {
      const replay = await findReplay(client, command.idempotencyKey, ["CAPACITY_CHANGE"]);
      if (replay) return {
        catalogItemId: replay.catalog_item_id as CatalogItemId,
        totalCapacity: nullableNumberState(replay.after_state, "totalCapacity"),
        replayed: true,
      };
      const current = await lockCatalogItem(client, command.catalogItemId);
      const nextInventory: CatalogInventoryState = {
        totalCapacity: command.totalCapacity,
        reservedQuantity: current.reserved_quantity,
        fulfilledQuantity: current.fulfilled_quantity,
        releasedQuantity: current.released_quantity,
      };
      validateCatalogInventory(current.inventory_mode, nextInventory);
      const beforeState = snapshot(current);
      await client.query(`
        UPDATE catalog_inventory SET total_capacity = $2, updated_at = $3
        WHERE catalog_item_id = $1
      `, [command.catalogItemId, command.totalCapacity, command.createdAt]);
      const afterState = { ...beforeState, totalCapacity: command.totalCapacity };
      await insertAudit(client, this.generateId(), command.catalogItemId, "CAPACITY_CHANGE",
        command, beforeState, afterState);
      return {
        catalogItemId: command.catalogItemId,
        totalCapacity: command.totalCapacity,
        replayed: false,
      };
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

async function lockCatalogItem(client: PoolClient, catalogItemId: CatalogItemId): Promise<CatalogRow> {
  const current = (await client.query<CatalogRow>(`
    SELECT item.*, inventory.total_capacity, inventory.reserved_quantity,
      inventory.fulfilled_quantity, inventory.released_quantity
    FROM catalog_items AS item
    JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = item.id
    WHERE item.id = $1
    FOR UPDATE OF item, inventory
  `, [catalogItemId])).rows[0];
  if (!current) throw rewardsErrors.invalidTransition();
  return current;
}

async function findReplay(
  client: PoolClient,
  idempotencyKey: string,
  expectedOperations: readonly string[],
): Promise<AuditReplayRow | null> {
  const replay = (await client.query<AuditReplayRow>(`
    SELECT catalog_item_id::text, operation, after_state
    FROM catalog_operation_audit WHERE idempotency_key = $1
  `, [idempotencyKey])).rows[0];
  if (replay && !expectedOperations.includes(replay.operation)) {
    throw new Error("Catalog idempotency key was used for another operation");
  }
  return replay ?? null;
}

async function insertAudit(
  client: PoolClient,
  auditId: string,
  catalogItemId: CatalogItemId,
  operation: "CREATE" | "VERSION" | "CLOSE" | "CAPACITY_CHANGE",
  command: WithAuditActor<CatalogAuditCommand>,
  beforeState: Readonly<Record<string, unknown>> | null,
  afterState: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(`
    INSERT INTO catalog_operation_audit (
      id, catalog_item_id, operation, actor_id, reason_code, explanation,
      correlation_id, idempotency_key, before_state, after_state, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
  `, [auditId, catalogItemId, operation, command.actorId, command.reasonCode,
    command.explanation, command.correlationId, command.idempotencyKey,
    beforeState === null ? null : JSON.stringify(beforeState), JSON.stringify(afterState),
    command.createdAt]);
}

function authorize(actor: CatalogOperator): void {
  if (!actor.id.trim() || !actor.permissions.includes("rewards:catalog:manage")) {
    throw rewardsErrors.forbidden();
  }
  assertSafeText("Catalog audit actor ID", actor.id, 120);
}

function validateAudit(command: CatalogAuditCommand): void {
  requireIdentifier(command.idempotencyKey);
  requireIdentifier(command.correlationId);
  requireIdentifier(command.reasonCode);
  requireIdentifier(command.explanation);
  assertSafeText("Catalog audit idempotency key", command.idempotencyKey, 180);
  assertSafeText("Catalog audit reason code", command.reasonCode, 80);
  assertSafeText("Catalog audit explanation", command.explanation, 500);
}

function emptyInventory(totalCapacity: number | null): CatalogInventoryState {
  return { totalCapacity, reservedQuantity: 0, fulfilledQuantity: 0, releasedQuantity: 0 };
}

function asPolicy(command: CreateCatalogVersionCommand, version: number): CatalogItemPolicy {
  return {
    code: command.code,
    version,
    mode: command.mode,
    enabled: command.enabled,
    pointPrice: command.pointPrice,
    eligibilityRule: command.eligibilityRule,
    inventoryMode: command.inventoryMode,
    fulfillmentMode: command.fulfillmentMode,
    partnerDependency: command.partnerDependency,
    effectiveFrom: command.effectiveFrom,
    effectiveTo: command.effectiveTo,
    disabledReason: command.disabledReason,
  };
}

function versionState(
  catalogItemId: CatalogItemId,
  command: CreateCatalogVersionCommand,
  version: number,
): Readonly<Record<string, unknown>> {
  return {
    catalogItemId,
    code: command.code,
    version,
    enabled: command.enabled,
    pointPrice: command.pointPrice?.toString() ?? null,
    inventoryMode: command.inventoryMode,
    totalCapacity: command.totalCapacity,
    effectiveFrom: command.effectiveFrom.toISOString(),
    effectiveTo: command.effectiveTo?.toISOString() ?? null,
  };
}

function snapshot(row: CatalogRow): Readonly<Record<string, unknown>> {
  return {
    catalogItemId: row.id,
    code: row.code,
    version: row.version,
    enabled: row.enabled,
    pointPrice: row.point_price,
    inventoryMode: row.inventory_mode,
    totalCapacity: row.total_capacity,
    reservedQuantity: row.reserved_quantity,
    fulfilledQuantity: row.fulfilled_quantity,
    releasedQuantity: row.released_quantity,
    effectiveFrom: row.effective_from.toISOString(),
    effectiveTo: row.effective_to?.toISOString() ?? null,
  };
}

function numberState(state: Record<string, unknown>, key: string): number {
  const value = state[key];
  if (typeof value !== "number") throw new Error(`Invalid catalog audit ${key}`);
  return value;
}

function nullableNumberState(state: Record<string, unknown>, key: string): number | null {
  const value = state[key];
  if (value !== null && typeof value !== "number") throw new Error(`Invalid catalog audit ${key}`);
  return value as number | null;
}

function dateState(state: Record<string, unknown>, key: string): Date {
  const value = state[key];
  if (typeof value !== "string") throw new Error(`Invalid catalog audit ${key}`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid catalog audit ${key}`);
  return date;
}
