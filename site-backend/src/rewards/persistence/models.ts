import type {
  AdvisorAttributionId,
  AdvisorId,
  CustomerId,
  CatalogItemId,
  CompensationPolicyVersionId,
  CompensationRecordId,
  EntitlementId,
  InventoryId,
  LedgerEntryId,
  PointLotId,
  ProductContractId,
  ReferralId,
  RewardEventId,
  RedemptionAllocationId,
  RedemptionId,
  RestrictedWalletEntryId,
  RestrictedWalletId,
  ReviewFlagId,
  RewardsAccountId,
  RuleVersionId,
  WaitlistEntryId,
} from "../shared/identifiers.js";
import type {
  AccountStatus,
  AttributionOrigin,
  CatalogMode,
  EntitlementStatus,
  InventoryMode,
  LedgerEntryType,
  CompensationStatus,
  ProductContractStatus,
  ProductProvider,
  ReferralStatus,
  RewardEventSource,
  RedemptionStatus,
  RestrictedWalletStatus,
  ReviewFlagStatus,
  ValidityPolicy,
  WaitlistStatus,
} from "../shared/enums.js";

export interface RewardsAccountRecord {
  id: RewardsAccountId;
  customerId: CustomerId;
  status: AccountStatus;
  activatedAt: Date;
  availablePoints: bigint;
  reservedPoints: bigint;
}

export interface BehaviorRuleVersionRecord {
  id: RuleVersionId;
  code: string;
  version: number;
  enabled: boolean;
  pointValue: bigint | null;
  validityPolicy: ValidityPolicy;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
}

export interface RewardEventRecord {
  id: RewardEventId;
  accountId: RewardsAccountId;
  customerId: CustomerId;
  ruleVersionId: RuleVersionId;
  source: RewardEventSource;
  sourceId: string;
  eventType: string;
  occurredAt: Date;
  receivedAt: Date;
}

export interface LedgerEntryRecord {
  id: LedgerEntryId;
  accountId: RewardsAccountId;
  rewardEventId: RewardEventId | null;
  ruleVersionId: RuleVersionId | null;
  entryType: LedgerEntryType;
  pointsDelta: bigint;
  idempotencyKey: string;
  createdAt: Date;
}

export interface PointLotRecord {
  id: PointLotId;
  accountId: RewardsAccountId;
  sourceLedgerEntryId: LedgerEntryId;
  issuedPoints: bigint;
  remainingPoints: bigint;
  issuedAt: Date;
  expiresAt: Date;
}

export interface CatalogItemRecord {
  id: CatalogItemId;
  code: string;
  version: number;
  mode: CatalogMode;
  enabled: boolean;
  pointPrice: bigint | null;
  inventoryMode: InventoryMode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
}

export interface CatalogInventoryRecord {
  id: InventoryId;
  catalogItemId: CatalogItemId;
  totalCapacity: number | null;
  reservedQuantity: number;
  fulfilledQuantity: number;
  releasedQuantity: number;
}

export interface EntitlementRecord {
  id: EntitlementId;
  accountId: RewardsAccountId;
  catalogItemId: CatalogItemId;
  status: EntitlementStatus;
  idempotencyKey: string;
  grantedAt: Date;
  usedAt: Date | null;
  expiresAt: Date | null;
}

export interface RedemptionRecord {
  id: RedemptionId;
  accountId: RewardsAccountId;
  catalogItemId: CatalogItemId;
  status: RedemptionStatus;
  pointsCost: bigint;
  quantity: number;
  idempotencyKey: string;
  requestedAt: Date;
}

export interface WaitlistEntryRecord {
  id: WaitlistEntryId;
  accountId: RewardsAccountId;
  catalogItemId: CatalogItemId;
  redemptionId: RedemptionId | null;
  status: WaitlistStatus;
  joinedAt: Date;
}

export interface RedemptionAllocationRecord {
  id: RedemptionAllocationId;
  redemptionId: RedemptionId;
  pointAllocationId: string;
  points: bigint;
}

export interface ReferralRecord {
  id: ReferralId;
  referringAccountId: RewardsAccountId;
  referringCustomerId: CustomerId;
  referredCustomerId: CustomerId | null;
  referredIdentityHash: string;
  source: string;
  sourceId: string;
  status: ReferralStatus;
  attributedAt: Date;
}

export interface ProductContractRecord {
  id: ProductContractId;
  accountId: RewardsAccountId;
  customerId: CustomerId;
  provider: ProductProvider;
  productCode: string;
  externalContractId: string;
  status: ProductContractStatus;
  contractedAt: Date;
  activatedAt: Date | null;
  cancelledAt: Date | null;
}

export interface RestrictedWalletRecord {
  id: RestrictedWalletId;
  accountId: RewardsAccountId;
  productContractId: ProductContractId;
  currency: string;
  policyVersion: string;
  status: RestrictedWalletStatus;
  pendingAmount: string;
  availableAmount: string;
  appliedAmount: string;
  cancelledAmount: string;
}

export interface RestrictedWalletEntryRecord {
  id: RestrictedWalletEntryId;
  walletId: RestrictedWalletId;
  entryType: string;
  amountDelta: string;
  idempotencyKey: string;
  policyVersion: string;
  createdAt: Date;
}

export interface AdvisorRecord {
  id: AdvisorId;
  externalAdvisorId: string;
  status: string;
  displayName: string;
}

export interface AdvisorAttributionRecord {
  id: AdvisorAttributionId;
  advisorId: AdvisorId | null;
  customerId: CustomerId;
  productContractId: ProductContractId | null;
  origin: AttributionOrigin;
  sourceId: string;
  attributedAt: Date;
  endedAt: Date | null;
}

export interface CompensationPolicyVersionRecord {
  id: CompensationPolicyVersionId;
  code: string;
  version: number;
  enabled: boolean;
  advisorShareRate: string | null;
  customerBenefitShareRate: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
}

export interface CompensationRecord {
  id: CompensationRecordId;
  advisorId: AdvisorId | null;
  customerId: CustomerId;
  productContractId: ProductContractId | null;
  policyVersionId: CompensationPolicyVersionId;
  currency: string;
  grossAmount: string;
  advisorShareAmount: string;
  customerBenefitAmount: string;
  status: CompensationStatus;
  idempotencyKey: string;
  calculatedAt: Date;
}

export interface RewardsReviewFlagRecord {
  id: ReviewFlagId;
  flagType: string;
  subjectType: string;
  subjectId: string;
  status: ReviewFlagStatus;
  severity: string;
  safeReasonCode: string;
  openedAt: Date;
  resolvedAt: Date | null;
}
