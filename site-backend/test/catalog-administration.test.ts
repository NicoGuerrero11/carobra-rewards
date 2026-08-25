import assert from "node:assert/strict";
import test from "node:test";

import {
  ManageCatalog,
  type CatalogAdministrationPort,
  type CatalogCapacityResult,
  type CatalogCloseResult,
  type CatalogVersionResult,
  type ChangeCatalogCapacityCommand,
  type CloseCatalogVersionCommand,
  type CreateCatalogVersionCommand,
} from "../src/rewards/catalog/administration.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { CatalogItemId, CorrelationId } from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-07-14T16:00:00.000Z");
const actor = { id: "catalog-operator-1", permissions: ["rewards:catalog:manage"] };
const command: CreateCatalogVersionCommand = {
  code: "TEST_CATALOG_REWARD",
  expectedCurrentVersion: null,
  name: "Test catalog reward",
  description: "Test catalog administration",
  mode: "POINTS",
  enabled: true,
  pointPrice: 500n,
  eligibilityRule: {},
  inventoryMode: "CONTROLLED",
  fulfillmentMode: "INTERNAL",
  partnerDependency: null,
  effectiveFrom: new Date("2026-07-15T00:00:00.000Z"),
  effectiveTo: null,
  disabledReason: null,
  totalCapacity: 10,
  idempotencyKey: "catalog-create-1",
  correlationId: "00000000-0000-4000-8000-000000009901" as CorrelationId,
  reasonCode: "MVP_CATALOG",
  explanation: "Create the approved test catalog item",
};

test("authorized catalog changes carry actor and audit context to persistence", async () => {
  const port = new CapturingCatalogAdministration();
  const result = await new ManageCatalog(port, new FixedClock(now)).createVersion(actor, command);
  assert.deepEqual(result, {
    catalogItemId: "00000000-0000-4000-8000-000000009902",
    version: 1,
    replayed: false,
  });
  assert.deepEqual(port.created, { ...command, actorId: actor.id, createdAt: now });
});

test("catalog changes reject unauthorized actors before persistence", async () => {
  const port = new CapturingCatalogAdministration();
  assert.throws(
    () => new ManageCatalog(port, new FixedClock(now)).createVersion(
      { id: "viewer", permissions: [] },
      command,
    ),
    (error: unknown) => hasCode(error, "forbidden"),
  );
  assert.equal(port.created, null);
});

test("enabled point catalog versions require an approved price", async () => {
  const port = new CapturingCatalogAdministration();
  assert.throws(
    () => new ManageCatalog(port, new FixedClock(now)).createVersion(actor, {
      ...command,
      pointPrice: null,
    }),
    /point price/,
  );
  assert.equal(port.created, null);
});

test("catalog audit and policy metadata reject customer-sensitive values", () => {
  const management = new ManageCatalog(
    new CapturingCatalogAdministration(),
    new FixedClock(now),
  );
  assert.throws(() => management.createVersion(actor, {
    ...command,
    explanation: "Requested by customer@example.com",
  }), /customer-sensitive/);
  assert.throws(() => management.createVersion(actor, {
    ...command,
    eligibilityRule: { curp: "ABCD123456HMNLRS09" },
  }), /Sensitive metadata/);
});

class CapturingCatalogAdministration implements CatalogAdministrationPort {
  created: (CreateCatalogVersionCommand & { actorId: string; createdAt: Date }) | null = null;

  async createVersion(
    captured: CreateCatalogVersionCommand & { actorId: string; createdAt: Date },
  ): Promise<CatalogVersionResult> {
    this.created = captured;
    return {
      catalogItemId: "00000000-0000-4000-8000-000000009902" as CatalogItemId,
      version: 1,
      replayed: false,
    };
  }

  async closeVersion(
    _command: CloseCatalogVersionCommand & { actorId: string; createdAt: Date },
  ): Promise<CatalogCloseResult> {
    throw new Error("Not implemented in this test port");
  }

  async changeCapacity(
    _command: ChangeCatalogCapacityCommand & { actorId: string; createdAt: Date },
  ): Promise<CatalogCapacityResult> {
    throw new Error("Not implemented in this test port");
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code: unknown }).code === code;
}
