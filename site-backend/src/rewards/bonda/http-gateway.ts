import type { BondaConfig } from "../../config.js";
import type { BondaCouponBranch, BondaCouponDetail, BondaReceivedCoupon } from "./contracts.js";
import {
  BondaGatewayError,
  type BondaAffiliateResult,
  type BondaCouponCodeResult,
  type BondaGateway,
} from "./gateway.js";
import {
  asRecord,
  htmlToSafeText,
  normalizeCoupon,
  normalizeCouponBranch,
  normalizeReceivedCoupon,
  optionalString,
} from "./normalization.js";

type FetchImplementation = typeof fetch;

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_PAGES = 100;

export class BondaHttpGateway implements BondaGateway {
  constructor(
    private readonly config: BondaConfig,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async createAffiliate(rewardsId: string): Promise<BondaAffiliateResult> {
    const { micrositeId, token } = this.requireAffiliateConfiguration();
    const payload = await this.requestJson(
      "POST",
      `/api/v2/microsite/${encodeURIComponent(micrositeId)}/affiliates`,
      {
        headers: { "content-type": "application/json", token },
        body: JSON.stringify({ code: requireIdentifier(rewardsId), send_welcome_email: false }),
      },
    );
    const root = asRecord(payload);
    if (root.success === true) {
      const data = optionalRecord(root.data);
      const member = optionalRecord(data?.member);
      return { state: "ACTIVE", externalMemberId: optionalString(member?.id) };
    }
    if (isAlreadyUsed(root)) {
      return { state: "ALREADY_EXISTS", externalMemberId: null };
    }
    throw classifyPartnerPayload(root);
  }

  async affiliateExists(rewardsId: string): Promise<boolean> {
    const { micrositeId, token } = this.requireAffiliateConfiguration();
    try {
      const payload = await this.requestJson(
        "GET",
        `/api/v2/microsite/${encodeURIComponent(micrositeId)}/affiliates/${encodeURIComponent(requireIdentifier(rewardsId))}`,
        { headers: { token } },
      );
      const root = asRecord(payload);
      return root.success === true || optionalRecord(root.data) !== null;
    } catch (error) {
      if (error instanceof BondaGatewayError && error.code === "COUPON_UNAVAILABLE") return false;
      throw error;
    }
  }

  async listCoupons(affiliateCode: string): Promise<readonly BondaCouponDetail[]> {
    const { micrositeId, key } = this.requireCouponConfiguration("catalog");
    const results: BondaCouponDetail[] = [];
    for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
      const query = couponQuery(key, micrositeId, affiliateCode);
      query.set("subcategories", "true");
      query.set("with_locations", "false");
      query.set("orderBy", "relevant");
      query.set("page", String(page));
      const root = asRecord(await this.requestJson("GET", `/api/cupones?${query.toString()}`));
      throwIfPartnerError(root);
      const pageItems = arrayField(root, "results");
      results.push(...pageItems.map((item) => normalizeCoupon(item, this.config.allowedImageHosts)));
      if (!optionalString(root.next)) return results;
    }
    throw new BondaGatewayError(
      "INVALID_RESPONSE",
      "Bonda catalog exceeded the supported page limit",
      false,
    );
  }

  async getCoupon(
    affiliateCode: string,
    couponId: string,
  ): Promise<BondaCouponDetail | null> {
    const { micrositeId, key } = this.requireCouponConfiguration("catalog");
    const query = couponQuery(key, micrositeId, affiliateCode);
    query.set("subcategories", "true");
    try {
      const root = asRecord(await this.requestJson(
        "GET",
        `/api/cupones/${encodeURIComponent(requireIdentifier(couponId))}?${query.toString()}`,
      ));
      throwIfPartnerError(root);
      return normalizeCoupon(root, this.config.allowedImageHosts);
    } catch (error) {
      if (error instanceof BondaGatewayError && error.code === "COUPON_UNAVAILABLE") return null;
      throw error;
    }
  }

  async listCouponBranches(
    affiliateCode: string,
    couponId: string,
  ): Promise<readonly BondaCouponBranch[]> {
    const { micrositeId, key } = this.requireCouponConfiguration("catalog");
    const query = couponQuery(key, micrositeId, affiliateCode);
    try {
      const payload = await this.requestJson(
        "GET",
        `/api/cupones/${encodeURIComponent(requireIdentifier(couponId))}/sucursales?${query.toString()}`,
      );
      if (Array.isArray(payload)) return payload.map(normalizeCouponBranch);
      const root = asRecord(payload);
      throwIfPartnerError(root);
      const items = Array.isArray(root.results)
        ? root.results
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(root.sucursales) ? root.sucursales : [];
      return items.map(normalizeCouponBranch);
    } catch (error) {
      if (error instanceof BondaGatewayError && error.code === "COUPON_UNAVAILABLE") return [];
      throw error;
    }
  }

  async requestCouponCode(
    affiliateCode: string,
    couponId: string,
    externalId: string,
  ): Promise<BondaCouponCodeResult> {
    const { micrositeId, key } = this.requireCouponConfiguration("request");
    const body = new FormData();
    body.set("key", key);
    body.set("micrositio_id", micrositeId);
    body.set("codigo_afiliado", requireIdentifier(affiliateCode));
    body.set("external_id", requireIdentifier(externalId));
    body.set("split", "1");
    let payload: unknown;
    try {
      payload = await this.requestJson(
        "POST",
        `/api/cupones/${encodeURIComponent(requireIdentifier(couponId))}/codigo`,
        { body },
        true,
      );
    } catch (error) {
      if (error instanceof BondaGatewayError && error.code === "PARTNER_UNAVAILABLE") {
        throw new BondaGatewayError(
          "AMBIGUOUS_CODE_REQUEST",
          "Bonda coupon request requires verification",
          false,
        );
      }
      throw error;
    }
    const root = asRecord(payload);
    throwIfPartnerError(root);
    if (typeof root.success === "string") {
      return { code: null, instructions: htmlToSafeText(root.success), receiptId: null };
    }
    const success = optionalRecord(root.success);
    if (!success) throw invalidResponse("Bonda coupon result is invalid");
    return {
      code: optionalString(success.codigo),
      instructions: htmlToSafeText(success.instrucciones ?? success.texto_sms),
      receiptId: optionalString(success.id),
    };
  }

  async listReceivedCoupons(affiliateCode: string): Promise<readonly BondaReceivedCoupon[]> {
    const { micrositeId, key } = this.requireCouponConfiguration("catalog");
    const query = couponQuery(key, micrositeId, affiliateCode);
    const payload = await this.requestJson("GET", `/api/cupones_recibidos?${query.toString()}`);
    const rootOrArray = payload;
    if (Array.isArray(rootOrArray)) return rootOrArray.map(normalizeReceivedCoupon);
    const root = asRecord(rootOrArray);
    throwIfPartnerError(root);
    const items = Array.isArray(root.results)
      ? root.results
      : Array.isArray(root.data) ? root.data : [];
    return items.map(normalizeReceivedCoupon);
  }

  private requireAffiliateConfiguration(): { micrositeId: string; token: string } {
    if (!this.config.affiliateProvisioningEnabled) throw featureDisabled();
    if (!this.config.micrositeId || !this.config.affiliateToken) throw featureDisabled();
    return { micrositeId: this.config.micrositeId, token: this.config.affiliateToken };
  }

  private requireCouponConfiguration(
    capability: "catalog" | "request",
  ): { micrositeId: string; key: string } {
    const enabled = capability === "catalog"
      ? this.config.catalogEnabled
      : this.config.couponRequestsEnabled;
    if (!enabled || !this.config.micrositeId || !this.config.couponApiKey) {
      throw featureDisabled();
    }
    return { micrositeId: this.config.micrositeId, key: this.config.couponApiKey };
  }

  private async requestJson(
    method: "GET" | "POST",
    path: string,
    init: Omit<RequestInit, "method" | "signal"> = {},
    dispatchedMutation = false,
  ): Promise<unknown> {
    const url = new URL(path, `${this.config.baseUrl}/`);
    if (!this.config.allowedHosts.includes(url.hostname.toLowerCase())) {
      throw new BondaGatewayError("FEATURE_DISABLED", "Bonda host is not allowed", false);
    }
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        ...init,
        method,
        headers: { accept: "application/json", ...headersRecord(init.headers) },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch {
      throw new BondaGatewayError(
        dispatchedMutation ? "PARTNER_UNAVAILABLE" : "PARTNER_UNAVAILABLE",
        "Bonda is temporarily unavailable",
        !dispatchedMutation,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new BondaGatewayError("UNAUTHORIZED", "Bonda credentials were rejected", false);
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new BondaGatewayError("COUPON_UNAVAILABLE", "Bonda resource was not found", false);
      }
      if (response.status === 400) {
        const errorPayload = await readBoundedJson(response);
        const errorRoot = asRecord(errorPayload);
        if ("error" in errorRoot) throw classifyPartnerPayload(errorRoot);
      }
      throw new BondaGatewayError(
        "PARTNER_UNAVAILABLE",
        "Bonda is temporarily unavailable",
        response.status >= 500 || response.status === 429,
      );
    }
    return readBoundedJson(response);
  }
}

function couponQuery(key: string, micrositeId: string, affiliateCode: string): URLSearchParams {
  return new URLSearchParams({
    key,
    micrositio_id: micrositeId,
    codigo_afiliado: requireIdentifier(affiliateCode),
  });
}

function throwIfPartnerError(root: Record<string, unknown>): void {
  if (!("error" in root) || root.error === null || root.error === false) return;
  throw classifyPartnerPayload(root);
}

function classifyPartnerPayload(root: Record<string, unknown>): BondaGatewayError {
  const serialized = JSON.stringify(root.error ?? root).toLowerCase();
  if (serialized.includes("restricted") || serialized.includes("límite") || serialized.includes("limite")) {
    return new BondaGatewayError("COUPON_LIMIT_REACHED", "Coupon limit was reached", false);
  }
  if (serialized.includes("pines agotados") || serialized.includes("stock")) {
    return new BondaGatewayError(
      "COUPON_INVENTORY_UNAVAILABLE",
      "Coupon inventory is unavailable",
      false,
    );
  }
  if (
    serialized.includes("token")
    || serialized.includes("unauthorized")
    || serialized.includes("authorizationexception")
  ) {
    return new BondaGatewayError("UNAUTHORIZED", "Bonda credentials were rejected", false);
  }
  return new BondaGatewayError("COUPON_UNAVAILABLE", "Coupon is unavailable", false);
}

function isAlreadyUsed(root: Record<string, unknown>): boolean {
  const error = JSON.stringify(root.error ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return error.includes("code ya esta en uso") || error.includes("code is already in use");
}

function arrayField(root: Record<string, unknown>, key: string): readonly unknown[] {
  const value = root[key];
  if (!Array.isArray(value)) throw invalidResponse(`Bonda ${key} must be an array`);
  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error("Bonda identifier is invalid");
  }
  return normalized;
}

function headersRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  const result: Record<string, string> = {};
  new Headers(value).forEach((headerValue, key) => {
    result[key] = headerValue;
  });
  return result;
}

function featureDisabled(): BondaGatewayError {
  return new BondaGatewayError("FEATURE_DISABLED", "Bonda feature is disabled", false);
}

function invalidResponse(message: string): BondaGatewayError {
  return new BondaGatewayError("INVALID_RESPONSE", message, false);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) throw invalidResponse("Bonda response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw invalidResponse("Bonda response is too large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse("Bonda returned invalid JSON");
  }
}
