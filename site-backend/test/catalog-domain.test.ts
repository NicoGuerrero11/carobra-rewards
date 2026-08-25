import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCatalogAvailability,
  fulfillCatalogInventory,
  releaseCatalogInventory,
  reserveCatalogInventory,
  type CatalogInventoryState,
  type CatalogItemPolicy,
  validateCatalogItemPolicy,
} from "../src/rewards/catalog/domain.js";

const now = new Date("2026-07-14T12:00:00.000Z");
const item: CatalogItemPolicy = {
  code: "CINEMA_TICKET",
  version: 1,
  mode: "POINTS",
  enabled: true,
  pointPrice: 1000n,
  eligibilityRule: {},
  inventoryMode: "CONTROLLED",
  fulfillmentMode: "DIGITAL_CODE",
  partnerDependency: "CINEPOLIS",
  effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
  effectiveTo: null,
  disabledReason: null,
};
const inventory: CatalogInventoryState = {
  totalCapacity: 2,
  reservedQuantity: 0,
  fulfilledQuantity: 0,
  releasedQuantity: 0,
};

test("catalog modes keep free and restricted value separate from point prices", () => {
  validateCatalogItemPolicy(item);
  validateCatalogItemPolicy({ ...item, mode: "FREE_ENTITLEMENT", pointPrice: null });
  validateCatalogItemPolicy({ ...item, mode: "PRODUCT_BENEFIT", pointPrice: null });
  assert.throws(
    () => validateCatalogItemPolicy({ ...item, mode: "FREE_ENTITLEMENT", pointPrice: 1n }),
    /point price/,
  );
  assert.throws(
    () => validateCatalogItemPolicy({ ...item, pointPrice: null }),
    /point price/,
  );
  validateCatalogItemPolicy({
    ...item,
    enabled: false,
    pointPrice: null,
    disabledReason: "Point price pending approval",
  });
});

test("catalog availability is truthful about policy, partner, eligibility, and inventory", () => {
  assert.equal(evaluateCatalogAvailability({
    item, inventory, asOf: now, eligible: true, partnerAvailable: true,
  }).code, "AVAILABLE");
  assert.equal(evaluateCatalogAvailability({
    item: { ...item, enabled: false, disabledReason: "Agreement pending" },
    inventory, asOf: now, eligible: true, partnerAvailable: true,
  }).code, "DISABLED");
  assert.equal(evaluateCatalogAvailability({
    item, inventory, asOf: now, eligible: true, partnerAvailable: false,
  }).code, "PARTNER_UNAVAILABLE");
  assert.equal(evaluateCatalogAvailability({
    item, inventory, asOf: now, eligible: false, partnerAvailable: true,
  }).code, "NOT_ELIGIBLE");
  assert.equal(evaluateCatalogAvailability({
    item, inventory: { ...inventory, reservedQuantity: 2 },
    asOf: now, eligible: true, partnerAvailable: true,
  }).code, "INVENTORY_UNAVAILABLE");
  const waitlist = evaluateCatalogAvailability({
    item: { ...item, inventoryMode: "WAITLIST" },
    inventory: { ...inventory, fulfilledQuantity: 2 },
    asOf: now, eligible: true, partnerAvailable: true,
  });
  assert.equal(waitlist.code, "WAITLIST_AVAILABLE");
  assert.equal(waitlist.waitlistAvailable, true);
});

test("inventory reservation, fulfillment, and release preserve controlled totals", () => {
  const reserved = reserveCatalogInventory("CONTROLLED", inventory);
  assert.deepEqual(reserved, { ...inventory, reservedQuantity: 1 });
  assert.deepEqual(fulfillCatalogInventory("CONTROLLED", reserved), {
    ...inventory, fulfilledQuantity: 1,
  });
  assert.deepEqual(releaseCatalogInventory("CONTROLLED", reserved), {
    ...inventory, releasedQuantity: 1,
  });
  assert.throws(
    () => reserveCatalogInventory("CONTROLLED", { ...inventory, fulfilledQuantity: 2 }),
    /inventory_unavailable/,
  );
  assert.deepEqual(reserveCatalogInventory("UNLIMITED", {
    ...inventory, totalCapacity: null,
  }, 10).reservedQuantity, 10);
});
