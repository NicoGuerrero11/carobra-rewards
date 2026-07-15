import type { QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";
import type { IngestQualifyingSiteAction } from "./monthly-interaction.js";
import type { OnboardingEvidenceType, RecordOnboardingEvidence } from "./onboarding.js";

export interface SiteActionHttpRequest {
  action_code: string;
  idempotency_key: string;
  occurred_at: string;
}

export interface OnboardingEvidenceHttpRequest {
  onboarding_instance_id: string;
  evidence_type: OnboardingEvidenceType;
  evidence_version: string;
  idempotency_key: string;
  occurred_at: string;
}

export interface RewardsBehaviorHttpApplication {
  ingestSiteAction(customerId: CustomerId, body: SiteActionHttpRequest): Promise<unknown>;
  recordOnboardingEvidence(
    customerId: CustomerId,
    body: OnboardingEvidenceHttpRequest,
  ): Promise<unknown>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}
interface AccountRow extends QueryResultRow { account_id: string }
export interface BehaviorEligibilityPort {
  isEligible(customerId: CustomerId): Promise<boolean>;
}

export class DefaultRewardsBehaviorHttpApplication implements RewardsBehaviorHttpApplication {
  constructor(
    private readonly database: Queryable,
    private readonly eligibility: BehaviorEligibilityPort,
    private readonly siteActions: IngestQualifyingSiteAction,
    private readonly onboarding: RecordOnboardingEvidence,
    private readonly clock: Clock,
  ) {}

  async ingestSiteAction(customerId: CustomerId, body: SiteActionHttpRequest): Promise<unknown> {
    const accountId = await this.requireContext(customerId);
    const result = await this.siteActions.execute({ accountId, customerId }, {
      actionCode: body.action_code,
      source: "BROWSER",
      sourceId: body.idempotency_key,
      occurredAt: parseInstant(body.occurred_at),
      receivedAt: this.clock.now(),
    });
    return result.status === "NOT_QUALIFYING" ? {
      status: result.status,
      business_month: result.businessMonth,
      award: null,
    } : {
      status: result.status,
      business_month: result.businessMonth,
      award: {
        ledger_entry_id: result.award.ledgerEntryId,
        points: result.award.points.toString(),
        available_points: result.award.availablePoints.toString(),
        replayed: result.award.replayed,
      },
    };
  }

  async recordOnboardingEvidence(
    customerId: CustomerId,
    body: OnboardingEvidenceHttpRequest,
  ): Promise<unknown> {
    const accountId = await this.requireContext(customerId);
    const result = await this.onboarding.execute({
      accountId,
      customerId,
      onboardingInstanceId: body.onboarding_instance_id,
      evidenceType: body.evidence_type,
      evidenceVersion: body.evidence_version,
      source: "BROWSER",
      sourceId: body.idempotency_key,
      occurredAt: parseInstant(body.occurred_at),
      receivedAt: this.clock.now(),
    });
    return {
      complete: result.complete,
      evidence_types: result.evidenceTypes,
      replayed_evidence: result.replayedEvidence,
      award_status: result.awardStatus,
      disabled_reason: result.disabledReason,
      award: result.award ? {
        ledger_entry_id: result.award.ledgerEntryId,
        points: result.award.points.toString(),
        available_points: result.award.availablePoints.toString(),
        replayed: result.award.replayed,
      } : null,
    };
  }

  private async requireContext(customerId: CustomerId): Promise<RewardsAccountId> {
    if (!await this.eligibility.isEligible(customerId)) throw rewardsErrors.notEligible();
    const account = (await this.database.query<AccountRow>(`
      SELECT id::text AS account_id FROM rewards_accounts WHERE customer_id = $1
    `, [customerId])).rows[0];
    if (!account) throw rewardsErrors.notEligible();
    return account.account_id as RewardsAccountId;
  }
}

function parseInstant(value: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Behavior occurred_at must be valid ISO-8601");
  return instant;
}
