import type { RewardsV2Level } from "./rewards-v2-contract";

export type CouponAccessState =
  | "AVAILABLE"
  | "NO_LEVEL"
  | "ACCOUNT_UNAVAILABLE"
  | "AFFILIATE_PENDING"
  | "COUPON_UNAVAILABLE"
  | "PARTNER_UNAVAILABLE"
  | "FEATURE_DISABLED";

export type AffiliateState = "DISABLED" | "PENDING" | "ACTIVE" | "ACTION_REQUIRED";
export type CouponChannel = "ONLINE" | "ONSITE" | "EMAIL" | "PHONE" | "WHATSAPP";

export interface BondaCouponSummary {
  id: string;
  name: string;
  discount: string | null;
  shortDescription: string;
  expirationAt: string | null;
  imageUrl: string | null;
  category: string | null;
  channels: CouponChannel[];
  minimumLevel: RewardsV2Level;
  displayOrder: number;
}

export interface BondaCouponDetail extends BondaCouponSummary {
  description: string;
  usageInstructions: string;
  legalTerms: string;
}

export interface BondaCouponCatalog {
  current_level: RewardsV2Level | null;
  access_state: CouponAccessState;
  affiliate_state: AffiliateState;
  items: BondaCouponSummary[];
  refreshed_at: string | null;
  page: number;
  page_size: number;
  total: number;
  next_page: number | null;
}

export interface BondaCouponDetailResponse {
  access_state: CouponAccessState;
  affiliate_state: AffiliateState;
  item: BondaCouponDetail | null;
}

export interface BondaCouponCodeResponse {
  request_id: string;
  status:
    | "ISSUED"
    | "LIMIT_REACHED"
    | "INVENTORY_UNAVAILABLE"
    | "UNAVAILABLE"
    | "VERIFICATION_REQUIRED";
  code: string | null;
  instructions: string;
  receipt_id: string | null;
}

export interface BondaCouponHistory {
  items: Array<{
    receiptId: string;
    couponId: string | null;
    name: string;
    code: string | null;
    requestedAt: string | null;
  }>;
}

export function couponChannelLabel(channel: CouponChannel): string {
  return {
    ONLINE: "En línea",
    ONSITE: "En sucursal",
    EMAIL: "Correo",
    PHONE: "Teléfono",
    WHATSAPP: "WhatsApp",
  }[channel];
}
