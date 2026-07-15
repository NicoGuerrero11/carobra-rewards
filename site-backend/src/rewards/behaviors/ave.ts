import type { PointIssuancePort, PointIssuanceResult } from "../ledger/issuance.js";
import { normalizeRewardEvent } from "../ledger/reward-event.js";
import { rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";
import { assertSafeText } from "../shared/privacy.js";

export interface AveAdapterPrincipal {
  id: string;
  adapter: "AVE";
  permissions: readonly string[];
}

export interface AveContributionCommand {
  accountId: RewardsAccountId;
  customerId: CustomerId;
  externalContributionId: string;
  status: "PENDING" | "CONFIRMED" | "REVERSED";
  occurredAt: Date;
  receivedAt: Date;
  evidenceVersion: string;
}

export type AveContributionResult =
  | { status: "IGNORED"; reason: "not_confirmed"; award: null }
  | { status: "AWARDED"; reason: null; award: PointIssuanceResult };

export interface AveCustomerEligibilityPort {
  isEligible(accountId: RewardsAccountId, customerId: CustomerId, asOf: Date): Promise<boolean>;
}

export class IngestAveContribution {
  constructor(
    private readonly eligibility: AveCustomerEligibilityPort,
    private readonly issuance: PointIssuancePort,
  ) {}

  async execute(
    principal: AveAdapterPrincipal | null,
    command: AveContributionCommand,
  ): Promise<AveContributionResult> {
    if (!principal?.id.trim() || principal.adapter !== "AVE"
      || !principal.permissions.includes("rewards:ingest:ave")) {
      throw rewardsErrors.forbidden();
    }
    const adapterId = assertSafeText("AVE adapter ID", principal.id, 120);
    if (command.status !== "CONFIRMED") {
      return { status: "IGNORED", reason: "not_confirmed", award: null };
    }
    if (!await this.eligibility.isEligible(command.accountId, command.customerId, command.occurredAt)) {
      throw rewardsErrors.notEligible();
    }
    const externalContributionId = bounded(
      "AVE external contribution ID",
      command.externalContributionId,
      150,
    );
    const evidenceVersion = bounded("AVE evidence version", command.evidenceVersion, 80);
    const award = await this.issuance.issue({
      accountId: command.accountId,
      ruleCode: "AVE_CONFIRMED_CONTRIBUTION",
      event: normalizeRewardEvent({
        source: "PARTNER",
        sourceId: `ave-contribution:${externalContributionId}`,
        eventType: "AVE_CONFIRMED_CONTRIBUTION",
        customerId: command.customerId,
        occurredAt: command.occurredAt,
        receivedAt: command.receivedAt,
        safeMetadata: { evidenceVersion, adapterId },
      }),
      issuedAt: command.receivedAt,
    });
    return { status: "AWARDED", reason: null, award };
  }
}

function bounded(name: string, value: string, maximum: number): string {
  return assertSafeText(name, value, maximum);
}
