import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { PostgresRewardsEligibilityQuery } from "../src/rewards/accounts/eligibility.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";

const customerId = asCustomerId("00000000-0000-4000-8000-000000000301");
const validatedAt = new Date("2026-07-14T10:00:00.000Z");
const startedAt = new Date("2026-07-14T10:00:00.000Z");

test("eligibility requires the authenticated customer and all three active facts", async () => {
  const database = new StubDatabase({
    customer_id: customerId,
    customer_status: "ACTIVE",
    sisca_validation_status: "VALIDATED",
    validated_at: validatedAt,
    afore_relation_status: "ACTIVE",
    afore_relation_started_at: startedAt,
  });

  const eligibility = await new PostgresRewardsEligibilityQuery(database)
    .getForAuthenticatedCustomer(customerId);

  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, null);
  assert.equal(eligibility.validatedAt, validatedAt);
  assert.equal(eligibility.aforeRelationStartedAt, startedAt);
  assert.deepEqual(database.values, [customerId]);
  assert.match(database.sql, /WHERE customer\.id = \$1/);
  assert.match(database.sql, /afore_service\.code = 'AFORE'/);
  assert.doesNotMatch(database.sql, /curp|password|raw_/i);
});

for (const [overrides, reason] of [
  [{ customer_status: "PENDING_VALIDATION", sisca_validation_status: "PENDING", validated_at: null }, "sisca_not_validated"],
  [{ customer_status: "INACTIVE" }, "customer_inactive"],
  [{ customer_status: "BLOCKED" }, "customer_inactive"],
  [{ sisca_validation_status: "PENDING", validated_at: null }, "sisca_not_validated"],
  [{ afore_relation_status: "INACTIVE", afore_relation_started_at: null }, "afore_relation_inactive"],
] as const) {
  test(`returns ${reason} without exposing Rewards data`, async () => {
    const eligibleRow = {
      customer_id: customerId,
      customer_status: "ACTIVE",
      sisca_validation_status: "VALIDATED",
      validated_at: validatedAt,
      afore_relation_status: "ACTIVE",
      afore_relation_started_at: startedAt,
    };
    const database = new StubDatabase({
      ...eligibleRow,
      ...overrides,
    });

    const eligibility = await new PostgresRewardsEligibilityQuery(database)
      .getForAuthenticatedCustomer(customerId);

    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reason, reason);
  });
}

test("missing authenticated customer facts are not eligible", async () => {
  const eligibility = await new PostgresRewardsEligibilityQuery(new StubDatabase())
    .getForAuthenticatedCustomer(customerId);

  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "customer_not_found");
  assert.equal(eligibility.customerStatus, null);
});

class StubDatabase {
  sql = "";
  values: unknown[] | undefined;

  constructor(private readonly row?: QueryResultRow) {}

  async query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>> {
    this.sql = text;
    this.values = values;
    return {
      command: "SELECT",
      rowCount: this.row ? 1 : 0,
      oid: 0,
      fields: [],
      rows: this.row ? [this.row as TRow] : [],
    };
  }
}
