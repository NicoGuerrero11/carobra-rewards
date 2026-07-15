import assert from "node:assert/strict";
import test from "node:test";

import { allocateFifoLots } from "../src/rewards/ledger/allocation.js";
import type { PointLotId } from "../src/rewards/shared/identifiers.js";

test("FIFO allocation exhausts earlier lots before later lots", () => {
  assert.deepEqual(allocateFifoLots([
    { lotId: "lot-early" as PointLotId, availablePoints: 700n },
    { lotId: "lot-later" as PointLotId, availablePoints: 900n },
  ], 1000n), [
    { lotId: "lot-early", points: 700n },
    { lotId: "lot-later", points: 300n },
  ]);
});

test("FIFO allocation rejects overspending without returning a partial allocation", () => {
  assert.throws(
    () => allocateFifoLots([
      { lotId: "lot-1" as PointLotId, availablePoints: 500n },
    ], 501n),
    (error: unknown) =>
      typeof error === "object" && error !== null &&
      "code" in error && error.code === "insufficient_points",
  );
});
