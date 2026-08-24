import assert from "node:assert/strict";
import test from "node:test";

import { FixedClock } from "../src/rewards/shared/clock.js";
import type {
  CustomerId,
  ProductFactId,
  RewardsAccountId,
  RewardsJourneyId,
  RewardsV2RuleVersionId,
} from "../src/rewards/shared/identifiers.js";
import type { RewardsV2RuleLookupPort, RewardsV2RuleVersion } from "../src/rewards/v2/configuration.js";
import type {
  AppliedLevelDecision,
  ApplyLevelDecisionCommand,
  JourneyLevelStore,
  RewardsJourneyLevelSnapshot,
} from "../src/rewards/v2/level-decisions.js";
import {
  evaluateRewardsLevel,
  type RewardsLevelMatrix,
} from "../src/rewards/v2/level-engine.js";
import type {
  ProductFact,
  ProductFactRepository,
  RecordProductFactCommand,
  RecordProductFactResult,
} from "../src/rewards/v2/product-facts.js";
import type {
  ProfileActivity,
  ProfileActivityRepository,
  ProfileProgress,
  RecordProfileActivityCommand,
} from "../src/rewards/v2/profile-activities.js";
import {
  completedUtcMonths,
  RecalculateRewardsLevel,
} from "../src/rewards/v2/recalculate-level.js";
import { evaluateRedemptionAccess } from "../src/rewards/v2/redemption-access.js";

const matrix: RewardsLevelMatrix = {
  productThresholds: [
    { level: "BRONZE", minimumActiveProducts: 1 },
    { level: "GOLD", minimumActiveProducts: 2 },
    { level: "PLATINUM", minimumActiveProducts: 3 },
    { level: "TITANIUM", minimumActiveProducts: 4 },
  ],
  silver: {
    minimumRegistrationMonths: 6,
    minimumQualifyingActivities: 3,
  },
};

test("evaluates levels from products, permanence, and activity without a points input", () => {
  assert.equal(evaluateRewardsLevel({
    currentLevel: null,
    activeProductCount: 0,
    registrationMonths: 12,
    qualifyingActivityCount: 20,
    matrix,
  }).resultingLevel, null);
  assert.equal(evaluateRewardsLevel({
    currentLevel: null,
    activeProductCount: 1,
    registrationMonths: 5,
    qualifyingActivityCount: 20,
    matrix,
  }).resultingLevel, "BRONZE");
  assert.equal(evaluateRewardsLevel({
    currentLevel: "BRONZE",
    activeProductCount: 1,
    registrationMonths: 6,
    qualifyingActivityCount: 3,
    matrix,
  }).resultingLevel, "SILVER");
  assert.equal(evaluateRewardsLevel({
    currentLevel: "SILVER",
    activeProductCount: 2,
    registrationMonths: 6,
    qualifyingActivityCount: 3,
    matrix,
  }).resultingLevel, "GOLD");
  assert.equal(evaluateRewardsLevel({
    currentLevel: "GOLD",
    activeProductCount: 3,
    registrationMonths: 6,
    qualifyingActivityCount: 3,
    matrix,
  }).resultingLevel, "PLATINUM");
  assert.equal(evaluateRewardsLevel({
    currentLevel: "PLATINUM",
    activeProductCount: 4,
    registrationMonths: 6,
    qualifyingActivityCount: 3,
    matrix,
  }).resultingLevel, "TITANIUM");
});

test("reports Silver progress and refuses to invent it when the rule is absent", () => {
  const progress = evaluateRewardsLevel({
    currentLevel: "BRONZE",
    activeProductCount: 1,
    registrationMonths: 4,
    qualifyingActivityCount: 1,
    matrix,
  }).progress;
  assert.deepEqual(progress, {
    targetLevel: "SILVER",
    ruleAvailable: true,
    remainingActiveProducts: 0,
    remainingRegistrationMonths: 2,
    remainingQualifyingActivities: 2,
  });

  const unavailable = evaluateRewardsLevel({
    currentLevel: "BRONZE",
    activeProductCount: 1,
    registrationMonths: 20,
    qualifyingActivityCount: 50,
    matrix: { ...matrix, silver: null },
  });
  assert.equal(unavailable.resultingLevel, "BRONZE");
  assert.equal(unavailable.progress.ruleAvailable, false);
  assert.equal(unavailable.progress.remainingQualifyingActivities, null);
});

test("redemption remains independent from balance and requires product plus feature", () => {
  assert.deepEqual(evaluateRedemptionAccess({
    activeProductCount: 0,
    redemptionFeatureEnabled: true,
  }), { eligible: false, reason: "NO_ACTIVE_PRODUCT" });
  assert.deepEqual(evaluateRedemptionAccess({
    activeProductCount: 1,
    redemptionFeatureEnabled: false,
  }), { eligible: false, reason: "REDEMPTION_DISABLED" });
  assert.deepEqual(evaluateRedemptionAccess({
    activeProductCount: 1,
    redemptionFeatureEnabled: true,
  }), { eligible: true, reason: null });
});

test("calculates full UTC permanence months with month-end clamping", () => {
  assert.equal(completedUtcMonths(
    new Date("2026-01-31T12:00:00.000Z"),
    new Date("2026-07-31T12:00:00.000Z"),
  ), 6);
  assert.equal(completedUtcMonths(
    new Date("2026-01-31T12:00:00.000Z"),
    new Date("2026-07-30T12:00:00.000Z"),
  ), 5);
});

test("recalculation preserves level when the precedence rule is unavailable", async () => {
  const journeyStore = new FakeJourneyStore();
  const disabledRule = makeRule("V2_LEVEL_PRECEDENCE", {}, false);
  const service = new RecalculateRewardsLevel(
    journeyStore,
    new FakeProductFacts([]),
    new FakeProfileActivities(0),
    new FakeRules([disabledRule]),
    new FixedClock(new Date("2026-08-24T12:00:00.000Z")),
  );
  const result = await service.execute({
    customerId,
    triggerType: "PRODUCT_FACT",
    triggerId: "disabled-rule",
    redemptionFeatureEnabled: false,
  });
  assert.equal(result.status, "RULE_UNAVAILABLE");
  assert.equal(journeyStore.applied, null);
});

test("recalculation audits a product-based transition and keeps redemption gated", async () => {
  const journeyStore = new FakeJourneyStore();
  const precedence = makeRule("V2_LEVEL_PRECEDENCE", {
    productThresholds: matrix.productThresholds,
  });
  const silver = makeRule("V2_SILVER_PROFILE_THRESHOLD", {
    minimumRegistrationMonths: 6,
    minimumQualifyingActivities: 3,
  });
  const service = new RecalculateRewardsLevel(
    journeyStore,
    new FakeProductFacts([activeFact("one"), activeFact("two")]),
    new FakeProfileActivities(20),
    new FakeRules([precedence, silver]),
    new FixedClock(new Date("2026-08-24T12:00:00.000Z")),
  );
  const result = await service.execute({
    customerId,
    triggerType: "PRODUCT_FACT",
    triggerId: "second-product",
    redemptionFeatureEnabled: false,
  });
  assert.equal(result.status, "DECIDED");
  if (result.status !== "DECIDED") return;
  assert.equal(result.evaluation.resultingLevel, "GOLD");
  assert.equal(result.redemptionEligible, false);
  assert.equal(journeyStore.applied?.resultingLevel, "GOLD");
  assert.equal(journeyStore.applied?.redemptionEligible, false);
});

const customerId = "00000000-0000-4000-8000-000000008001" as CustomerId;
const accountId = "00000000-0000-4000-8000-000000008002" as RewardsAccountId;
const journeyId = "00000000-0000-4000-8000-000000008003" as RewardsJourneyId;

class FakeJourneyStore implements JourneyLevelStore {
  applied: ApplyLevelDecisionCommand | null = null;
  private readonly journey: RewardsJourneyLevelSnapshot = {
    id: journeyId,
    customerId,
    state: "ACTIVE",
    currentLevel: "BRONZE",
    registeredAt: new Date("2026-01-01T00:00:00.000Z"),
    redemptionEligible: false,
  };

  async getForCustomer(id: CustomerId): Promise<RewardsJourneyLevelSnapshot | null> {
    return id === customerId ? this.journey : null;
  }

  async applyDecision(command: ApplyLevelDecisionCommand): Promise<AppliedLevelDecision> {
    this.applied = command;
    return {
      id: "00000000-0000-4000-8000-000000008004" as AppliedLevelDecision["id"],
      previousLevel: this.journey.currentLevel,
      resultingLevel: command.resultingLevel,
      replayed: false,
    };
  }
}

class FakeRules implements RewardsV2RuleLookupPort {
  constructor(private readonly rules: readonly RewardsV2RuleVersion[]) {}
  async findEffective(code: string): Promise<RewardsV2RuleVersion | null> {
    return this.rules.find((rule) => rule.code === code) ?? null;
  }
  async listEffectiveFeatureFlags(): Promise<readonly RewardsV2RuleVersion[]> {
    return [];
  }
}

class FakeProductFacts implements ProductFactRepository {
  constructor(private readonly facts: readonly ProductFact[]) {}
  async record(_command: RecordProductFactCommand): Promise<RecordProductFactResult> {
    throw new Error("not used");
  }
  async listForCustomer(): Promise<readonly ProductFact[]> {
    return this.facts;
  }
}

class FakeProfileActivities implements ProfileActivityRepository {
  constructor(private readonly count: number) {}
  async record(_command: RecordProfileActivityCommand): Promise<ProfileActivity> {
    throw new Error("not used");
  }
  async getProgress(): Promise<ProfileProgress> {
    return {
      qualifyingActivityCount: this.count,
      qualifyingActivityTypes: ["QUESTIONNAIRE.COMPLETED"],
      lastQualifyingActivityAt: new Date("2026-08-20T00:00:00.000Z"),
    };
  }
}

function makeRule(
  code: string,
  settings: Readonly<Record<string, unknown>>,
  enabled = true,
): RewardsV2RuleVersion {
  return {
    id: `00000000-0000-4000-8000-${code === "V2_LEVEL_PRECEDENCE" ? "000000008011" : "000000008012"}` as RewardsV2RuleVersionId,
    ruleType: "LEVEL_RULE",
    code,
    version: 1,
    enabled,
    approvedForProduction: false,
    settings,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    disabledReason: enabled ? null : "Pending team approval",
    approvedAt: null,
    approvedBy: null,
  };
}

function activeFact(suffix: string): ProductFact {
  return {
    id: `00000000-0000-4000-8000-${suffix === "one" ? "000000008021" : "000000008022"}` as ProductFactId,
    accountId,
    customerId,
    provider: "TEST",
    productType: suffix.toUpperCase(),
    externalReference: suffix,
    status: "ACTIVE",
    source: "TEST",
    sourceId: suffix,
    safeEvidence: {},
    signedAt: null,
    acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    activatedAt: new Date("2026-01-01T00:00:00.000Z"),
    endedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}
