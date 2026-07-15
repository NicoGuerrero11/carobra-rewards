import assert from "node:assert/strict";
import test from "node:test";

import { FixedClock, requireValidInstant } from "../src/rewards/shared/clock.js";
import { ledgerEntryTypes, redemptionStatuses } from "../src/rewards/shared/enums.js";
import { rewardsErrors } from "../src/rewards/shared/errors.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

test("shared Rewards contracts preserve identifiers and persisted vocabulary", () => {
  assert.equal(asCustomerId(" customer-1 "), "customer-1");
  assert.ok(ledgerEntryTypes.includes("ISSUANCE"));
  assert.ok(redemptionStatuses.includes("REFUNDED"));
});

test("clock and stable error contracts are deterministic", () => {
  const instant = new Date("2026-07-14T12:00:00.000Z");
  assert.equal(new FixedClock(instant).now().toISOString(), instant.toISOString());
  assert.equal(requireValidInstant(instant), instant);

  const error = rewardsErrors.insufficientPoints();
  assert.equal(error.code, "insufficient_points");
  assert.equal(error.status, 409);
  assert.equal(error.details, undefined);
});
