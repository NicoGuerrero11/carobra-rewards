import assert from "node:assert/strict";
import test from "node:test";

import type { RewardsActivationResult } from "../src/rewards/accounts/activation.js";
import {
  BackfillRewardsAccounts,
  type RewardsBackfillCandidate,
  type RewardsBackfillCandidateQuery,
} from "../src/rewards/accounts/backfill.js";
import type { RewardsActivationUseCase } from "../src/rewards/accounts/observe-validated-evidence.js";
import type { RewardEventId, RewardsAccountId } from "../src/rewards/shared/identifiers.js";
import { asCustomerId, type CustomerId } from "../src/rewards/shared/identifiers.js";

const candidates = [candidate("customer-1"), candidate("customer-2")];

test("dry-run scans every eligible customer without calling activation", async () => {
  const activation = new StubActivation([]);
  const result = await new BackfillRewardsAccounts(
    new StubCandidates(candidates),
    activation,
  ).execute({ dryRun: true, batchSize: 1 });

  assert.deepEqual(result, {
    scanned: 2,
    wouldActivate: 2,
    activated: 0,
    repairedAwards: 0,
    replayed: 0,
    failures: [],
  });
  assert.equal(activation.calls, 0);
});

test("a failed customer is safely retryable on the next command run", async () => {
  const activation = new StubActivation([
    new Error("temporary database failure"),
    activationResult(true, true),
  ]);
  const backfill = new BackfillRewardsAccounts(
    new StubCandidates([candidates[0]!]),
    activation,
  );

  const failed = await backfill.execute({ dryRun: false, batchSize: 100 });
  assert.deepEqual(failed.failures, [
    { customerId: candidates[0]!.customerId, code: "activation_failed" },
  ]);

  const retried = await backfill.execute({ dryRun: false, batchSize: 100 });
  assert.equal(retried.activated, 1);
  assert.deepEqual(retried.failures, []);
});

test("account and event collisions converge as repair or replay", async () => {
  const activation = new StubActivation([
    activationResult(false, true),
    activationResult(false, false),
  ]);
  const result = await new BackfillRewardsAccounts(
    new StubCandidates(candidates),
    activation,
  ).execute({ dryRun: false, batchSize: 100 });

  assert.equal(result.repairedAwards, 1);
  assert.equal(result.replayed, 1);
  assert.equal(result.activated, 0);
  assert.deepEqual(result.failures, []);
});

function candidate(value: string): RewardsBackfillCandidate {
  return {
    customerId: asCustomerId(value),
    validatedAt: new Date("2026-07-14T10:00:00.000Z"),
  };
}

function activationResult(
  accountCreated: boolean,
  registrationAwardIssued: boolean,
): RewardsActivationResult {
  return {
    accountId: "account-1" as RewardsAccountId,
    rewardEventId: "event-1" as RewardEventId,
    accountCreated,
    registrationAwardIssued,
    availablePoints: 2000n,
  };
}

class StubCandidates implements RewardsBackfillCandidateQuery {
  constructor(private readonly values: readonly RewardsBackfillCandidate[]) {}

  async listEligibleAfter(
    afterCustomerId: CustomerId | null,
    limit: number,
  ): Promise<readonly RewardsBackfillCandidate[]> {
    const start = afterCustomerId === null
      ? 0
      : this.values.findIndex((value) => value.customerId === afterCustomerId) + 1;
    return this.values.slice(start, start + limit);
  }
}

class StubActivation implements RewardsActivationUseCase {
  calls = 0;

  constructor(private readonly outcomes: Array<RewardsActivationResult | Error>) {}

  async execute(): Promise<RewardsActivationResult> {
    const outcome = this.outcomes[this.calls++];
    if (outcome instanceof Error) throw outcome;
    if (!outcome) throw new Error("Missing stub activation outcome");
    return outcome;
  }
}
