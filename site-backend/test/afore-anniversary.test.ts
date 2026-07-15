import assert from "node:assert/strict";
import test from "node:test";

import {
  addUtcMonths,
  anniversaryRuleCode,
} from "../src/rewards/behaviors/afore-anniversary.js";

test("AFORE milestones preserve the relation instant and clamp month-end dates", () => {
  assert.equal(
    addUtcMonths(new Date("2026-08-31T12:30:00.000Z"), 6).toISOString(),
    "2027-02-28T12:30:00.000Z",
  );
  assert.equal(
    addUtcMonths(new Date("2024-08-31T12:30:00.000Z"), 18).toISOString(),
    "2026-02-28T12:30:00.000Z",
  );
});

test("AFORE milestone months map to their effective rule codes", () => {
  assert.equal(anniversaryRuleCode(6), "AFORE_ANNIVERSARY_6_MONTHS");
  assert.equal(anniversaryRuleCode(12), "AFORE_ANNIVERSARY_12_MONTHS");
  assert.equal(anniversaryRuleCode(18), "AFORE_ANNIVERSARY_18_MONTHS");
});
