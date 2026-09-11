import type { BondaCouponBranch, BondaCouponDetail, BondaReceivedCoupon } from "./contracts.js";
import type {
  BondaAffiliateResult,
  BondaCouponCodeResult,
  BondaGateway,
} from "./gateway.js";

export interface FakeBondaGatewayOptions {
  coupons?: readonly BondaCouponDetail[];
  receivedCoupons?: readonly BondaReceivedCoupon[];
  branches?: Readonly<Record<string, readonly BondaCouponBranch[]>>;
  affiliateCodes?: readonly string[];
}

export class FakeBondaGateway implements BondaGateway {
  readonly affiliateCodes: Set<string>;
  readonly codeRequests: Array<{ affiliateCode: string; couponId: string; externalId: string }> = [];
  coupons: BondaCouponDetail[];
  receivedCoupons: BondaReceivedCoupon[];
  branches: Readonly<Record<string, readonly BondaCouponBranch[]>>;

  constructor(options: FakeBondaGatewayOptions = {}) {
    this.coupons = [...(options.coupons ?? [])];
    this.receivedCoupons = [...(options.receivedCoupons ?? [])];
    this.branches = options.branches ?? {};
    this.affiliateCodes = new Set(options.affiliateCodes ?? []);
  }

  async listCouponBranches(
    _affiliateCode: string,
    couponId: string,
  ): Promise<readonly BondaCouponBranch[]> {
    return this.branches[couponId] ?? [];
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
    brandDescription: "",
    branches: [],
    expirationAt: "2027-12-31T23:59:59.000Z",
    imageUrl: null,
    heroImageUrl: null,
    logoImageUrl: null,
    bannerImageUrl: null,
    category: "Entretenimiento",
    channels: ["ONLINE"],
    minimumLevel: "BRONZE",
    displayOrder: 1,
    ...overrides,
  };
}

export function localPreviewBondaCoupons(): readonly BondaCouponDetail[] {
  return [
    fakeBondaCoupon({
      id: "9510",
      name: "Cinépolis",
      discount: "2x1",
      shortDescription: "Beneficio en entradas participantes.",
      description: "Consulta las funciones participantes y las condiciones del beneficio.",
      usageInstructions: "Solicita tu código antes de realizar la compra.",
      category: "Entretenimiento y familia",
      channels: ["ONLINE", "ONSITE"],
      imageUrl: "https://cuponstar-ar.s3.amazonaws.com/public/files/uploads/assets/65b0172b3f7b3.gif",
      heroImageUrl: "https://cuponstar-ar.s3.amazonaws.com/public/files/uploads/assets/65b0172b3f7b3.gif",
    }),
    fakeBondaCoupon({
      id: "12490",
      name: "Farmacias Benavides",
      discount: "10%",
      shortDescription: "10% de descuento en productos participantes.",
      description: "Consulta productos, sucursales y condiciones participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "11208",
      name: "Laboratorio Médico del Chopo",
      discount: "30%",
      shortDescription: "30% de descuento en estudios participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "9471",
      name: "Laboratorio Médico del Chopo",
      discount: "20%",
      shortDescription: "20% de descuento en estudios participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "5850",
      name: "Clínicas Devlyn",
      discount: "10%",
      shortDescription: "10% de descuento en clínicas participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "5849",
      name: "Ópticas Devlyn · Aparatos auditivos",
      discount: "15%",
      shortDescription: "15% de descuento en aparatos auditivos participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "4749",
      name: "Ópticas Devlyn · Productos ópticos",
      discount: "20%",
      shortDescription: "20% de descuento en productos ópticos participantes.",
      category: "Salud y bienestar",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "8344",
      name: "Harmon Hall",
      discount: "45%",
      shortDescription: "45% de descuento sujeto a condiciones participantes.",
      category: "Educación y desarrollo",
      channels: ["ONLINE", "ONSITE"],
    }),
    fakeBondaCoupon({
      id: "11919",
      name: "Martí",
      discount: "Hasta 10%",
      shortDescription: "Hasta 10% de descuento en productos participantes.",
      category: "Deporte y vida activa",
      channels: ["ONLINE", "ONSITE"],
    }),
    fakeBondaCoupon({
      id: "14220",
      name: "Sonora Prime",
      discount: null,
      shortDescription: "Beneficio disponible en establecimientos participantes.",
      category: "Restaurantes finos",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "14806",
      name: "Porfirio's",
      discount: null,
      shortDescription: "Beneficio disponible en establecimientos participantes.",
      category: "Restaurantes finos",
      channels: ["ONSITE"],
    }),
    fakeBondaCoupon({
      id: "14799",
      name: "Harry's Polanco",
      discount: "10%",
      shortDescription: "10% de descuento sujeto a las condiciones participantes.",
      category: "Restaurantes finos",
      channels: ["ONSITE", "WHATSAPP"],
    }),
  ];
}
