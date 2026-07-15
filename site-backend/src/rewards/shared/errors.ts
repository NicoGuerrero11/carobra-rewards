export type RewardsErrorCode =
  | "rewards_not_eligible"
  | "unauthenticated"
  | "duplicate_event"
  | "insufficient_points"
  | "inventory_unavailable"
  | "monthly_limit_reached"
  | "self_referral"
  | "rule_disabled"
  | "invalid_state_transition"
  | "forbidden";

export class RewardsError extends Error {
  constructor(
    readonly code: RewardsErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "RewardsError";
  }
}

export const rewardsErrors = {
  notEligible: () => new RewardsError("rewards_not_eligible", "Rewards account is not eligible", 403),
  unauthenticated: () => new RewardsError("unauthenticated", "Authentication is required", 401),
  duplicateEvent: () => new RewardsError("duplicate_event", "Reward event was already processed", 409),
  insufficientPoints: () => new RewardsError("insufficient_points", "Available points are insufficient", 409),
  inventoryUnavailable: () => new RewardsError("inventory_unavailable", "Inventory is unavailable", 409),
  monthlyLimitReached: () => new RewardsError("monthly_limit_reached", "Monthly redemption limit was reached", 409),
  referralMonthlyLimitReached: () => new RewardsError("monthly_limit_reached", "Monthly referral limit was reached", 409),
  selfReferral: () => new RewardsError("self_referral", "A customer cannot refer themselves", 409),
  ruleDisabled: (reason: string) => new RewardsError("rule_disabled", "Reward rule is disabled", 409, { reason }),
  invalidTransition: () => new RewardsError("invalid_state_transition", "Requested state transition is invalid", 409),
  forbidden: () => new RewardsError("forbidden", "The actor is not authorized", 403),
} as const;
