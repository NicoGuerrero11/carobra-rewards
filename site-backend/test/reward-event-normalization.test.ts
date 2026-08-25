import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRewardEvent } from "../src/rewards/ledger/reward-event.js";
import type { RewardEventSource } from "../src/rewards/shared/enums.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

const customerId = asCustomerId("customer-1");
const occurredAt = new Date("2026-07-14T10:00:00.000Z");
const receivedAt = new Date("2026-07-14T10:01:00.000Z");

for (const [source, sourceId] of [
  ["INTERNAL", "activation:customer-1"],
  ["SCHEDULED", "afore-anniversary:customer-1:6m"],
  ["BROWSER", "action:customer-1:2026-07"],
  ["PARTNER", "external-contribution-42"],
] as const) {
  test(`normalizes ${source.toLowerCase()} evidence with a stable source identity`, () => {
    const event = normalizeRewardEvent({
      source,
      sourceId: ` ${sourceId} `,
      eventType: " qualifying_action ",
      customerId,
      occurredAt,
      receivedAt,
      safeMetadata: { campaign: "baseline" },
    });

    assert.equal(event.sourceIdentity, `${source}:${sourceId}`);
    assert.equal(event.eventType, "QUALIFYING_ACTION");
    assert.deepEqual(event.safeMetadata, { campaign: "baseline" });
    assert.ok(Object.isFrozen(event));
  });
}

test("rejects missing idempotency evidence, invalid chronology, and sensitive metadata", () => {
  assert.throws(() => event({ sourceId: " " }), /sourceId cannot be empty/);
  assert.throws(
    () => event({ occurredAt: receivedAt, receivedAt: occurredAt }),
    /occurredAt cannot be after receivedAt/,
  );
  assert.throws(
    () => event({ safeMetadata: { nested: { raw_sisca_payload: "secret" } } }),
    /Sensitive metadata/,
  );
  assert.throws(
    () => event({ safeMetadata: { note: "ABCD123456HMNLRS09" } }),
    /customer-sensitive/,
  );
  assert.throws(
    () => event({ safeMetadata: { contact_email: "customer@example.com" } }),
    /Sensitive metadata/,
  );
});

function event(overrides: Partial<{
  source: RewardEventSource;
  sourceId: string;
  occurredAt: Date;
  receivedAt: Date;
  safeMetadata: Readonly<Record<string, unknown>>;
}>) {
  return normalizeRewardEvent({
    source: "INTERNAL",
    sourceId: "event-1",
    eventType: "TEST_EVENT",
    customerId,
    occurredAt,
    receivedAt,
    ...overrides,
  });
}
