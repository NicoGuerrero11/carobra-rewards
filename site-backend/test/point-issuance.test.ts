import assert from "node:assert/strict";
import test from "node:test";

import {
  IssuePoints,
  type PointIssuancePort,
  type PointIssuanceResult,
} from "../src/rewards/ledger/issuance.js";
import { normalizeRewardEvent } from "../src/rewards/ledger/reward-event.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { LedgerEntryId, PointLotId, RewardEventId, RewardsAccountId } from "../src/rewards/shared/identifiers.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

test("point issuance applies the application clock and preserves normalized evidence", async () => {
  const issuedAt = new Date("2026-07-14T12:00:00.000Z");
  const event = normalizeRewardEvent({
    source: "PARTNER",
    sourceId: "external-42",
    eventType: "CONFIRMED_CONTRIBUTION",
    customerId: asCustomerId("customer-1"),
    occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    receivedAt: new Date("2026-07-14T10:01:00.000Z"),
  });
  const expected: PointIssuanceResult = {
    eventId: "event-1" as RewardEventId,
    ledgerEntryId: "entry-1" as LedgerEntryId,
    lotId: "lot-1" as PointLotId,
    points: 500n,
    availablePoints: 2500n,
    replayed: false,
  };
  const port = new StubIssuance(expected);
  const accountId = "account-1" as RewardsAccountId;

  assert.equal(await new IssuePoints(port, new FixedClock(issuedAt)).execute({
    accountId,
    ruleCode: "AVE_CONFIRMED_CONTRIBUTION",
    event,
  }), expected);
  assert.deepEqual(port.command, {
    accountId,
    ruleCode: "AVE_CONFIRMED_CONTRIBUTION",
    event,
    issuedAt,
  });
});

class StubIssuance implements PointIssuancePort {
  command: Parameters<PointIssuancePort["issue"]>[0] | undefined;
  constructor(private readonly result: PointIssuanceResult) {}
  async issue(command: Parameters<PointIssuancePort["issue"]>[0]) {
    this.command = command;
    return this.result;
  }
}
