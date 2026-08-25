import assert from "node:assert/strict";
import test from "node:test";

import {
  ProcessPointExpirations,
  pointExpirationIdempotencyKey,
  type PointExpirationBatchResult,
  type PointExpirationPort,
} from "../src/rewards/ledger/expiration.js";
import { FixedClock } from "../src/rewards/shared/clock.js";

test("expiration processing uses stable lot identity and a bounded application instant", async () => {
  const asOf = new Date("2026-10-12T12:00:00.000Z");
  const port = new StubExpiration();
  const result = await new ProcessPointExpirations(port, new FixedClock(asOf))
    .execute(100, "worker-1");

  assert.deepEqual(result, { processedJobs: 1, expiredLots: 1, expiredPoints: 500n });
  assert.deepEqual(port.call, [asOf, 100, "worker-1"]);
  assert.equal(pointExpirationIdempotencyKey("lot-1"), "point-expiration:lot-1");
});

class StubExpiration implements PointExpirationPort {
  call: [Date, number, string] | undefined;
  async processDue(asOf: Date, batchSize: number, workerId: string): Promise<PointExpirationBatchResult> {
    this.call = [asOf, batchSize, workerId];
    return { processedJobs: 1, expiredLots: 1, expiredPoints: 500n };
  }
}
