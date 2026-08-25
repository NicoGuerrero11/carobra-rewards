import assert from "node:assert/strict";
import test from "node:test";

import type {
  RewardsActivationResult,
} from "../src/rewards/accounts/activation.js";
import type {
  RewardsEligibility,
  RewardsEligibilityQuery,
} from "../src/rewards/accounts/eligibility.js";
import {
  ObserveValidatedRewardsEvidence,
  type RewardsActivationUseCase,
} from "../src/rewards/accounts/observe-validated-evidence.js";
import type { RewardEventId, RewardsAccountId } from "../src/rewards/shared/identifiers.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

const customerId = asCustomerId("customer-1");
const validatedAt = new Date("2026-07-14T10:00:00.000Z");

test("observing eligible evidence activates Rewards through the site-backend use case", async () => {
  const eligibility = eligibleEvidence();
  const activation = new StubActivation();

  const result = await new ObserveValidatedRewardsEvidence(
    new StubEligibilityQuery(eligibility),
    activation,
  ).execute(customerId);

  assert.deepEqual(result.eligibility, eligibility);
  assert.equal(result.activation?.availablePoints, 2000n);
  assert.deepEqual(activation.command, { customerId, validatedAt });
});

test("observing pending evidence returns eligibility without any Rewards write", async () => {
  const eligibility: RewardsEligibility = {
    ...eligibleEvidence(),
    eligible: false,
    reason: "sisca_not_validated",
    siscaValidationStatus: "PENDING",
    validatedAt: null,
  };
  const activation = new StubActivation();

  const result = await new ObserveValidatedRewardsEvidence(
    new StubEligibilityQuery(eligibility),
    activation,
  ).execute(customerId);

  assert.equal(result.activation, null);
  assert.equal(activation.command, undefined);
});

function eligibleEvidence(): RewardsEligibility {
  return {
    customerId,
    eligible: true,
    reason: null,
    customerStatus: "ACTIVE",
    siscaValidationStatus: "VALIDATED",
    aforeRelationStatus: "ACTIVE",
    aforeRelationStartedAt: new Date("2026-07-14T10:00:00.000Z"),
    validatedAt,
  };
}

class StubEligibilityQuery implements RewardsEligibilityQuery {
  constructor(private readonly result: RewardsEligibility) {}

  async getForAuthenticatedCustomer(): Promise<RewardsEligibility> {
    return this.result;
  }
}

class StubActivation implements RewardsActivationUseCase {
  command: Parameters<RewardsActivationUseCase["execute"]>[0] | undefined;

  async execute(
    command: Parameters<RewardsActivationUseCase["execute"]>[0],
  ): Promise<RewardsActivationResult> {
    this.command = command;
    return {
      accountId: "account-1" as RewardsAccountId,
      rewardEventId: "event-1" as RewardEventId,
      accountCreated: true,
      registrationAwardIssued: true,
      availablePoints: 2000n,
    };
  }
}
