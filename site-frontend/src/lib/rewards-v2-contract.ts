export type RewardsV2Level = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "TITANIUM";
export type RewardsV2JourneyState = "INVITED" | "ACTIVE" | "INACTIVE" | "BLOCKED";
export type RewardsV2ProductStatus = "SIGNED" | "PENDING" | "ACTIVE" | "REJECTED" | "CANCELLED" | "ENDED";

export interface RewardsV2ScenarioListItem {
  code: string;
  name: string;
  description: string;
}

export interface RewardsJourneySummary {
  customer_id: string;
  journey: {
    state: RewardsV2JourneyState;
    current_level: RewardsV2Level | null;
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
    target_level: RewardsV2Level | null;
    rule_available: boolean;
    remaining_active_products: number | null;
    remaining_registration_months: number | null;
    remaining_qualifying_activities: number | null;
  };
  products: Array<{
    provider: string;
    product_type: string;
    status: RewardsV2ProductStatus;
    activated_at: string | null;
  }>;
  recent_movements: Array<{
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

export function levelLabel(level: RewardsV2Level | null): string {
  if (!level) return "Invitado";
  return {
    BRONZE: "Bronce",
    SILVER: "Plata",
    GOLD: "Oro",
    PLATINUM: "Platino",
    TITANIUM: "Titanio",
  }[level];
}

export function journeyStateLabel(state: RewardsV2JourneyState): string {
  return {
    INVITED: "Esperando validación",
    ACTIVE: "Cuenta activa",
    INACTIVE: "Sin producto activo",
    BLOCKED: "Revisión requerida",
  }[state];
}
