import type {
  RewardsJourneyState,
  RewardsLevel,
  RewardsProductFactStatus,
} from "../shared/enums.js";

export interface RewardsJourneySummaryHttpResponse {
  customer_id: string;
  journey: {
    state: RewardsJourneyState;
    current_level: RewardsLevel | null;
    validation_status: string;
    registered_at: string;
  };
  redemption: {
    eligible: boolean;
    reason: "NO_ACTIVE_PRODUCT" | "REDEMPTION_DISABLED" | null;
  };
  points: {
    available: string;
    reserved: string;
    next_expiration_at: string | null;
  };
  progress: {
    target_level: RewardsLevel | null;
    rule_available: boolean;
    remaining_active_products: number | null;
    remaining_registration_months: number | null;
    remaining_qualifying_activities: number | null;
  };
  products: ReadonlyArray<{
    product_type: string;
    status: RewardsProductFactStatus;
    activated_at: string | null;
  }>;
  recent_movements: ReadonlyArray<{
    code: string;
    points_delta: string;
    occurred_at: string;
  }>;
  modules: {
    benefits_enabled: boolean;
    expiry_policy_approved: boolean;
    ave_enabled: boolean;
    referrals_enabled: boolean;
    renewals_enabled: boolean;
  };
}

export function assertRewardsJourneySummaryContract(
  value: RewardsJourneySummaryHttpResponse,
): RewardsJourneySummaryHttpResponse {
  if (!value.customer_id.trim()) throw new Error("Journey summary customer is required");
  if (!/^\d+$/.test(value.points.available) || !/^\d+$/.test(value.points.reserved)) {
    throw new Error("Journey summary point values must be exact non-negative strings");
  }
  if (value.redemption.eligible && value.products.every((product) => product.status !== "ACTIVE")) {
    throw new Error("Journey summary cannot enable redemption without an active product");
  }
  if (/\bSISCA\b/i.test(JSON.stringify(value))) {
    throw new Error("Journey summary cannot expose internal provider terminology");
  }
  return value;
}
