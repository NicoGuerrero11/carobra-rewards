import { rewardsErrors } from "../shared/errors.js";
import type { CustomerId } from "../shared/identifiers.js";
import type { ObserveRewardsEvidenceResult } from "./observe-validated-evidence.js";
import type { RewardsAccountSummaryQuery } from "./summary.js";

export interface RewardsEligibilityHttpResponse {
  customer_id: string;
  eligible: boolean;
  reason: string | null;
  customer_status: string | null;
  sisca_validation_status: string | null;
  afore_relation_status: string | null;
}

export interface RewardsAccountSummaryHttpResponse {
  account_id: string;
  available_points: string;
  reserved_points: string;
  next_expiring_points: string;
  next_expiration_at: string | null;
  afore_relation_status: string;
  recent_movements: ReadonlyArray<{
    id: string;
    entry_type: string;
    points_delta: string;
    rule_code: string | null;
    occurred_at: string;
  }>;
  earning_opportunities: ReadonlyArray<{
    code: string;
    point_value: string;
    validity_policy: string;
  }>;
  benefits: {
    available_items: number;
    redemption_enabled: boolean;
    unavailable_reason: string | null;
  };
}

export interface RewardsEvidenceObservation {
  execute(customerId: CustomerId): Promise<ObserveRewardsEvidenceResult>;
}

export interface RewardsAccountHttpApplication {
  getEligibility(customerId: CustomerId): Promise<RewardsEligibilityHttpResponse>;
  getSummary(customerId: CustomerId): Promise<RewardsAccountSummaryHttpResponse>;
}

export class DefaultRewardsAccountHttpApplication implements RewardsAccountHttpApplication {
  constructor(
    private readonly observation: RewardsEvidenceObservation,
    private readonly summaries: RewardsAccountSummaryQuery,
  ) {}

  async getEligibility(customerId: CustomerId): Promise<RewardsEligibilityHttpResponse> {
    const { eligibility } = await this.observation.execute(customerId);
    return {
      customer_id: eligibility.customerId,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      customer_status: eligibility.customerStatus,
      sisca_validation_status: eligibility.siscaValidationStatus,
      afore_relation_status: eligibility.aforeRelationStatus,
    };
  }

  async getSummary(customerId: CustomerId): Promise<RewardsAccountSummaryHttpResponse> {
    const observed = await this.observation.execute(customerId);
    if (!observed.eligibility.eligible) throw rewardsErrors.notEligible();
    const summary = await this.summaries.getForCustomer(customerId);
    if (!summary) throw new Error("Eligible Rewards account summary was not found");
    return {
      account_id: summary.accountId,
      available_points: summary.availablePoints.toString(),
      reserved_points: summary.reservedPoints.toString(),
      next_expiring_points: summary.nextExpiringPoints.toString(),
      next_expiration_at: summary.nextExpirationAt?.toISOString() ?? null,
      afore_relation_status: observed.eligibility.aforeRelationStatus!,
      recent_movements: summary.recentMovements.map((movement) => ({
        id: movement.id,
        entry_type: movement.entryType,
        points_delta: movement.pointsDelta.toString(),
        rule_code: movement.ruleCode,
        occurred_at: movement.occurredAt.toISOString(),
      })),
      earning_opportunities: summary.earningOpportunities.map((opportunity) => ({
        code: opportunity.code,
        point_value: opportunity.pointValue.toString(),
        validity_policy: opportunity.validityPolicy,
      })),
      benefits: {
        available_items: summary.benefits.availableItems,
        redemption_enabled: summary.benefits.redemptionEnabled,
        unavailable_reason: summary.benefits.unavailableReason,
      },
    };
  }
}
