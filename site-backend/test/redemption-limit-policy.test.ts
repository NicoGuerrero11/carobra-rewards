import assert from "node:assert/strict";
import test from "node:test";

import {
  requireEnabledRedemptionLimitPolicy,
  type EffectiveRedemptionLimitPolicy,
} from "../src/rewards/catalog/redemption-limit-policy.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import type { RedemptionLimitPolicyVersionId } from "../src/rewards/shared/identifiers.js";

const approvedPolicy: EffectiveRedemptionLimitPolicy = {
  id: "00000000-0000-4000-8000-000000000502" as RedemptionLimitPolicyVersionId,
  code: "CUSTOMER_MONTHLY_REDEMPTIONS",
  version: 2,
  enabled: true,
  scopeType: "GLOBAL",
  scopeKey: null,
  monthlyLimit: 1,
  businessTimezone: "America/Mexico_City",
  effectiveFrom: new Date("2026-08-01T06:00:00.000Z"),
  effectiveTo: null,
  disabledReason: null,
  approvedBy: "rewards-product-owner",
  approvedAt: new Date("2026-07-31T18:00:00.000Z"),
};

test("an approved effective policy exposes its limit, timezone, scope, and version", () => {
  const enabled = requireEnabledRedemptionLimitPolicy(approvedPolicy);
  assert.equal(enabled.id, approvedPolicy.id);
  assert.equal(enabled.version, 2);
  assert.equal(enabled.monthlyLimit, 1);
  assert.equal(enabled.businessTimezone, "America/Mexico_City");
  assert.equal(enabled.scopeType, "GLOBAL");
});

test("missing, disabled, unapproved, and invalid-timezone policies keep redemption disabled", () => {
  for (const policy of [
    null,
    { ...approvedPolicy, enabled: false, monthlyLimit: null, businessTimezone: null,
      approvedBy: null, approvedAt: null, disabledReason: "Limit pending approval." },
    { ...approvedPolicy, approvedBy: null },
    { ...approvedPolicy, businessTimezone: "Not/A-Timezone" },
  ] satisfies Array<EffectiveRedemptionLimitPolicy | null>) {
    assert.throws(
      () => requireEnabledRedemptionLimitPolicy(policy),
      (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
    );
  }
});
