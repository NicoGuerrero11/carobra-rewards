import assert from "node:assert/strict";
import test from "node:test";

import {
  BackfillRewardsV2Journeys,
  type RewardsV2BackfillCandidate,
  type RewardsV2BackfillCandidateQuery,
} from "../src/rewards/v2/backfill.js";
import type {
  EnsureInvitedJourneyCommand,
  RewardsV2LiveJourneyPort,
  SynchronizeRewardsEvidenceCommand,
} from "../src/rewards/v2/live-journey.js";
import { asCustomerId, type CustomerId } from "../src/rewards/shared/identifiers.js";

const pendingId = asCustomerId("00000000-0000-4000-8000-000000009101");
const validatedId = asCustomerId("00000000-0000-4000-8000-000000009102");

test("V2 backfill dry-run reports pending and validated work without mutation", async () => {
  const candidates = new MemoryCandidates(seedCandidates());
  const journeys = new IdempotentJourneyPort(candidates);
  const result = await new BackfillRewardsV2Journeys(candidates, journeys).execute({
    dryRun: true,
    batchSize: 1,
  });

  assert.deepEqual(result, {
    scanned: 2,
    wouldCreate: 2,
    wouldSynchronizeValidated: 1,
    migrated: 0,
    synchronizedValidated: 0,
    alreadyExisting: 0,
    failures: [],
  });
  assert.equal(journeys.businessKeys.size, 0);
});

test("V2 backfill migrates and safely replays pending and validated customers", async () => {
  const candidates = new MemoryCandidates(seedCandidates());
  const journeys = new IdempotentJourneyPort(candidates);
  const backfill = new BackfillRewardsV2Journeys(candidates, journeys);

  const first = await backfill.execute({ dryRun: false, batchSize: 100 });
  assert.equal(first.migrated, 2);
  assert.equal(first.synchronizedValidated, 1);
  assert.equal(journeys.businessKeys.size, 3);

  const replay = await backfill.execute({ dryRun: false, batchSize: 100 });
  assert.equal(replay.migrated, 0);
  assert.equal(replay.alreadyExisting, 2);
  assert.equal(replay.synchronizedValidated, 1);
  assert.equal(journeys.businessKeys.size, 3);
});

test("V2 backfill reports a safe identifier and code when one customer fails", async () => {
  const candidates = new MemoryCandidates(seedCandidates());
  const journeys = new IdempotentJourneyPort(candidates, validatedId);
  const result = await new BackfillRewardsV2Journeys(candidates, journeys).execute({
    dryRun: false,
    batchSize: 100,
  });

  assert.deepEqual(result.failures, [{
    customerId: validatedId,
    code: "v2_journey_backfill_failed",
  }]);
  assert.doesNotMatch(JSON.stringify(result), /curp|password|credential/i);
});

function seedCandidates(): RewardsV2BackfillCandidate[] {
  return [
    {
      customerId: pendingId,
      registeredAt: new Date("2026-08-25T10:00:00.000Z"),
      validationStatus: "PENDING",
      validatedAfore: null,
      journeyExists: false,
    },
    {
      customerId: validatedId,
      registeredAt: new Date("2026-08-25T10:01:00.000Z"),
      validationStatus: "VALIDATED",
      validatedAfore: {
        provider: "SISCA",
        productType: "AFORE",
        sourceId: "sisca-validation:00000000-0000-4000-8000-000000009103",
        validatedAt: new Date("2026-08-25T10:02:00.000Z"),
      },
      journeyExists: false,
    },
  ];
}

class MemoryCandidates implements RewardsV2BackfillCandidateQuery {
  constructor(readonly rows: RewardsV2BackfillCandidate[]) {}

  async listAfter(after: CustomerId | null, limit: number): Promise<readonly RewardsV2BackfillCandidate[]> {
    return this.rows.filter((row) => after === null || row.customerId > after).slice(0, limit);
  }

  markExisting(customerId: CustomerId): void {
    const row = this.rows.find((candidate) => candidate.customerId === customerId);
    if (row) row.journeyExists = true;
  }
}

class IdempotentJourneyPort implements RewardsV2LiveJourneyPort {
  readonly businessKeys = new Set<string>();

  constructor(
    private readonly candidates: MemoryCandidates,
    private readonly failCustomer?: CustomerId,
  ) {}

  async ensureInvited(command: EnsureInvitedJourneyCommand): Promise<void> {
    this.businessKeys.add(`registration:${command.customerId}`);
    this.candidates.markExisting(command.customerId);
  }

  async synchronize(command: SynchronizeRewardsEvidenceCommand): Promise<void> {
    if (command.customerId === this.failCustomer) throw new Error("sensitive provider detail");
    await this.ensureInvited(command);
    if (command.validatedAfore) {
      this.businessKeys.add(`product:${command.validatedAfore.sourceId}`);
    }
  }
}
