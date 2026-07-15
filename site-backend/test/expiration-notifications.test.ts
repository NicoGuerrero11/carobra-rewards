import assert from "node:assert/strict";
import test from "node:test";

import {
  expirationNotificationDueAt,
  expirationNotificationKey,
  expirationNotificationWindows,
} from "../src/rewards/operations/expiration-notifications.js";
import type { RewardsAccountId } from "../src/rewards/shared/identifiers.js";

const accountId = "00000000-0000-4000-8000-000000009101" as RewardsAccountId;
const expiresAt = new Date("2028-01-14T12:00:00.000Z");

test("expiration notifications use exactly the approved 60-day and 30-day windows", () => {
  assert.deepEqual(expirationNotificationWindows, [60, 30]);
  assert.equal(
    expirationNotificationDueAt(expiresAt, 60).toISOString(),
    "2027-11-15T12:00:00.000Z",
  );
  assert.equal(
    expirationNotificationDueAt(expiresAt, 30).toISOString(),
    "2027-12-15T12:00:00.000Z",
  );
});

test("expiration notification business keys are stable per account, cohort, and window", () => {
  assert.equal(
    expirationNotificationKey(accountId, expiresAt, 30),
    `point-expiration-notification:${accountId}:${expiresAt.toISOString()}:30d`,
  );
  assert.notEqual(
    expirationNotificationKey(accountId, expiresAt, 30),
    expirationNotificationKey(accountId, expiresAt, 60),
  );
});
