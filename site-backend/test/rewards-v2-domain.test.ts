import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductEvidenceChronology,
  assertProductStatusTransition,
  normalizeActivityType,
  normalizeProvider,
  requireSafeObject,
} from "../src/rewards/v2/domain.js";
import {
  requireInternallyEnabledRule,
  requireProductionApprovedRule,
  type RewardsV2RuleVersion,
} from "../src/rewards/v2/configuration.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import type { RewardsV2RuleVersionId } from "../src/rewards/shared/identifiers.js";
import { assertSafeMetadata } from "../src/rewards/shared/privacy.js";

test("normalizes provider and profile activity codes", () => {
  assert.equal(normalizeProvider(" sisca "), "SISCA");
  assert.equal(normalizeActivityType("questionnaire.completed"), "QUESTIONNAIRE.COMPLETED");
  assert.throws(() => normalizeProvider("sisca product"), /safe code characters/);
});

test("requires accepted and activated evidence for an active product", () => {
  const occurredAt = new Date("2026-08-24T12:00:00.000Z");
  assert.throws(() => assertProductEvidenceChronology({
    status: "ACTIVE",
    occurredAt,
    receivedAt: occurredAt,
    signedAt: null,
    acceptedAt: null,
    activatedAt: null,
    endedAt: null,
  }), /requires acceptedAt and activatedAt/);

  assert.doesNotThrow(() => assertProductEvidenceChronology({
    status: "ACTIVE",
    occurredAt,
    receivedAt: occurredAt,
    signedAt: new Date("2026-08-20T12:00:00.000Z"),
    acceptedAt: new Date("2026-08-22T12:00:00.000Z"),
    activatedAt: occurredAt,
    endedAt: null,
  }));
});

test("allows cancellation and reactivation but rejects an impossible direct transition", () => {
  assert.doesNotThrow(() => assertProductStatusTransition("ACTIVE", "CANCELLED"));
  assert.doesNotThrow(() => assertProductStatusTransition("CANCELLED", "ACTIVE"));
  assert.throws(
    () => assertProductStatusTransition("ACTIVE", "SIGNED"),
    (error: unknown) => error instanceof RewardsError
      && error.code === "invalid_state_transition",
  );
});

test("rejects sensitive provider evidence", () => {
  assert.throws(
    () => requireSafeObject("safeEvidence", { rawSiscaPayload: { found: true } }),
    /Sensitive metadata/,
  );
});

test("permits a boolean authorization policy flag without permitting credentials", () => {
  assert.doesNotThrow(() => assertSafeMetadata({ requiresAuthorization: true }));
  assert.throws(
    () => assertSafeMetadata({ authorization: "Bearer local-secret" }),
    /Sensitive metadata is not allowed/,
  );
  assert.throws(
    () => assertSafeMetadata({ requiresAuthorization: "Bearer local-secret" }),
    /Sensitive metadata is not allowed/,
  );
});

test("keeps internal rules separate from production approval", () => {
  const internalRule: RewardsV2RuleVersion = {
    id: "00000000-0000-4000-8000-000000001801" as RewardsV2RuleVersionId,
    ruleType: "POINT_AWARD",
    code: "V2_INVITED_REGISTRATION",
    version: 1,
    enabled: true,
    approvedForProduction: false,
    settings: { points: 45 },
    effectiveFrom: new Date("2026-08-24T00:00:00.000Z"),
    effectiveTo: null,
    disabledReason: null,
    approvedAt: null,
    approvedBy: null,
  };
  assert.equal(requireInternallyEnabledRule(internalRule, internalRule.code), internalRule);
  assert.throws(
    () => requireProductionApprovedRule(internalRule, internalRule.code),
    /not approved for production/,
  );
});
