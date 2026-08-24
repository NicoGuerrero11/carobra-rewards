import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig, type SiteBackendConfig } from "../src/config.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import { assertRewardsJourneySummaryContract } from "../src/rewards/v2/journey-summary-contract.js";
import {
  authorizeRewardsV2TestRequest,
  RewardsV2TestScenarioApplication,
} from "../src/rewards/v2/test-scenarios.js";

const accessKey = "test-access-key-that-is-at-least-32-bytes-long";

test("test mode configuration is allowlisted to development and test", () => {
  const development = loadConfig({
    NODE_ENV: "development",
    REWARDS_V2_TEST_MODE_ENABLED: "true",
    REWARDS_V2_TEST_ACCESS_KEY: accessKey,
  });
  assert.deepEqual(development.rewardsV2TestMode, {
    accessKey,
    environment: "development",
  });

  assert.throws(() => loadConfig({
    NODE_ENV: "production",
    REWARDS_V2_TEST_MODE_ENABLED: "true",
    REWARDS_V2_TEST_ACCESS_KEY: accessKey,
  }), /forbidden outside development or test/);
  assert.throws(() => loadConfig({
    NODE_ENV: "test",
    REWARDS_V2_TEST_MODE_ENABLED: "true",
    REWARDS_V2_TEST_ACCESS_KEY: "short",
  }), /at least 32 bytes/);
});

test("test-mode authorization is constant-contract and disabled by default", () => {
  const disabledConfig: SiteBackendConfig = loadConfig({ NODE_ENV: "test" });
  assert.throws(
    () => authorizeRewardsV2TestRequest(disabledConfig, accessKey),
    (error: unknown) => error instanceof RewardsError && error.code === "forbidden",
  );

  const enabledConfig = loadConfig({
    NODE_ENV: "test",
    REWARDS_V2_TEST_MODE_ENABLED: "true",
    REWARDS_V2_TEST_ACCESS_KEY: accessKey,
  });
  assert.doesNotThrow(() => authorizeRewardsV2TestRequest(enabledConfig, accessKey));
  assert.throws(
    () => authorizeRewardsV2TestRequest(enabledConfig, `${accessKey}-wrong`),
    (error: unknown) => error instanceof RewardsError && error.code === "forbidden",
  );
});

test("server-owned scenarios cover the complete V2 review journey", () => {
  const application = new RewardsV2TestScenarioApplication();
  const expectedCodes = [
    "invited",
    "pending-sisca",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "titanium",
    "cancelled",
    "reactivated",
  ];
  assert.deepEqual(application.list().map((scenario) => scenario.code), expectedCodes);

  const expectedLevels = new Map([
    ["invited", null],
    ["pending-sisca", null],
    ["bronze", "BRONZE"],
    ["silver", "SILVER"],
    ["gold", "GOLD"],
    ["platinum", "PLATINUM"],
    ["titanium", "TITANIUM"],
    ["cancelled", null],
    ["reactivated", "BRONZE"],
  ]);
  for (const code of expectedCodes) {
    const summary = application.get(code);
    assert.ok(summary);
    assert.equal(summary.journey.current_level, expectedLevels.get(code));
    assert.equal(summary.redemption.eligible, false);
    assert.equal(summary.modules.benefits_enabled, false);
    assert.equal(summary.modules.expiry_policy_approved, false);
    assert.equal(assertRewardsJourneySummaryContract(summary), summary);
    assert.doesNotMatch(
      JSON.stringify(summary),
      /curp|nss|password|credential|secret|authorization|raw[_-]?payload/i,
    );
  }
  assert.equal(application.get("unknown"), null);
});

test("internal test awards use the authorized 18-month expiry", () => {
  const application = new RewardsV2TestScenarioApplication();
  const invited = application.get("invited");
  const bronze = application.get("bronze");
  assert.ok(invited);
  assert.ok(bronze);
  assert.equal(invited.points.available, "45");
  assert.equal(bronze.points.available, "150");
  const registeredAt = new Date(invited.journey.registered_at);
  const expiresAt = new Date(invited.points.next_expiration_at!);
  assert.equal(
    (expiresAt.getUTCFullYear() - registeredAt.getUTCFullYear()) * 12
      + expiresAt.getUTCMonth() - registeredAt.getUTCMonth(),
    18,
  );
});
