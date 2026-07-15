import type { CatalogMode, InventoryMode } from "../shared/enums.js";

export interface CatalogItemPolicy {
  code: string;
  version: number;
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
}

export interface CatalogInventoryState {
  totalCapacity: number | null;
  reservedQuantity: number;
  fulfilledQuantity: number;
  releasedQuantity: number;
}

export type CatalogAvailabilityCode =
  | "AVAILABLE"
  | "DISABLED"
  | "NOT_STARTED"
  | "ENDED"
  | "PARTNER_UNAVAILABLE"
  | "NOT_ELIGIBLE"
  | "INVENTORY_UNAVAILABLE"
  | "WAITLIST_AVAILABLE";

export interface CatalogAvailability {
  code: CatalogAvailabilityCode;
  redeemable: boolean;
  waitlistAvailable: boolean;
  availableUnits: number | null;
  reason: string | null;
}

export function validateCatalogItemPolicy(item: CatalogItemPolicy): void {
  if (!item.code.trim()) throw new Error("Catalog item code is required");
  if (!Number.isInteger(item.version) || item.version < 1) {
    throw new Error("Catalog item version must be positive");
  }
  const invalidPointPrice = item.mode === "POINTS"
    ? item.enabled && (item.pointPrice === null || item.pointPrice <= 0n)
    : item.pointPrice !== null;
  if (invalidPointPrice || (item.pointPrice !== null && item.pointPrice <= 0n)) {
    throw new Error("Catalog point price must exist only for positive point-priced items");
  }
  if (!item.fulfillmentMode.trim()) throw new Error("Catalog fulfillment mode is required");
  if (Number.isNaN(item.effectiveFrom.getTime())
    || (item.effectiveTo !== null && (Number.isNaN(item.effectiveTo.getTime())
      || item.effectiveTo <= item.effectiveFrom))) {
    throw new Error("Catalog effective interval is invalid");
  }
  if (!item.enabled && !item.disabledReason?.trim()) {
    throw new Error("Disabled catalog items require a reason");
  }
}

export function validateCatalogInventory(
  inventoryMode: InventoryMode,
  inventory: CatalogInventoryState,
): void {
  for (const [name, value] of Object.entries(inventory)) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`Catalog inventory ${name} must be a non-negative integer`);
    }
  }
  if (inventoryMode === "UNLIMITED" && inventory.totalCapacity !== null) {
    throw new Error("Unlimited inventory cannot declare capacity");
  }
  if ((inventoryMode === "CONTROLLED" || inventoryMode === "CAMPAIGN" || inventoryMode === "WAITLIST")
    && inventory.totalCapacity === null) {
    throw new Error("Controlled, campaign, and waitlist inventory require capacity");
  }
  if (inventory.totalCapacity !== null
    && inventory.reservedQuantity + inventory.fulfilledQuantity > inventory.totalCapacity) {
    throw new Error("Catalog inventory commitments exceed capacity");
  }
}

export function catalogAvailableUnits(inventory: CatalogInventoryState): number | null {
  return inventory.totalCapacity === null
    ? null
    : inventory.totalCapacity - inventory.reservedQuantity - inventory.fulfilledQuantity;
}

export function evaluateCatalogAvailability(input: {
  item: CatalogItemPolicy;
  inventory: CatalogInventoryState;
  asOf: Date;
  eligible: boolean;
  partnerAvailable: boolean;
}): CatalogAvailability {
  validateCatalogItemPolicy(input.item);
  validateCatalogInventory(input.item.inventoryMode, input.inventory);
  const units = catalogAvailableUnits(input.inventory);
  if (!input.item.enabled) return unavailable("DISABLED", units, input.item.disabledReason);
  if (input.asOf < input.item.effectiveFrom) {
    return unavailable("NOT_STARTED", units, "Catalog availability has not started");
  }
  if (input.item.effectiveTo !== null && input.asOf >= input.item.effectiveTo) {
    return unavailable("ENDED", units, "Catalog availability has ended");
  }
  if (input.item.partnerDependency !== null && !input.partnerAvailable) {
    return unavailable("PARTNER_UNAVAILABLE", units, "Required partner is unavailable");
  }
  if (!input.eligible) return unavailable("NOT_ELIGIBLE", units, "Customer is not eligible");
  if (units === 0) {
    if (input.item.inventoryMode === "WAITLIST") {
      return {
        code: "WAITLIST_AVAILABLE",
        redeemable: false,
        waitlistAvailable: true,
        availableUnits: 0,
        reason: "Inventory is full; waitlist is available",
      };
    }
    return unavailable("INVENTORY_UNAVAILABLE", 0, "Inventory is unavailable");
  }
  return {
    code: "AVAILABLE",
    redeemable: true,
    waitlistAvailable: false,
    availableUnits: units,
    reason: null,
  };
}

export function reserveCatalogInventory(
  inventoryMode: InventoryMode,
  inventory: CatalogInventoryState,
  quantity = 1,
): CatalogInventoryState {
  validateCatalogInventory(inventoryMode, inventory);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Inventory quantity must be positive");
  const units = catalogAvailableUnits(inventory);
  if (units !== null && units < quantity) throw new Error("inventory_unavailable");
  return { ...inventory, reservedQuantity: inventory.reservedQuantity + quantity };
}

export function fulfillCatalogInventory(
  inventoryMode: InventoryMode,
  inventory: CatalogInventoryState,
  quantity = 1,
): CatalogInventoryState {
  validateCatalogInventory(inventoryMode, inventory);
  if (!Number.isInteger(quantity) || quantity < 1 || inventory.reservedQuantity < quantity) {
    throw new Error("Inventory fulfillment requires an active reservation");
  }
  return {
    ...inventory,
    reservedQuantity: inventory.reservedQuantity - quantity,
    fulfilledQuantity: inventory.fulfilledQuantity + quantity,
  };
}

export function releaseCatalogInventory(
  inventoryMode: InventoryMode,
  inventory: CatalogInventoryState,
  quantity = 1,
): CatalogInventoryState {
  validateCatalogInventory(inventoryMode, inventory);
  if (!Number.isInteger(quantity) || quantity < 1 || inventory.reservedQuantity < quantity) {
    throw new Error("Inventory release requires an active reservation");
  }
  return {
    ...inventory,
    reservedQuantity: inventory.reservedQuantity - quantity,
    releasedQuantity: inventory.releasedQuantity + quantity,
  };
}

function unavailable(
  code: Exclude<CatalogAvailabilityCode, "AVAILABLE" | "WAITLIST_AVAILABLE">,
  availableUnits: number | null,
  reason: string | null,
): CatalogAvailability {
  return { code, redeemable: false, waitlistAvailable: false, availableUnits, reason };
}
