import type { RewardsLevel } from "../shared/enums.js";

export type BondaAffiliateIntegrationState =
  | "DISABLED"
  | "PENDING"
  | "ACTIVE"
  | "ACTION_REQUIRED";

export type BondaCouponAccessState =
  | "AVAILABLE"
  | "NO_LEVEL"
  | "ACCOUNT_UNAVAILABLE"
  | "AFFILIATE_PENDING"
  | "COUPON_UNAVAILABLE"
  | "PARTNER_UNAVAILABLE"
  | "FEATURE_DISABLED";

export type BondaCouponChannel =
  | "ONLINE"
  | "ONSITE"
  | "EMAIL"
  | "PHONE"
  | "WHATSAPP";

export interface BondaAffiliateStatusHttpResponse {
  state: BondaAffiliateIntegrationState;
  can_request_codes: boolean;
  retry_scheduled: boolean;
}

export interface BondaCouponSummary {
  id: string;
  name: string;
  discount: string | null;
  shortDescription: string;
  expirationAt: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  logoImageUrl: string | null;
  bannerImageUrl: string | null;
  category: string | null;
  channels: readonly BondaCouponChannel[];
  minimumLevel: RewardsLevel;
  displayOrder: number;
}

export interface BondaCouponDetail extends BondaCouponSummary {
  description: string;
  usageInstructions: string;
  legalTerms: string;
  brandDescription: string;
  branches: readonly BondaCouponBranch[];
}

export interface BondaCouponBranch {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface BondaCouponCatalogHttpResponse {
  current_level: RewardsLevel | null;
  access_state: BondaCouponAccessState;
  affiliate_state: BondaAffiliateIntegrationState;
  items: readonly BondaCouponSummary[];
  refreshed_at: string | null;
  page: number;
  page_size: number;
  total: number;
  next_page: number | null;
}

export interface BondaCouponDetailHttpResponse {
  access_state: BondaCouponAccessState;
  affiliate_state: BondaAffiliateIntegrationState;
  item: BondaCouponDetail | null;
}

export interface BondaCouponBranchesHttpResponse {
  items: readonly BondaCouponBranch[];
}

export type BondaCouponCodeStatus =
  | "ISSUED"
  | "LIMIT_REACHED"
  | "INVENTORY_UNAVAILABLE"
  | "UNAVAILABLE"
  | "VERIFICATION_REQUIRED";

export interface BondaCouponCodeHttpResponse {
  request_id: string;
  status: BondaCouponCodeStatus;
  code: string | null;
  instructions: string;
  receipt_id: string | null;
}

export interface BondaReceivedCoupon {
  receiptId: string;
  couponId: string | null;
  name: string;
  code: string | null;
  requestedAt: string | null;
}

export interface BondaReceivedCouponsHttpResponse {
  items: readonly BondaReceivedCoupon[];
}

export function assertBondaCouponCatalogContract(
  value: BondaCouponCatalogHttpResponse,
): BondaCouponCatalogHttpResponse {
  if (value.current_level === null && value.items.length > 0) {
    throw new Error("A customer without a Rewards level cannot receive coupons");
  }
  for (const item of value.items) assertCoupon(item);
  return value;
}

export function assertBondaCouponDetailContract(
  value: BondaCouponDetailHttpResponse,
): BondaCouponDetailHttpResponse {
  if (value.item) {
    assertCoupon(value.item);
    for (const text of [value.item.description, value.item.usageInstructions, value.item.legalTerms, value.item.brandDescription]) {
      assertSafeText(text);
    }
    for (const branch of value.item.branches) {
      for (const text of [branch.id, branch.name, branch.address, branch.city ?? "", branch.state ?? ""]) {
        assertSafeText(text);
      }
      if ((branch.latitude === null) !== (branch.longitude === null)) {
        throw new Error("Branch coordinates must be provided as a pair");
      }
      if (branch.latitude !== null && (!Number.isFinite(branch.latitude) || Math.abs(branch.latitude) > 90)) {
        throw new Error("Branch latitude is invalid");
      }
      if (branch.longitude !== null && (!Number.isFinite(branch.longitude) || Math.abs(branch.longitude) > 180)) {
        throw new Error("Branch longitude is invalid");
      }
    }
  }
  return value;
}

function assertCoupon(item: BondaCouponSummary): void {
  if (!item.id.trim() || !item.name.trim()) throw new Error("Coupon identity is required");
  if (!Number.isInteger(item.displayOrder) || item.displayOrder < 0) {
    throw new Error("Coupon display order must be a non-negative integer");
  }
  assertSafeText(item.name);
  assertSafeText(item.shortDescription);
  if (item.discount) assertSafeText(item.discount);
  for (const imageUrl of [item.imageUrl, item.heroImageUrl, item.logoImageUrl, item.bannerImageUrl]) {
    if (imageUrl && new URL(imageUrl).protocol !== "https:") {
      throw new Error("Coupon images must use HTTPS");
    }
  }
}

function assertSafeText(value: string): void {
  if (/<[a-z][\s\S]*>/i.test(value) || /javascript:/i.test(value)) {
    throw new Error("Coupon text contains unsafe markup");
  }
}
