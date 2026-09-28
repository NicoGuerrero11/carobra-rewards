import type { BondaCouponBranch, BondaCouponDetail, BondaReceivedCoupon } from "./contracts.js";

export interface BondaAffiliateResult {
  state: "ACTIVE" | "ALREADY_EXISTS";
  externalMemberId: string | null;
}

export interface BondaCouponCodeResult {
  code: string | null;
  instructions: string;
  receiptId: string | null;
}

export interface BondaGateway {
  createAffiliate(rewardsId: string): Promise<BondaAffiliateResult>;
  affiliateExists(rewardsId: string): Promise<boolean>;
  listCoupons(affiliateCode: string): Promise<readonly BondaCouponDetail[]>;
  getCoupon(affiliateCode: string, couponId: string): Promise<BondaCouponDetail | null>;
  listCouponBranches(affiliateCode: string, couponId: string): Promise<readonly BondaCouponBranch[]>;
  requestCouponCode(
    affiliateCode: string,
    couponId: string,
    externalId: string,
  ): Promise<BondaCouponCodeResult>;
  listReceivedCoupons(affiliateCode: string): Promise<readonly BondaReceivedCoupon[]>;
}

export type BondaGatewayErrorCode =
  | "PARTNER_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "INVALID_RESPONSE"
  | "COUPON_UNAVAILABLE"
  | "COUPON_LIMIT_REACHED"
  | "COUPON_INVENTORY_UNAVAILABLE"
  | "AMBIGUOUS_CODE_REQUEST"
  | "FEATURE_DISABLED";

export class BondaGatewayError extends Error {
  constructor(
    readonly code: BondaGatewayErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BondaGatewayError";
  }
}
