import assert from "node:assert/strict";
import test from "node:test";

import {
  CreatePointRedemption,
  type CreatePointRedemptionCommand,
  type PointRedemptionPort,
  type PointRedemptionResult,
} from "../src/rewards/catalog/redemption.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type {
  CatalogItemId,
  CorrelationId,
  RedemptionId,
  RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";

const now = new Date("2026-07-14T19:00:00.000Z");
const command: CreatePointRedemptionCommand = {
  accountId: "00000000-0000-4000-8000-000000005001" as RewardsAccountId,
  catalogItemId: "00000000-0000-4000-8000-000000005002" as CatalogItemId,
  idempotencyKey: "point-redemption-1",
  correlationId: "00000000-0000-4000-8000-000000005003" as CorrelationId,
};

test("point redemption receives the authoritative request time", async () => {
  const port = new CapturingRedemptionPort();
  const result = await new CreatePointRedemption(port, new FixedClock(now)).create(command);
  assert.deepEqual(port.command, { ...command, requestedAt: now });
  assert.equal(result.pointsCost, 1000n);
});

test("point redemption rejects empty idempotency before persistence", () => {
  const port = new CapturingRedemptionPort();
  assert.throws(
    () => new CreatePointRedemption(port, new FixedClock(now)).create({
      ...command,
      idempotencyKey: " ",
    }),
    /Identifier cannot be empty/,
  );
  assert.equal(port.command, null);
});

class CapturingRedemptionPort implements PointRedemptionPort {
  command: (CreatePointRedemptionCommand & { requestedAt: Date }) | null = null;

  async create(
    command: CreatePointRedemptionCommand & { requestedAt: Date },
  ): Promise<PointRedemptionResult> {
    this.command = command;
    return {
      redemptionId: "00000000-0000-4000-8000-000000005004" as RedemptionId,
      status: "PENDING",
      pointsCost: 1000n,
      availablePoints: 1000n,
      replayed: false,
    };
  }
}
