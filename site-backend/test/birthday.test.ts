import assert from "node:assert/strict";
import test from "node:test";

import {
  birthdayForYear,
  nextBirthday,
} from "../src/rewards/behaviors/birthday.js";

test("birthday scheduling uses local midnight in the configured timezone", () => {
  assert.equal(
    birthdayForYear("1990-07-15", 2026, "America/Mexico_City", "FEBRUARY_28").toISOString(),
    "2026-07-15T06:00:00.000Z",
  );
  assert.deepEqual(
    nextBirthday(
      "1990-07-15",
      new Date("2026-07-14T15:00:00.000Z"),
      "America/Mexico_City",
      "FEBRUARY_28",
    ),
    { year: 2026, at: new Date("2026-07-15T06:00:00.000Z") },
  );
});

test("leap-day birthdays require an explicit non-leap-year policy", () => {
  assert.equal(
    birthdayForYear("2000-02-29", 2027, "UTC", "FEBRUARY_28").toISOString(),
    "2027-02-28T00:00:00.000Z",
  );
  assert.equal(
    birthdayForYear("2000-02-29", 2027, "UTC", "MARCH_1").toISOString(),
    "2027-03-01T00:00:00.000Z",
  );
  assert.equal(
    birthdayForYear("2000-02-29", 2028, "UTC", "FEBRUARY_28").toISOString(),
    "2028-02-29T00:00:00.000Z",
  );
});
