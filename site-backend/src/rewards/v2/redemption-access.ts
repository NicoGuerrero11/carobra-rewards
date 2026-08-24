export type RedemptionAccess =
  | { eligible: true; reason: null }
  | { eligible: false; reason: "NO_ACTIVE_PRODUCT" | "REDEMPTION_DISABLED" };

export function evaluateRedemptionAccess(input: {
  activeProductCount: number;
  redemptionFeatureEnabled: boolean;
}): RedemptionAccess {
  if (!Number.isInteger(input.activeProductCount) || input.activeProductCount < 0) {
    throw new Error("activeProductCount must be a non-negative integer");
  }
  if (input.activeProductCount === 0) {
    return { eligible: false, reason: "NO_ACTIVE_PRODUCT" };
  }
  if (!input.redemptionFeatureEnabled) {
    return { eligible: false, reason: "REDEMPTION_DISABLED" };
  }
  return { eligible: true, reason: null };
}
