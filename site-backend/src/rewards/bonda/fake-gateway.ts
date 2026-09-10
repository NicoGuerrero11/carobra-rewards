import type { BondaCouponDetail, BondaReceivedCoupon } from "./contracts.js";
import type {
  BondaAffiliateResult,
  BondaCouponCodeResult,
  BondaGateway,
} from "./gateway.js";

export interface FakeBondaGatewayOptions {
  coupons?: readonly BondaCouponDetail[];
  receivedCoupons?: readonly BondaReceivedCoupon[];
  affiliateCodes?: readonly string[];
}

export class FakeBondaGateway implements BondaGateway {
  readonly affiliateCodes: Set<string>;
  readonly codeRequests: Array<{ affiliateCode: string; couponId: string; externalId: string }> = [];
  coupons: BondaCouponDetail[];
  receivedCoupons: BondaReceivedCoupon[];

  constructor(options: FakeBondaGatewayOptions = {}) {
    this.coupons = [...(options.coupons ?? [])];
    this.receivedCoupons = [...(options.receivedCoupons ?? [])];
    this.affiliateCodes = new Set(options.affiliateCodes ?? []);
  }

  async createAffiliate(rewardsId: string): Promise<BondaAffiliateResult> {
    const state = this.affiliateCodes.has(rewardsId) ? "ALREADY_EXISTS" : "ACTIVE";
    this.affiliateCodes.add(rewardsId);
    return { state, externalMemberId: state === "ACTIVE" ? `member:${rewardsId}` : null };
  }

  async affiliateExists(rewardsId: string): Promise<boolean> {
    return this.affiliateCodes.has(rewardsId);
  }

  async listCoupons(_affiliateCode: string): Promise<readonly BondaCouponDetail[]> {
    return this.coupons;
  }

  async getCoupon(
    _affiliateCode: string,
    couponId: string,
  ): Promise<BondaCouponDetail | null> {
    return this.coupons.find((coupon) => coupon.id === couponId) ?? null;
  }

  async requestCouponCode(
    affiliateCode: string,
    couponId: string,
    externalId: string,
  ): Promise<BondaCouponCodeResult> {
    this.codeRequests.push({ affiliateCode, couponId, externalId });
    return {
      code: `CAROBRA-${couponId}`,
      instructions: "Presenta este código al realizar tu compra.",
      receiptId: `receipt:${externalId}`,
    };
  }

  async listReceivedCoupons(_affiliateCode: string): Promise<readonly BondaReceivedCoupon[]> {
    return this.receivedCoupons;
  }
}

export function fakeBondaCoupon(
  overrides: Partial<BondaCouponDetail> = {},
): BondaCouponDetail {
  return {
    id: "coupon-cinepolis",
    name: "Cinépolis",
    discount: "2x1",
    shortDescription: "Beneficio en entradas participantes.",
    description: "Consulta las funciones participantes.",
    usageInstructions: "Solicita tu código antes de comprar.",
    legalTerms: "Sujeto a disponibilidad y vigencia.",
    expirationAt: "2027-12-31T23:59:59.000Z",
    imageUrl: null,
    category: "Entretenimiento",
    channels: ["ONLINE"],
    minimumLevel: "BRONZE",
    displayOrder: 1,
    ...overrides,
  };
}
