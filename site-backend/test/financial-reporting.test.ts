import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateLiabilityPoints,
  type FinancialPeriodReport,
  ReadFinancialReports,
  requireFinancialReportPeriod,
} from "../src/rewards/operations/financial-reporting.js";

const period = {
  fromInclusive: new Date("2026-01-01T00:00:00.000Z"),
  toExclusive: new Date("2026-02-01T00:00:00.000Z"),
};

test("financial periods are valid non-empty half-open intervals", () => {
  assert.doesNotThrow(() => requireFinancialReportPeriod(period));
  assert.throws(() => requireFinancialReportPeriod({
    fromInclusive: new Date("2026-02-01T00:00:00.000Z"),
    toExclusive: new Date("2026-02-01T00:00:00.000Z"),
  }), /non-empty half-open interval/);
  assert.throws(() => requireFinancialReportPeriod({
    fromInclusive: new Date("invalid"),
    toExclusive: new Date("2026-02-01T00:00:00.000Z"),
  }), /non-empty half-open interval/);
});

test("financial reports require the dedicated finance permission", async () => {
  const reporting = new StubFinancialReporting();
  const reader = new ReadFinancialReports(reporting);
  assert.throws(() => reader.reportPeriod({
    id: "operations-only",
    permissions: ["rewards:jobs:view"],
  }, period), /not authorized/);
  assert.equal(reporting.calls, 0);

  assert.equal(await reader.reportPeriod({
    id: "finance-1",
    permissions: ["rewards:finance:view"],
  }, period), reporting.report);
  assert.equal(reporting.calls, 1);
});

test("liability estimates apply basis points exactly without floating-point rounding", () => {
  assert.equal(estimateLiabilityPoints(630n, 6000), "378");
  assert.equal(estimateLiabilityPoints(1n, 6000), "0.6");
  assert.equal(estimateLiabilityPoints(3n, 3333), "0.9999");
  assert.equal(estimateLiabilityPoints(999n, 0), "0");
  assert.throws(() => estimateLiabilityPoints(-1n, 6000), /valid basis points/);
  assert.throws(() => estimateLiabilityPoints(1n, 10_001), /valid basis points/);
});

class StubFinancialReporting {
  calls = 0;
  readonly report: FinancialPeriodReport = {
    period,
    totals: {
      issuedPoints: 0n,
      availablePoints: 0n,
      reservedPoints: 0n,
      consumedPoints: 0n,
      expiredPoints: 0n,
      adjustedPoints: 0n,
      refundedPoints: 0n,
    },
    rules: [],
    campaigns: [],
    catalog: [],
    liability: {
      assumptionId: "assumption-1",
      assumptionCode: "EXPECTED_REDEMPTION",
      assumptionVersion: 1,
      expectedRedemptionBasisPoints: 6000,
      estimatedLiabilityPoints: "0",
    },
  };

  async reportPeriod(): Promise<FinancialPeriodReport> {
    this.calls += 1;
    return this.report;
  }
}
