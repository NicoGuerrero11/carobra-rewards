import assert from "node:assert/strict";
import test from "node:test";

import {
  CompensatePointLedger,
  type LedgerCompensationPort,
  type LedgerCompensationResult,
} from "../src/rewards/ledger/compensation.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { CorrelationId, LedgerEntryId, RewardsAccountId } from "../src/rewards/shared/identifiers.js";

const createdAt = new Date("2026-07-14T12:00:00.000Z");
const actor = { id: "operator-1", permissions: ["rewards:adjust"] };
const result: LedgerCompensationResult = {
  ledgerEntryId: "entry-2" as LedgerEntryId,
  pointsDelta: 250n,
  availablePoints: 2250n,
  replayed: false,
};

test("authorized adjustments carry immutable audit context to the persistence port", async () => {
  const port = new StubCompensation(result);
  const command = {
    accountId: "account-1" as RewardsAccountId,
    pointsDelta: 250n,
    idempotencyKey: "adjustment-1",
    correlationId: "00000000-0000-4000-8000-000000000901" as CorrelationId,
    reasonCode: "CUSTOMER_SUPPORT_CORRECTION",
    explanation: "Correct approved campaign evidence.",
  };
  assert.equal(
    await new CompensatePointLedger(port, new FixedClock(createdAt)).adjust(actor, command),
    result,
  );
  assert.deepEqual(port.adjustment, { ...command, actorId: actor.id, createdAt });
});

test("unauthorized compensation is rejected before persistence", async () => {
  const port = new StubCompensation(result);
  assert.throws(() => new CompensatePointLedger(port, new FixedClock(createdAt)).refund(
    { id: "viewer", permissions: [] },
    {
      originalConsumptionEntryId: "entry-1" as LedgerEntryId,
      points: null,
      idempotencyKey: "refund-1",
      reasonCode: "FULFILLMENT_FAILURE",
      explanation: "Partner could not fulfill.",
    },
  ), (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "forbidden");
  assert.equal(port.refundCommand, undefined);
});

class StubCompensation implements LedgerCompensationPort {
  adjustment: Parameters<LedgerCompensationPort["adjust"]>[0] | undefined;
  refundCommand: Parameters<LedgerCompensationPort["refund"]>[0] | undefined;
  constructor(private readonly result: LedgerCompensationResult) {}
  async adjust(command: Parameters<LedgerCompensationPort["adjust"]>[0]) {
    this.adjustment = command;
    return this.result;
  }
  async refund(command: Parameters<LedgerCompensationPort["refund"]>[0]) {
    this.refundCommand = command;
    return this.result;
  }
}
