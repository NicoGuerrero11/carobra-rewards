import assert from "node:assert/strict";
import test from "node:test";

import { businessMonthAt } from "../src/rewards/behaviors/monthly-interaction.js";

test("business months honor the configured timezone at a UTC boundary", () => {
  assert.equal(
    businessMonthAt(new Date("2026-08-01T05:59:59.000Z"), "America/Mexico_City"),
    "2026-07",
  );
  assert.equal(
    businessMonthAt(new Date("2026-08-01T06:00:00.000Z"), "America/Mexico_City"),
    "2026-08",
  );
});

test("business months reject invalid timezones and instants", () => {
  assert.throws(
    () => businessMonthAt(new Date("2026-08-01T00:00:00.000Z"), "Mars/Olympus"),
    /timezone is invalid/,
  );
  assert.throws(() => businessMonthAt(new Date("invalid"), "UTC"), /instant must be valid/);
});
