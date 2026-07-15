import assert from "node:assert/strict";
import test from "node:test";

import {
  AttributeReferral,
  type AttributeReferralCommand,
  type ReferralAttributionPort,
  type ReferralAttributionResult,
} from "../src/rewards/referrals/attribution.js";
import {
  requireEnabledReferralLimitPolicy,
  type EffectiveReferralLimitPolicy,
} from "../src/rewards/referrals/limit-policy.js";
import {
  ConfirmReferralRegistration,
  type ConfirmReferralRegistrationCommand,
  type ReferralRegistrationAwardPort,
  type ReferralRegistrationAwardResult,
} from "../src/rewards/referrals/registration-award.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import type {
  CorrelationId,
  ReferralId,
  ReferralLimitPolicyVersionId,
  RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";
import type { CustomerId, LedgerEntryId, PointLotId, RewardEventId } from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-07-14T19:00:00.000Z");
const command: AttributeReferralCommand = {
  referringAccountId: "00000000-0000-4000-8000-000000006101" as RewardsAccountId,
  referredCustomerId: null,
  referringIdentityHash: "a".repeat(64),
  referredIdentityHash: "b".repeat(64),
  source: "BROWSER",
  sourceId: "referral-attribution-1",
  correlationId: "00000000-0000-4000-8000-000000006102" as CorrelationId,
};

test("referral attribution receives only normalized identity hashes and application time", async () => {
  const port = new CapturingReferralPort();
  const result = await new AttributeReferral(port, new FixedClock(now)).attribute(command);
  assert.deepEqual(port.command, { ...command, attributedAt: now });
  assert.equal(result.status, "ATTRIBUTED");
});

test("self-referral and non-HMAC identity evidence are rejected before persistence", () => {
  const port = new CapturingReferralPort();
  const referrals = new AttributeReferral(port, new FixedClock(now));
  assert.throws(
    () => referrals.attribute({ ...command, referredIdentityHash: command.referringIdentityHash }),
    (error: unknown) => error instanceof RewardsError && error.code === "self_referral",
  );
  assert.throws(
    () => referrals.attribute({ ...command, referredIdentityHash: "raw-email@example.com" }),
    /lowercase SHA-256 HMAC hash/,
  );
  assert.equal(port.command, null);
});

test("only approved referral-limit versions can enable attribution", () => {
  const approved: EffectiveReferralLimitPolicy = {
    id: "00000000-0000-4000-8000-000000000602" as ReferralLimitPolicyVersionId,
    code: "CUSTOMER_MONTHLY_REFERRALS",
    version: 2,
    enabled: true,
    monthlyLimit: 5,
    businessTimezone: "America/Mexico_City",
    excessOutcome: "HELD_FOR_REVIEW",
    effectiveFrom: now,
    effectiveTo: null,
    disabledReason: null,
    approvedBy: "rewards-product-owner",
    approvedAt: now,
  };
  assert.equal(requireEnabledReferralLimitPolicy(approved).monthlyLimit, 5);
  assert.throws(
    () => requireEnabledReferralLimitPolicy({ ...approved, enabled: false,
      monthlyLimit: null, disabledReason: "Pending approval." }),
    (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
  );
  assert.throws(
    () => requireEnabledReferralLimitPolicy({ ...approved, businessTimezone: "Invalid/Zone" }),
    (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
  );
});

test("registration confirmation receives a trusted evidence ID and application time", async () => {
  const port = new CapturingRegistrationAwardPort();
  const registrations = new ConfirmReferralRegistration(port, new FixedClock(now));
  const registrationCommand: ConfirmReferralRegistrationCommand = {
    referralId: "00000000-0000-4000-8000-000000006103" as ReferralId,
    referredCustomerId: "00000000-0000-4000-8000-000000006104" as CustomerId,
    registrationEvidenceId: "registration-validated-1",
    registeredAt: new Date("2026-07-14T18:55:00.000Z"),
  };
  const result = await registrations.confirm(registrationCommand);
  assert.deepEqual(port.command, { ...registrationCommand, receivedAt: now });
  assert.equal(result.award.points, 3000n);
});

class CapturingReferralPort implements ReferralAttributionPort {
  command: (AttributeReferralCommand & { attributedAt: Date }) | null = null;

  async attribute(
    command: AttributeReferralCommand & { attributedAt: Date },
  ): Promise<ReferralAttributionResult> {
    this.command = command;
    return {
      referralId: "00000000-0000-4000-8000-000000006103" as ReferralId,
      status: "ATTRIBUTED",
      replayed: false,
      reviewReason: null,
    };
  }
}

class CapturingRegistrationAwardPort implements ReferralRegistrationAwardPort {
  command: (ConfirmReferralRegistrationCommand & { receivedAt: Date }) | null = null;

  async confirm(
    command: ConfirmReferralRegistrationCommand & { receivedAt: Date },
  ): Promise<ReferralRegistrationAwardResult> {
    this.command = command;
    return {
      referralId: command.referralId,
      status: "REGISTERED",
      award: {
        eventId: "00000000-0000-4000-8000-000000006105" as RewardEventId,
        ledgerEntryId: "00000000-0000-4000-8000-000000006106" as LedgerEntryId,
        lotId: "00000000-0000-4000-8000-000000006107" as PointLotId,
        points: 3000n,
        availablePoints: 3000n,
        replayed: false,
      },
    };
  }
}
