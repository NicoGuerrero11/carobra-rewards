import assert from "node:assert/strict";
import test from "node:test";

import { IngestAveContribution } from "../src/rewards/behaviors/ave.js";
import type { PointIssuancePort } from "../src/rewards/ledger/issuance.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import { asCustomerId, type RewardsAccountId } from "../src/rewards/shared/identifiers.js";

const accountId = "account-ave" as RewardsAccountId;
const customerId = asCustomerId("customer-ave");
const command = {
  accountId,
  customerId,
  externalContributionId: "contribution-42",
  status: "CONFIRMED" as const,
  occurredAt: new Date("2026-07-14T12:00:00.000Z"),
  receivedAt: new Date("2026-07-14T12:01:00.000Z"),
  evidenceVersion: "ave-v1",
};

test("AVE ingestion requires an authenticated authorized adapter", async () => {
  const useCase = new IngestAveContribution({ isEligible: async () => true }, new NeverIssuance());
  await assert.rejects(
    useCase.execute(null, command),
    (error: unknown) => error instanceof RewardsError && error.code === "forbidden",
  );
});

test("AVE ingestion ignores non-confirmed evidence before issuance", async () => {
  const useCase = new IngestAveContribution({ isEligible: async () => true }, new NeverIssuance());
  assert.deepEqual(await useCase.execute({
    id: "ave-adapter",
    adapter: "AVE",
    permissions: ["rewards:ingest:ave"],
  }, { ...command, status: "REVERSED" }), {
    status: "IGNORED",
    reason: "not_confirmed",
    award: null,
  });
});

test("AVE adapter persists only bounded safe evidence metadata", async () => {
  const issuance = new CapturingIssuance();
  await new IngestAveContribution({ isEligible: async () => true }, issuance).execute({
    id: "ave-adapter",
    adapter: "AVE",
    permissions: ["rewards:ingest:ave"],
  }, command);
  assert.deepEqual(issuance.command?.event.safeMetadata, {
    evidenceVersion: "ave-v1",
    adapterId: "ave-adapter",
  });
  await assert.rejects(
    new IngestAveContribution({ isEligible: async () => true }, issuance).execute({
      id: "operator@example.com",
      adapter: "AVE",
      permissions: ["rewards:ingest:ave"],
    }, command),
    /customer-sensitive/,
  );
});

class NeverIssuance implements PointIssuancePort {
  async issue(): Promise<never> {
    throw new Error("Issuance must not be called");
  }
}

class CapturingIssuance implements PointIssuancePort {
  command: Parameters<PointIssuancePort["issue"]>[0] | null = null;

  async issue(command: Parameters<PointIssuancePort["issue"]>[0]) {
    this.command = command;
    return {
      eventId: "event-ave" as never,
      ledgerEntryId: "ledger-ave" as never,
      lotId: "lot-ave" as never,
      points: 500n,
      availablePoints: 500n,
      replayed: false,
    };
  }
}
