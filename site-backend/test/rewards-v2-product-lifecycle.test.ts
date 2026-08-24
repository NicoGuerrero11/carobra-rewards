import assert from "node:assert/strict";
import test from "node:test";

import type {
  CustomerId,
  ProductFactId,
  RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";
import type {
  ProductFact,
  ProductFactRepository,
  RecordProductFactCommand,
  RecordProductFactResult,
} from "../src/rewards/v2/product-facts.js";
import {
  RecordProductFactWithLevelRecalculation,
  type ProductLevelRecalculation,
} from "../src/rewards/v2/product-lifecycle.js";
import type {
  RecalculateRewardsLevelCommand,
  RecalculateRewardsLevelResult,
} from "../src/rewards/v2/recalculate-level.js";

const accountId = "00000000-0000-4000-8000-000000009001" as RewardsAccountId;
const customerId = "00000000-0000-4000-8000-000000009002" as CustomerId;
const occurredAt = new Date("2026-08-24T12:00:00.000Z");

test("recalculates once for product activation, cancellation, ending, and reactivation", async () => {
  const facts = new FakeProductFacts();
  const recalculation = new FakeRecalculation();
  const lifecycle = new RecordProductFactWithLevelRecalculation(facts, recalculation);

  for (const [index, status] of ([
    "ACTIVE",
    "CANCELLED",
    "ENDED",
    "ACTIVE",
  ] as const).entries()) {
    facts.next = result(status, true, index + 1);
    const outcome = await lifecycle.execute(command(status, `event-${index + 1}`));
    assert.equal(outcome.levelRecalculation?.status, "RULE_UNAVAILABLE");
  }

  assert.equal(recalculation.commands.length, 4);
  assert.deepEqual(
    recalculation.commands.map((item) => item.triggerType),
    ["PRODUCT_FACT", "PRODUCT_FACT", "PRODUCT_FACT", "PRODUCT_FACT"],
  );
  assert.equal(new Set(recalculation.commands.map((item) => item.triggerId)).size, 4);
  assert.ok(recalculation.commands.every((item) => item.redemptionFeatureEnabled === false));
});

test("does not recalculate a replayed event or a status that cannot change the level", async () => {
  const facts = new FakeProductFacts();
  const recalculation = new FakeRecalculation();
  const lifecycle = new RecordProductFactWithLevelRecalculation(facts, recalculation);

  facts.next = result("ACTIVE", false, 1);
  assert.equal(
    (await lifecycle.execute(command("ACTIVE", "replayed-event"))).levelRecalculation,
    null,
  );
  facts.next = result("PENDING", true, 2);
  assert.equal(
    (await lifecycle.execute(command("PENDING", "pending-event"))).levelRecalculation,
    null,
  );
  assert.equal(recalculation.commands.length, 0);
});

class FakeProductFacts implements ProductFactRepository {
  next: RecordProductFactResult = result("PENDING", true, 0);

  async record(): Promise<RecordProductFactResult> {
    return this.next;
  }

  async listForCustomer(): Promise<readonly ProductFact[]> {
    return [];
  }
}

class FakeRecalculation implements ProductLevelRecalculation {
  readonly commands: RecalculateRewardsLevelCommand[] = [];

  async execute(command: RecalculateRewardsLevelCommand): Promise<RecalculateRewardsLevelResult> {
    this.commands.push(command);
    return {
      status: "RULE_UNAVAILABLE",
      currentLevel: null,
      reason: "Rule pending approval",
    };
  }
}

function command(
  status: RecordProductFactCommand["status"],
  sourceId: string,
): RecordProductFactCommand & { redemptionFeatureEnabled: boolean } {
  return {
    accountId,
    customerId,
    provider: "SISCA",
    productType: "AFORE",
    externalReference: "customer-afore",
    status,
    source: "SISCA",
    sourceId,
    occurredAt,
    receivedAt: occurredAt,
    acceptedAt: status === "ACTIVE" ? occurredAt : null,
    activatedAt: status === "ACTIVE" ? occurredAt : null,
    endedAt: status === "CANCELLED" || status === "ENDED" ? occurredAt : null,
    redemptionFeatureEnabled: false,
  };
}

function result(
  status: ProductFact["status"],
  eventCreated: boolean,
  index: number,
): RecordProductFactResult {
  return {
    factCreated: index === 1,
    eventCreated,
    fact: {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as ProductFactId,
      accountId,
      customerId,
      provider: "SISCA",
      productType: "AFORE",
      externalReference: "customer-afore",
      status,
      source: "SISCA",
      sourceId: `event-${index}`,
      safeEvidence: {},
      signedAt: occurredAt,
      acceptedAt: status === "ACTIVE" ? occurredAt : null,
      activatedAt: status === "ACTIVE" ? occurredAt : null,
      endedAt: status === "CANCELLED" || status === "ENDED" ? occurredAt : null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
  };
}
