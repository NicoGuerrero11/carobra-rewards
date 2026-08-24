export const accountStatuses = ["ACTIVE", "FROZEN", "CLOSED"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export const rewardEventSources = ["INTERNAL", "SCHEDULED", "BROWSER", "PARTNER"] as const;
export type RewardEventSource = (typeof rewardEventSources)[number];

export const validityPolicies = ["NORMAL_18_MONTHS", "CAMPAIGN_90_DAYS"] as const;
export type ValidityPolicy = (typeof validityPolicies)[number];

export const ledgerEntryTypes = [
  "ISSUANCE",
  "RESERVATION",
  "CONSUMPTION",
  "RELEASE",
  "EXPIRATION",
  "ADJUSTMENT",
  "REFUND",
] as const;
export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

export const catalogModes = ["FREE_ENTITLEMENT", "POINTS", "PRODUCT_BENEFIT"] as const;
export type CatalogMode = (typeof catalogModes)[number];

export const inventoryModes = ["UNLIMITED", "CONTROLLED", "CAMPAIGN", "WAITLIST"] as const;
export type InventoryMode = (typeof inventoryModes)[number];

export const entitlementStatuses = ["AVAILABLE", "USED", "EXPIRED", "CANCELLED"] as const;
export type EntitlementStatus = (typeof entitlementStatuses)[number];

export const waitlistStatuses = ["WAITING", "PROMOTED", "CANCELLED", "EXPIRED"] as const;
export type WaitlistStatus = (typeof waitlistStatuses)[number];

export const redemptionStatuses = [
  "PENDING",
  "CONFIRMED",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
  "WAITLISTED",
] as const;
export type RedemptionStatus = (typeof redemptionStatuses)[number];

export const redemptionLimitScopes = ["GLOBAL", "CATALOG_ITEM", "INVENTORY_MODE"] as const;
export type RedemptionLimitScope = (typeof redemptionLimitScopes)[number];

export const referralStatuses = [
  "ATTRIBUTED",
  "REGISTERED",
  "ACTIVE",
  "REJECTED",
  "HELD_FOR_REVIEW",
] as const;
export type ReferralStatus = (typeof referralStatuses)[number];

export const productProviders = ["SKANDIA", "QUALITAS"] as const;
export type ProductProvider = (typeof productProviders)[number];

export const productContractStatuses = ["CONTRACTED", "ACTIVE", "CANCELLED", "EXPIRED"] as const;
export type ProductContractStatus = (typeof productContractStatuses)[number];

export const restrictedWalletStatuses = ["PENDING", "AVAILABLE", "APPLIED", "FROZEN", "CANCELLED"] as const;
export type RestrictedWalletStatus = (typeof restrictedWalletStatuses)[number];

export const attributionOrigins = ["ADVISOR", "SELF_REGISTRATION", "CUSTOMER_REFERRAL"] as const;
export type AttributionOrigin = (typeof attributionOrigins)[number];

export const compensationStatuses = ["CALCULATED", "HELD_FOR_REVIEW", "APPROVED", "EXPORTED", "PAID", "CANCELLED"] as const;
export type CompensationStatus = (typeof compensationStatuses)[number];

export const reviewFlagStatuses = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;
export type ReviewFlagStatus = (typeof reviewFlagStatuses)[number];

export const jobStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const rewardsJourneyStates = ["INVITED", "ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type RewardsJourneyState = (typeof rewardsJourneyStates)[number];

export const rewardsLevels = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "TITANIUM"] as const;
export type RewardsLevel = (typeof rewardsLevels)[number];

export const rewardsProductFactStatuses = [
  "SIGNED",
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "CANCELLED",
  "ENDED",
] as const;
export type RewardsProductFactStatus = (typeof rewardsProductFactStatuses)[number];

export const rewardsV2RuleTypes = [
  "POINT_AWARD",
  "LEVEL_RULE",
  "PRODUCT_EVIDENCE",
  "FEATURE_FLAG",
] as const;
export type RewardsV2RuleType = (typeof rewardsV2RuleTypes)[number];
