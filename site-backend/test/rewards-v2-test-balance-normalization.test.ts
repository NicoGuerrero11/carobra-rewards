import assert from "node:assert/strict";
import test from "node:test";

import {
  NormalizeTestCustomerBalancesToV2,
  type TestBalanceAdjustment,
  type TestBalanceCandidate,
  type TestBalanceCandidateQuery,
} from "../src/rewards/v2/test-balance-normalization.js";

test("dry-run reports V1 points without mutating balances", async () => {
  const state = new MemoryState([
    candidate("account-invited", 2045n, 2000n),
    candidate("account-validated", 2150n, 2000n),
  ]);
  const result = await normalizer(state).execute(true);

  assert.equal(result.scanned, 2);
  assert.equal(result.wouldNormalize, 2);
  assert.equal(result.wouldRemovePoints, 4000n);
  assert.equal(result.normalized, 0);
  assert.equal(state.rows[0]?.availablePoints, 2045n);
  assert.equal(state.adjustmentCalls, 0);
});

test("apply leaves invited and validated accounts with V2-only balances", async () => {
  const state = new MemoryState([
    candidate("account-invited", 2045n, 2000n),
    candidate("account-validated", 2150n, 2000n),
  ]);
  const result = await normalizer(state).execute(false);

  assert.equal(result.normalized, 2);
  assert.equal(result.removedPoints, 4000n);
  assert.equal(state.rows[0]?.availablePoints, 45n);
  assert.equal(state.rows[1]?.availablePoints, 150n);
  assert.equal(state.rows.every((row) => row.legacyRemainingPoints === 0n), true);
});

test("replay finds no remaining V1 work and does not subtract twice", async () => {
  const state = new MemoryState([candidate("account-validated", 2150n, 2000n)]);
  const service = normalizer(state);
  await service.execute(false);
  const replay = await service.execute(false);

  assert.equal(replay.scanned, 0);
  assert.equal(replay.normalized, 0);
  assert.equal(replay.removedPoints, 0n);
  assert.equal(state.rows[0]?.availablePoints, 150n);
  assert.equal(state.adjustmentCalls, 1);
});

test("reserved legacy points fail closed without changing the account", async () => {
  const state = new MemoryState([
    candidate("account-reserved", 1995n, 2000n, 50n),
  ]);
  const result = await normalizer(state).execute(false);

  assert.deepEqual(result.failures, [{
    accountId: "account-reserved",
    code: "legacy_points_reserved",
  }]);
  assert.equal(state.rows[0]?.availablePoints, 1995n);
  assert.equal(state.adjustmentCalls, 0);
});

function candidate(
  accountId: string,
  availablePoints: bigint,
  legacyRemainingPoints: bigint,
  legacyReservedPoints = 0n,
): TestBalanceCandidate {
  return { accountId, availablePoints, legacyRemainingPoints, legacyReservedPoints };
}

function normalizer(state: MemoryState): NormalizeTestCustomerBalancesToV2 {
  return new NormalizeTestCustomerBalancesToV2(state, state, () => new Date("2026-08-25T21:00:00.000Z"));
}

class MemoryState implements TestBalanceCandidateQuery, TestBalanceAdjustment {
  adjustmentCalls = 0;

  constructor(readonly rows: TestBalanceCandidate[]) {}

  list(): Promise<readonly TestBalanceCandidate[]> {
    return Promise.resolve(this.rows.filter((row) => row.legacyRemainingPoints > 0n));
  }

  normalize(accountId: string): Promise<{
    outcome: "normalized" | "already_normalized";
    removedPoints: bigint;
  }> {
    this.adjustmentCalls += 1;
    const row = this.rows.find((candidateRow) => candidateRow.accountId === accountId);
    if (!row || row.legacyRemainingPoints === 0n) {
      return Promise.resolve({ outcome: "already_normalized", removedPoints: 0n });
    }
    const removedPoints = row.legacyRemainingPoints;
    row.availablePoints -= removedPoints;
    row.legacyRemainingPoints = 0n;
    return Promise.resolve({ outcome: "normalized", removedPoints });
  }
}
