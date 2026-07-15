import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivateRewardsAccount,
  type RewardsAccountActivationPort,
  type RewardsActivationResult,
} from "../src/rewards/accounts/activation.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { RewardEventId, RewardsAccountId } from "../src/rewards/shared/identifiers.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

test("activation use case passes only validated evidence and the application clock to its port", async () => {
  const activatedAt = new Date("2026-07-14T12:00:00.000Z");
  const validatedAt = new Date("2026-07-14T10:00:00.000Z");
  const result: RewardsActivationResult = {
    accountId: "account-1" as RewardsAccountId,
    rewardEventId: "event-1" as RewardEventId,
    accountCreated: true,
    registrationAwardIssued: true,
    availablePoints: 2000n,
  };
  const port = new StubActivationPort(result);
  const customerId = asCustomerId("customer-1");

  assert.equal(
    await new ActivateRewardsAccount(port, new FixedClock(activatedAt)).execute({
      customerId,
      validatedAt,
    }),
    result,
  );
  assert.deepEqual(port.command, { customerId, validatedAt, activatedAt });
});

test("activation result represents replay convergence without a duplicate award", async () => {
  const replayed: RewardsActivationResult = {
    accountId: "account-1" as RewardsAccountId,
    rewardEventId: "event-1" as RewardEventId,
    accountCreated: false,
    registrationAwardIssued: false,
    availablePoints: 2000n,
  };
  const port = new StubActivationPort(replayed);

  const result = await new ActivateRewardsAccount(
    port,
    new FixedClock(new Date("2026-07-14T12:00:00.000Z")),
  ).execute({
    customerId: asCustomerId("customer-1"),
    validatedAt: new Date("2026-07-14T10:00:00.000Z"),
  });

  assert.equal(result.accountCreated, false);
  assert.equal(result.registrationAwardIssued, false);
  assert.equal(result.availablePoints, 2000n);
});

class StubActivationPort implements RewardsAccountActivationPort {
  command: Parameters<RewardsAccountActivationPort["activateValidatedCustomer"]>[0] | undefined;

  constructor(private readonly result: RewardsActivationResult) {}

  async activateValidatedCustomer(
    command: Parameters<RewardsAccountActivationPort["activateValidatedCustomer"]>[0],
  ): Promise<RewardsActivationResult> {
    this.command = command;
    return this.result;
  }
}
