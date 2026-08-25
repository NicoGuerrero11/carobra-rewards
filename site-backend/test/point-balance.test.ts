import assert from "node:assert/strict";
import test from "node:test";

import {
  QueryPointBalance,
  ReconcilePointBalance,
  type PointBalance,
  type PointBalanceReconciliation,
  type PointBalanceStore,
} from "../src/rewards/ledger/balance.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import type { RewardsAccountId } from "../src/rewards/shared/identifiers.js";

const accountId = "account-1" as RewardsAccountId;
const asOf = new Date("2026-07-14T12:00:00.000Z");
const balance: PointBalance = {
  accountId,
  availablePoints: 1800n,
  reservedPoints: 200n,
  nextExpiringPoints: 1800n,
  nextExpirationAt: new Date("2028-01-14T12:00:00.000Z"),
};

test("authoritative balance query and reconciliation share one application clock", async () => {
  const reconciliation: PointBalanceReconciliation = {
    balance,
    previousAvailablePoints: 2000n,
    previousReservedPoints: 0n,
    repaired: true,
  };
  const store = new StubBalanceStore(balance, reconciliation);
  const clock = new FixedClock(asOf);

  assert.equal(await new QueryPointBalance(store, clock).get(accountId), balance);
  assert.equal(await new ReconcilePointBalance(store, clock).execute(accountId), reconciliation);
  assert.deepEqual(store.calls, [
    ["get", accountId, asOf],
    ["reconcile", accountId, asOf],
  ]);
});

class StubBalanceStore implements PointBalanceStore {
  calls: Array<[string, RewardsAccountId, Date]> = [];
  constructor(
    private readonly balance: PointBalance,
    private readonly reconciliation: PointBalanceReconciliation,
  ) {}
  async get(account: RewardsAccountId, instant: Date) {
    this.calls.push(["get", account, instant]);
    return this.balance;
  }
  async reconcile(account: RewardsAccountId, instant: Date) {
    this.calls.push(["reconcile", account, instant]);
    return this.reconciliation;
  }
}
