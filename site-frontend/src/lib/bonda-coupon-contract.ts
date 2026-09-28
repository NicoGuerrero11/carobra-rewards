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
  heroImageUrl: string | null;
  logoImageUrl: string | null;
  bannerImageUrl: string | null;
  category: string | null;
  channels: CouponChannel[];
  minimumLevel: RewardsV2Level;
  displayOrder: number;
}

export interface BondaCouponDetail extends BondaCouponSummary {
  description: string;
  usageInstructions: string;
  legalTerms: string;
  brandDescription: string;
  branches: BondaCouponBranch[];
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

export function carobraCouponCategory(category: string | null): string {
  const value = (category ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/cine|entretenimiento|espectaculo/.test(value)) return "Cine y entretenimiento";
  if (/farmacia|salud|optica|cuidado|bienestar|laboratorio/.test(value)) return "Salud y bienestar";
  if (/idioma|educacion|curso|capacitacion/.test(value)) return "Educación";
  if (/deport|fitness|gimnasio|yoga/.test(value)) return "Deporte y bienestar";
  if (/restaurant|gastronom|comida|bebida/.test(value)) return "Restaurantes";
  if (/moda|indumentaria|calzado|accesorio|tienda/.test(value)) return "Compras";
  if (/viaje|hotel|turismo|aerolinea/.test(value)) return "Viajes";
  return "Otros beneficios";
}
