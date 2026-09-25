import type {
  BondaCouponBranch,
  BondaCouponChannel,
  BondaCouponDetail,
  BondaReceivedCoupon,
} from "./contracts.js";
import { BondaGatewayError } from "./gateway.js";

const MAX_TEXT_LENGTH = 12_000;

export function htmlToSafeText(value: unknown, maximum = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") return "";
  const withoutActiveContent = value
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutActiveContent)
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

export function approvedHttpsUrl(
  value: unknown,
  allowedHosts: readonly string[],
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.includes(host)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeCoupon(
  value: unknown,
  allowedImageHosts: readonly string[],
): BondaCouponDetail {
  const raw = asRecord(value);
  const id = stringField(raw, "id");
  const name = htmlToSafeText(raw.nombre, 160);
  if (!id || !name) throw invalidResponse("Bonda coupon identity is invalid");
  const categories = Array.isArray(raw.categorias) ? raw.categorias : [];
  const firstCategory = categories.length > 0 ? asOptionalRecord(categories[0]) : null;
  const channelRecord = asOptionalRecord(raw.usar_en);
  const imageRecord = asOptionalRecord(raw.foto_principal);
  const thumbnailRecord = asOptionalRecord(raw.foto_thumbnail);
  const bannerRecord = asOptionalRecord(raw.foto_apaisada);
  const companyRecord = asOptionalRecord(raw.empresa);
  const heroImageUrl = approvedHttpsUrl(imageRecord?.original, allowedImageHosts)
    ?? approvedHttpsUrl(imageRecord?.["280x190"], allowedImageHosts);
  const logoImageUrl = approvedHttpsUrl(thumbnailRecord?.original, allowedImageHosts)
    ?? approvedHttpsUrl(thumbnailRecord?.["90x90"], allowedImageHosts);
  const bannerImageUrl = approvedHttpsUrl(bannerRecord?.original, allowedImageHosts)
    ?? approvedHttpsUrl(bannerRecord?.["240x80"], allowedImageHosts);

  return {
    id,
    name,
    discount: optionalSafeText(raw.descuento, 120),
    shortDescription: htmlToSafeText(raw.descripcion_breve, 1_000),
    description: htmlToSafeText(raw.descripcion_micrositio, MAX_TEXT_LENGTH),
    usageInstructions: htmlToSafeText(raw.usage_instructions, MAX_TEXT_LENGTH),
    legalTerms: htmlToSafeText(raw.legales, MAX_TEXT_LENGTH),
    brandDescription: htmlToSafeText(companyRecord?.descripcion, MAX_TEXT_LENGTH),
    branches: [],
    expirationAt: normalizePartnerDate(raw.fecha_vencimiento),
    imageUrl: heroImageUrl ?? logoImageUrl,
    heroImageUrl,
    logoImageUrl,
    bannerImageUrl,
    category: firstCategory ? optionalSafeText(firstCategory.nombre, 120) : null,
    channels: normalizeChannels(channelRecord),
    minimumLevel: "BRONZE",
    displayOrder: 0,
  };
}

export function normalizeCouponBranch(value: unknown): BondaCouponBranch {
  const raw = asRecord(value);
  const locality = asOptionalRecord(raw.localidad ?? raw.ciudad);
  const province = asOptionalRecord(raw.provincia ?? raw.estado);
  const coordinateSource = raw.coordenadas ?? raw.coordinates ?? raw.ubicacion ?? raw.location;
  const coordinateRecord = asOptionalRecord(coordinateSource);
  const coordinatePair = Array.isArray(coordinateSource) ? coordinateSource : [];
  const latitude = optionalCoordinate(
    raw.latitud ?? raw.latitude ?? raw.lat ?? raw.geo_lat
      ?? coordinateRecord?.latitud ?? coordinateRecord?.latitude ?? coordinateRecord?.lat
      ?? coordinatePair[1],
    -90,
    90,
  );
  const longitude = optionalCoordinate(
    raw.longitud ?? raw.longitude ?? raw.lng ?? raw.lon ?? raw.geo_lng ?? raw.geo_lon
      ?? coordinateRecord?.longitud ?? coordinateRecord?.longitude ?? coordinateRecord?.lng
      ?? coordinateRecord?.lon ?? coordinatePair[0],
    -180,
    180,
  );
  const hasCoordinatePair = latitude !== null && longitude !== null;
  const id = optionalString(raw.id ?? raw.sucursal_id)
    ?? [raw.nombre, raw.direccion].map((part) => optionalString(part)).filter(Boolean).join(":");
  if (!id) throw invalidResponse("Bonda branch identity is invalid");
  return {
    id,
    name: optionalSafeText(raw.nombre ?? raw.name, 160) ?? "Sucursal",
    address: optionalSafeText(raw.direccion ?? raw.address, 500) ?? "",
    city: optionalSafeText(locality?.nombre ?? raw.localidad ?? raw.ciudad, 160),
    state: optionalSafeText(province?.nombre ?? raw.provincia ?? raw.estado, 160),
    latitude: hasCoordinatePair ? latitude : null,
    longitude: hasCoordinatePair ? longitude : null,
  };
}

export function normalizeReceivedCoupon(value: unknown): BondaReceivedCoupon {
  const raw = asRecord(value);
  const delivery = asOptionalRecord(raw.envio);
  const receiptId = optionalString(delivery?.codigo_id ?? delivery?.sms_id) ?? stringField(raw, "id");
  if (!receiptId) throw invalidResponse("Bonda received coupon identity is invalid");
  return {
    receiptId,
    couponId: optionalString(raw.cupon_id ?? raw.coupon_id ?? raw.id),
    name: optionalSafeText(raw.nombre ?? raw.name, 160) ?? "Cupón",
    code: optionalSafeText(delivery?.codigo ?? raw.codigo ?? raw.code, 1_000),
    requestedAt: normalizePartnerDate(
      delivery?.fecha ?? raw.fecha ?? raw.requested_at ?? raw.created_at,
    ),
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse("Bonda returned an invalid object");
  }
  return value as Record<string, unknown>;
}

export function optionalString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  return optionalString(record[key]) ?? "";
}

function optionalSafeText(value: unknown, maximum: number): string | null {
  const normalized = htmlToSafeText(value, maximum);
  return normalized || null;
}

function optionalCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(",", "."))
      : Number.NaN;
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum ? numeric : null;
}

function normalizePartnerDate(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeChannels(
  value: Record<string, unknown> | null,
): readonly BondaCouponChannel[] {
  if (!value) return [];
  const mapping: ReadonlyArray<[string, BondaCouponChannel]> = [
    ["online", "ONLINE"],
    ["onsite", "ONSITE"],
    ["email", "EMAIL"],
    ["phone", "PHONE"],
    ["whatsapp", "WHATSAPP"],
  ];
  return mapping.filter(([key]) => value[key] === true).map(([, channel]) => channel);
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  };
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith("#x")) {
      return validCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith("#")) {
      return validCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function validCodePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "";
}

function invalidResponse(message: string): BondaGatewayError {
  return new BondaGatewayError("INVALID_RESPONSE", message, false);
}
