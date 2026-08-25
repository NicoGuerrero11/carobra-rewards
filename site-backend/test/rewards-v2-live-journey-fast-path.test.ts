import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { FixedClock } from "../src/rewards/shared/clock.js";
import { asCustomerId } from "../src/rewards/shared/identifiers.js";
import { PostgresRewardsV2LiveJourney } from "../src/rewards/v2/live-journey.js";

const customerId = asCustomerId("00000000-0000-4000-8000-000000008101");
const registeredAt = new Date("2026-08-25T12:00:00.000Z");
const validatedAt = new Date("2026-08-25T13:00:00.000Z");

test("current invited projection bypasses the synchronization transaction", async () => {
  const database = new CurrentProjectionDatabase({
    state: "INVITED",
    current_level: null,
    registration_award_exists: true,
    product_event_exists: false,
    product_award_exists: false,
  });
  const journey = createJourney(database);

  await journey.synchronize({
    customerId,
    registeredAt,
    validationStatus: "PENDING",
    validatedAfore: null,
  });

  assert.equal(database.reads, 1);
  assert.equal(database.transactionConnections, 0);
});

test("current validated projection bypasses the synchronization transaction", async () => {
  const database = new CurrentProjectionDatabase({
    state: "ACTIVE",
    current_level: "BRONZE",
    registration_award_exists: true,
    product_event_exists: true,
    product_award_exists: true,
  });
  const journey = createJourney(database);

  await journey.synchronize({
    customerId,
    registeredAt,
    validationStatus: "VALIDATED",
    validatedAfore: {
      provider: "SISCA",
      productType: "AFORE",
      sourceId: "sisca-validation:00000000-0000-4000-8000-000000008102",
      validatedAt,
    },
  });

  assert.equal(database.reads, 1);
  assert.equal(database.transactionConnections, 0);
});

test("stale projection enters the transactional repair path", async () => {
  const database = new CurrentProjectionDatabase({
    state: "INVITED",
    current_level: null,
    registration_award_exists: true,
    product_event_exists: false,
    product_award_exists: false,
  });
  const journey = createJourney(database);

  await assert.rejects(
    journey.synchronize({
      customerId,
      registeredAt,
      validationStatus: "VALIDATED",
      validatedAfore: {
        provider: "SISCA",
        productType: "AFORE",
        sourceId: "sisca-validation:00000000-0000-4000-8000-000000008102",
        validatedAt,
      },
    }),
    /Stale projections must enter the transaction/,
  );

  assert.equal(database.reads, 1);
  assert.equal(database.transactionConnections, 1);
});

function createJourney(database: CurrentProjectionDatabase) {
  return new PostgresRewardsV2LiveJourney(
    database,
    new FixedClock(new Date("2026-08-25T14:00:00.000Z")),
  );
}

class CurrentProjectionDatabase {
  reads = 0;
  transactionConnections = 0;

  constructor(private readonly marker: QueryResultRow) {}

  async query<TRow extends QueryResultRow>(): Promise<QueryResult<TRow>> {
    this.reads += 1;
    return {
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [this.marker as TRow],
    };
  }

  async connect(): Promise<PoolClient> {
    this.transactionConnections += 1;
    throw new Error("Stale projections must enter the transaction");
  }
}
