import assert from "node:assert/strict";
import test from "node:test";

import {
  requireEnabledBehaviorRule,
  type EffectiveBehaviorRule,
} from "../src/rewards/behaviors/rule-lookup.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import type { RuleVersionId } from "../src/rewards/shared/identifiers.js";

const enabledRule: EffectiveBehaviorRule = {
  id: "00000000-0000-4000-8000-000000000112" as RuleVersionId,
  code: "SKANDIA_CONTRACTING",
  version: 1,
  enabled: true,
  pointValue: 5000n,
  validityPolicy: "NORMAL_18_MONTHS",
  evidenceRequirements: { confirmation: true },
  configuration: {},
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveTo: null,
  disabledReason: null,
};

test("enabled behavior rules retain their applied version and value", () => {
  const result = requireEnabledBehaviorRule(enabledRule, enabledRule.code);

  assert.equal(result.id, enabledRule.id);
  assert.equal(result.version, 1);
  assert.equal(result.pointValue, 5000n);
  assert.equal(result.enabled, true);
});

test("disabled and missing behavior rules return stable rule_disabled errors", () => {
  assert.throws(
    () => requireEnabledBehaviorRule({
      ...enabledRule,
      enabled: false,
      pointValue: null,
      disabledReason: "Partner evidence is not approved.",
    }, enabledRule.code),
    (error: unknown) => error instanceof RewardsError
      && error.code === "rule_disabled"
      && error.details?.reason === "Partner evidence is not approved.",
  );

  assert.throws(
    () => requireEnabledBehaviorRule(null, "UNKNOWN_RULE"),
    (error: unknown) => error instanceof RewardsError
      && error.code === "rule_disabled"
      && error.details?.reason === "No effective UNKNOWN_RULE rule exists.",
  );
});
