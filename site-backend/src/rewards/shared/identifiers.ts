export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type CustomerId = Brand<string, "CustomerId">;
export type RewardsAccountId = Brand<string, "RewardsAccountId">;
export type RewardEventId = Brand<string, "RewardEventId">;
export type RuleVersionId = Brand<string, "RuleVersionId">;
export type LedgerEntryId = Brand<string, "LedgerEntryId">;
export type PointLotId = Brand<string, "PointLotId">;
export type CatalogItemId = Brand<string, "CatalogItemId">;
export type InventoryId = Brand<string, "InventoryId">;
export type EntitlementId = Brand<string, "EntitlementId">;
export type RedemptionId = Brand<string, "RedemptionId">;
export type WaitlistEntryId = Brand<string, "WaitlistEntryId">;
export type RedemptionAllocationId = Brand<string, "RedemptionAllocationId">;
export type RedemptionLimitPolicyVersionId = Brand<string, "RedemptionLimitPolicyVersionId">;
export type ReferralId = Brand<string, "ReferralId">;
export type ReferralInvitationLinkId = Brand<string, "ReferralInvitationLinkId">;
export type ReferralLimitPolicyVersionId = Brand<string, "ReferralLimitPolicyVersionId">;
export type ProductContractId = Brand<string, "ProductContractId">;
export type RestrictedWalletId = Brand<string, "RestrictedWalletId">;
export type RestrictedWalletEntryId = Brand<string, "RestrictedWalletEntryId">;
export type AdvisorId = Brand<string, "AdvisorId">;
export type AdvisorAttributionId = Brand<string, "AdvisorAttributionId">;
export type CompensationPolicyVersionId = Brand<string, "CompensationPolicyVersionId">;
export type CompensationRecordId = Brand<string, "CompensationRecordId">;
export type ReviewFlagId = Brand<string, "ReviewFlagId">;
export type CorrelationId = Brand<string, "CorrelationId">;

export function asCustomerId(value: string): CustomerId {
  return requireIdentifier(value) as CustomerId;
}

export function requireIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Identifier cannot be empty");
  return normalized;
}
