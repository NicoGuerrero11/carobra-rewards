import { randomUUID } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";

import { hasCumulativeBondaCouponAccess, readBondaCouponPolicy } from "../catalog/domain.js";
import type { Clock } from "../shared/clock.js";
import type { RewardsJourneyState, RewardsLevel } from "../shared/enums.js";
import type { CatalogItemId, CustomerId } from "../shared/identifiers.js";
import type { RewardsV2RuleLookupPort } from "../v2/configuration.js";
import type {
  BondaAffiliateIntegrationState,
  BondaCouponCatalogHttpResponse,
  BondaCouponBranchesHttpResponse,
  BondaCouponCodeHttpResponse,
  BondaCouponCodeStatus,
  BondaCouponDetail,
  BondaCouponDetailHttpResponse,
  BondaReceivedCouponsHttpResponse,
} from "./contracts.js";
import { assertBondaCouponCatalogContract, assertBondaCouponDetailContract } from "./contracts.js";
import type { BondaCatalogReader } from "./catalog-cache.js";
import { BondaGatewayError, type BondaGateway } from "./gateway.js";
import type {
  BondaCouponRequestRecord,
  BondaCouponRequestStore,
} from "./persistence.js";

export interface BondaCouponCustomerIdentity {
  customerId: CustomerId;
  rewardsId: string;
}

export interface BondaAffiliateProvisioningPort {
  ensureForBenefits(identity: BondaCouponCustomerIdentity): Promise<{
    state: BondaAffiliateIntegrationState;
    can_request_codes: boolean;
    retry_scheduled: boolean;
  }>;
}

export interface BondaCouponJourney {
  state: RewardsJourneyState;
  currentLevel: RewardsLevel | null;
}

export interface BondaCouponJourneyQuery {
  get(customerId: CustomerId): Promise<BondaCouponJourney | null>;
}

export interface BondaCouponPolicyRecord {
  catalogItemId: CatalogItemId;
  bondaCouponId: string;
  minimumLevel: RewardsLevel;
  displayOrder: number;
}

export interface BondaCouponPolicyQuery {
  listEffective(at: Date): Promise<readonly BondaCouponPolicyRecord[]>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface PolicyRow extends QueryResultRow {
  id: string;
  partner_item_reference: string;
  eligibility_rule: Readonly<Record<string, unknown>>;
}

interface JourneyRow extends QueryResultRow {
  state: RewardsJourneyState;
  current_level: RewardsLevel | null;
}

export class PostgresBondaCouponPolicyQuery implements BondaCouponPolicyQuery {
  constructor(private readonly database: Queryable) {}

  async listEffective(at: Date): Promise<readonly BondaCouponPolicyRecord[]> {
    const rows = (await this.database.query<PolicyRow>(`
      SELECT DISTINCT ON (partner_item_reference)
        id::text, partner_item_reference, eligibility_rule
      FROM catalog_items
      WHERE partner_dependency = 'BONDA'
        AND partner_item_reference IS NOT NULL
        AND enabled = true
        AND effective_from <= $1
        AND (effective_to IS NULL OR effective_to > $1)
      ORDER BY partner_item_reference, version DESC
    `, [at])).rows;
    return rows.map((row) => {
      const policy = readBondaCouponPolicy(row.eligibility_rule);
      return {
        catalogItemId: row.id as CatalogItemId,
        bondaCouponId: row.partner_item_reference,
        minimumLevel: policy.minimumLevel,
        displayOrder: policy.displayOrder,
      };
    });
  }
}

export class PostgresBondaCouponJourneyQuery implements BondaCouponJourneyQuery {
  constructor(private readonly database: Queryable) {}

  async get(customerId: CustomerId): Promise<BondaCouponJourney | null> {
    const row = (await this.database.query<JourneyRow>(`
      SELECT state, current_level
      FROM rewards_v2_journeys
      WHERE customer_id = $1
      LIMIT 1
    `, [customerId])).rows[0];
    return row ? { state: row.state, currentLevel: row.current_level } : null;
  }
}

export class BondaCouponApplicationError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "coupon_feature_disabled"
      | "coupon_access_denied"
      | "affiliate_pending"
      | "coupon_unavailable"
      | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "BondaCouponApplicationError";
  }
}

export interface BondaCouponHttpApplication {
  getCatalog(identity: BondaCouponCustomerIdentity, page?: number, pageSize?: number, previewOnly?: boolean): Promise<BondaCouponCatalogHttpResponse>;
  getDetail(identity: BondaCouponCustomerIdentity, couponId: string): Promise<BondaCouponDetailHttpResponse>;
  getBranches(identity: BondaCouponCustomerIdentity, couponId: string): Promise<BondaCouponBranchesHttpResponse>;
  requestCode(identity: BondaCouponCustomerIdentity, couponId: string, requestId?: string): Promise<BondaCouponCodeHttpResponse>;
  getHistory(identity: BondaCouponCustomerIdentity): Promise<BondaReceivedCouponsHttpResponse>;
}

export class BondaCouponApplication implements BondaCouponHttpApplication {
  constructor(
    private readonly gateway: BondaGateway,
    private readonly policies: BondaCouponPolicyQuery,
    private readonly journeys: BondaCouponJourneyQuery,
    private readonly affiliateProvisioning: BondaAffiliateProvisioningPort,
    private readonly requests: BondaCouponRequestStore,
    private readonly rules: RewardsV2RuleLookupPort,
    private readonly clock: Clock,
    private readonly generateRequestId: () => string = randomUUID,
    private readonly catalogReader?: BondaCatalogReader,
    private readonly catalogAffiliateCode?: string,
  ) {}

  async getCatalog(
    identity: BondaCouponCustomerIdentity,
    page = 1,
    pageSize = 20,
    previewOnly = false,
  ): Promise<BondaCouponCatalogHttpResponse> {
    validatePage(page, pageSize);
    const context = await this.readContext(identity, previewOnly);
    if (context.accessState !== "AVAILABLE") {
      return assertBondaCouponCatalogContract({
        current_level: context.journey?.currentLevel ?? null,
        access_state: context.accessState,
        affiliate_state: context.affiliateState,
        items: [],
        refreshed_at: null,
        page,
        page_size: pageSize,
        total: 0,
        next_page: null,
      });
    }
    try {
      const catalogAffiliateCode = this.catalogIdentity(identity);
      const snapshot = this.catalogReader
        ? await this.catalogReader.read(catalogAffiliateCode, context.policies.map((policy) => policy.bondaCouponId))
        : { items: await this.gateway.listCoupons(catalogAffiliateCode), refreshedAt: this.clock.now() };
      const items = applyPolicies(snapshot.items, context.policies, context.journey!.currentLevel!, this.clock.now());
      const offset = (page - 1) * pageSize;
      return assertBondaCouponCatalogContract({
        current_level: context.journey!.currentLevel,
        access_state: "AVAILABLE",
        affiliate_state: context.affiliateState,
        items: items.slice(offset, offset + pageSize),
        refreshed_at: snapshot.refreshedAt.toISOString(),
        page,
        page_size: pageSize,
        total: items.length,
        next_page: offset + pageSize < items.length ? page + 1 : null,
      });
    } catch (error) {
      if (!(error instanceof BondaGatewayError)) throw error;
      return assertBondaCouponCatalogContract({
        current_level: context.journey!.currentLevel,
        access_state: error.code === "FEATURE_DISABLED" ? "FEATURE_DISABLED" : "PARTNER_UNAVAILABLE",
        affiliate_state: context.affiliateState,
        items: [],
        refreshed_at: null,
        page,
        page_size: pageSize,
        total: 0,
        next_page: null,
      });
    }
  }

  async getDetail(
    identity: BondaCouponCustomerIdentity,
    couponId: string,
  ): Promise<BondaCouponDetailHttpResponse> {
    const context = await this.requireAvailableContext(identity);
    const policy = eligiblePolicy(context.policies, couponId, context.journey.currentLevel!);
    if (!policy) return detailUnavailable(context.affiliateState);
    try {
      const catalogAffiliateCode = this.catalogIdentity(identity);
      const snapshot = this.catalogReader
        ? await this.catalogReader.read(catalogAffiliateCode, context.policies.map((candidate) => candidate.bondaCouponId))
        : null;
      const live = snapshot
        ? snapshot.items.find((candidate) => candidate.id === couponId) ?? null
        : await this.gateway.getCoupon(catalogAffiliateCode, couponId);
      if (!live || isExpired(live, this.clock.now())) return detailUnavailable(context.affiliateState);
      return assertBondaCouponDetailContract({
        access_state: "AVAILABLE",
        affiliate_state: context.affiliateState,
        item: applyPolicy({ ...live, branches: [] }, policy),
      });
    } catch (error) {
      if (error instanceof BondaGatewayError) {
        return {
          access_state: "PARTNER_UNAVAILABLE",
          affiliate_state: context.affiliateState,
          item: null,
        };
      }
      throw error;
    }
  }

  async getBranches(
    identity: BondaCouponCustomerIdentity,
    couponId: string,
  ): Promise<BondaCouponBranchesHttpResponse> {
    const context = await this.requireAvailableContext(identity);
    const policy = eligiblePolicy(context.policies, couponId, context.journey.currentLevel!);
    if (!policy) throw accessError("coupon_unavailable", "El beneficio no está disponible.", 404);
    try {
      const affiliateCode = this.catalogIdentity(identity);
      const items = this.catalogReader
        ? await this.catalogReader.readBranches(affiliateCode, couponId)
        : await this.gateway.listCouponBranches(affiliateCode, couponId);
      return { items };
    } catch (error) {
      if (error instanceof BondaGatewayError) return { items: [] };
      throw error;
    }
  }

  async requestCode(
    identity: BondaCouponCustomerIdentity,
    couponId: string,
    requestId = this.generateRequestId(),
  ): Promise<BondaCouponCodeHttpResponse> {
    const context = await this.requireAvailableContext(identity);
    if (context.affiliateState !== "ACTIVE") {
      throw accessError("affiliate_pending", "Estamos activando tus beneficios.", 409);
    }
    const policy = eligiblePolicy(context.policies, couponId, context.journey.currentLevel!);
    if (!policy) throw accessError("coupon_unavailable", "El beneficio no está disponible.", 404);
    const started = await this.requests.begin({
      customerId: identity.customerId,
      catalogItemId: policy.catalogItemId,
      bondaCouponId: couponId,
      externalId: requestId,
      requestedAt: this.clock.now(),
    });
    if (started.replayed) return replayResponse(started.request);

    try {
      const live = await this.gateway.getCoupon(this.catalogIdentity(identity), couponId);
      if (!live || isExpired(live, this.clock.now())) {
        throw new BondaGatewayError("COUPON_UNAVAILABLE", "Coupon is unavailable", false);
      }
      const result = await this.gateway.requestCouponCode(identity.rewardsId, couponId, requestId);
      await this.requests.resolve(
        started.request.id,
        "ISSUED",
        result.receiptId,
        { instructionAvailable: Boolean(result.instructions), codeReturned: Boolean(result.code) },
        this.clock.now(),
      );
      return {
        request_id: requestId,
        status: "ISSUED",
        code: result.code,
        instructions: result.instructions,
        receipt_id: result.receiptId,
      };
    } catch (error) {
      const status = codeFailureStatus(error);
      await this.requests.resolve(
        started.request.id,
        status,
        null,
        { safeError: safeStatusCode(status) },
        this.clock.now(),
      );
      return {
        request_id: requestId,
        status,
        code: null,
        instructions: customerInstruction(status),
        receipt_id: null,
      };
    }
  }

  async getHistory(
    identity: BondaCouponCustomerIdentity,
  ): Promise<BondaReceivedCouponsHttpResponse> {
    const context = await this.requireAvailableContext(identity);
    if (context.affiliateState !== "ACTIVE") {
      throw accessError("affiliate_pending", "Estamos activando tus beneficios.", 409);
    }
    const items = await this.gateway.listReceivedCoupons(identity.rewardsId);
    await this.reconcileVerificationRequired(identity.customerId, items);
    const allowedIds = new Set(context.policies
      .filter((policy) => hasCumulativeBondaCouponAccess(
        context.journey.currentLevel!,
        policy.minimumLevel,
      ))
      .map((policy) => policy.bondaCouponId));
    return { items: items.filter((item) => item.couponId !== null && allowedIds.has(item.couponId)) };
  }

  private async reconcileVerificationRequired(
    customerId: CustomerId,
    history: BondaReceivedCouponsHttpResponse["items"],
  ): Promise<void> {
    const pending = await this.requests.listVerificationRequiredForCustomer(customerId, 25);
    for (const request of pending) {
      const matches = history.filter((item) => item.couponId === request.bondaCouponId
        && item.requestedAt !== null
        && new Date(item.requestedAt).getTime() >= request.requestedAt.getTime() - 120_000);
      if (matches.length !== 1) continue;
      await this.requests.resolve(
        request.id,
        "ISSUED",
        matches[0]!.receiptId,
        { reconciledFromHistory: true },
        this.clock.now(),
      );
    }
  }

  private async requireAvailableContext(identity: BondaCouponCustomerIdentity): Promise<AvailableContext> {
    const context = await this.readContext(identity);
    if (context.accessState === "FEATURE_DISABLED") {
      throw accessError("coupon_feature_disabled", "Los beneficios aún no están disponibles.", 503);
    }
    if (context.accessState === "AFFILIATE_PENDING") {
      throw accessError("affiliate_pending", "Estamos activando tus beneficios.", 409);
    }
    const currentLevel = context.journey?.currentLevel;
    if (context.accessState !== "AVAILABLE" || !context.journey || !currentLevel) {
      throw accessError("coupon_access_denied", "Tu cuenta no tiene acceso a este beneficio.", 403);
    }
    return {
      journey: { ...context.journey, currentLevel },
      policies: context.policies,
      affiliateState: context.affiliateState,
    };
  }

  private async readContext(identity: BondaCouponCustomerIdentity, previewOnly = false): Promise<{
    journey: BondaCouponJourney | null;
    policies: readonly BondaCouponPolicyRecord[];
    affiliateState: BondaAffiliateIntegrationState;
    accessState: BondaCouponCatalogHttpResponse["access_state"];
  }> {
    const now = this.clock.now();
    const [journey, feature] = await Promise.all([
      this.journeys.get(identity.customerId),
      this.rules.findEffective("V2_BONDA_COUPONS", now),
    ]);
    if (!feature?.enabled || !feature.approvedForProduction) {
      return { journey, policies: [], affiliateState: "DISABLED", accessState: "FEATURE_DISABLED" };
    }
    if (!journey || journey.state === "INACTIVE" || journey.state === "BLOCKED") {
      return { journey, policies: [], affiliateState: "DISABLED", accessState: "ACCOUNT_UNAVAILABLE" };
    }
    if (journey.state === "INVITED" || !journey.currentLevel) {
      return { journey, policies: [], affiliateState: "DISABLED", accessState: "NO_LEVEL" };
    }
    // Inicio is discovery only: never provision a customer affiliate on a home visit.
    if (previewOnly) {
      if (!this.catalogAffiliateCode) return { journey, policies: [], affiliateState: "DISABLED", accessState: "AFFILIATE_PENDING" };
      return { journey, policies: await this.policies.listEffective(now), affiliateState: "DISABLED", accessState: "AVAILABLE" };
    }
    const [affiliate, policies] = await Promise.all([
      this.affiliateProvisioning.ensureForBenefits(identity),
      this.policies.listEffective(now),
    ]);
    if (affiliate.state !== "ACTIVE" && !this.catalogAffiliateCode) {
      return { journey, policies, affiliateState: affiliate.state, accessState: "AFFILIATE_PENDING" };
    }
    return { journey, policies, affiliateState: affiliate.state, accessState: "AVAILABLE" };
  }

  private catalogIdentity(identity: BondaCouponCustomerIdentity): string {
    return this.catalogAffiliateCode ?? identity.rewardsId;
  }
}

interface AvailableContext {
  journey: BondaCouponJourney & { currentLevel: RewardsLevel };
  policies: readonly BondaCouponPolicyRecord[];
  affiliateState: BondaAffiliateIntegrationState;
}

function applyPolicies(
  live: readonly BondaCouponDetail[],
  policies: readonly BondaCouponPolicyRecord[],
  level: RewardsLevel,
  at: Date,
): BondaCouponDetail[] {
  const byId = new Map(live.map((item) => [item.id, item]));
  return policies
    .filter((policy) => hasCumulativeBondaCouponAccess(level, policy.minimumLevel))
    .map((policy) => {
      const item = byId.get(policy.bondaCouponId);
      return item ? applyPolicy(item, policy) : null;
    })
    .filter((item): item is BondaCouponDetail => item !== null && !isExpired(item, at))
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

function applyPolicy(item: BondaCouponDetail, policy: BondaCouponPolicyRecord): BondaCouponDetail {
  return { ...item, minimumLevel: policy.minimumLevel, displayOrder: policy.displayOrder };
}

function eligiblePolicy(
  policies: readonly BondaCouponPolicyRecord[],
  couponId: string,
  level: RewardsLevel,
): BondaCouponPolicyRecord | null {
  return policies.find((policy) => policy.bondaCouponId === couponId
    && hasCumulativeBondaCouponAccess(level, policy.minimumLevel)) ?? null;
}

function isExpired(item: BondaCouponDetail, at: Date): boolean {
  return item.expirationAt !== null && new Date(item.expirationAt) <= at;
}

function detailUnavailable(affiliateState: BondaAffiliateIntegrationState): BondaCouponDetailHttpResponse {
  return { access_state: "COUPON_UNAVAILABLE", affiliate_state: affiliateState, item: null };
}

function codeFailureStatus(error: unknown): BondaCouponCodeStatus {
  if (!(error instanceof BondaGatewayError)) return "UNAVAILABLE";
  switch (error.code) {
    case "COUPON_LIMIT_REACHED": return "LIMIT_REACHED";
    case "COUPON_INVENTORY_UNAVAILABLE": return "INVENTORY_UNAVAILABLE";
    case "AMBIGUOUS_CODE_REQUEST": return "VERIFICATION_REQUIRED";
    default: return "UNAVAILABLE";
  }
}

function safeStatusCode(status: BondaCouponCodeStatus): string {
  return status.toLowerCase();
}

function customerInstruction(status: BondaCouponCodeStatus): string {
  switch (status) {
    case "LIMIT_REACHED": return "Ya alcanzaste el límite temporal de este beneficio.";
    case "INVENTORY_UNAVAILABLE": return "Este beneficio no tiene códigos disponibles por ahora.";
    case "VERIFICATION_REQUIRED": return "Estamos verificando si tu código fue generado.";
    default: return "No pudimos solicitar el beneficio. Intenta más tarde.";
  }
}

function replayResponse(request: BondaCouponRequestRecord): BondaCouponCodeHttpResponse {
  const status = request.status === "PENDING" ? "VERIFICATION_REQUIRED" : request.status;
  return {
    request_id: request.externalId,
    status,
    code: null,
    instructions: status === "ISSUED"
      ? "Este beneficio ya fue solicitado. Consulta tu historial para recuperar el código."
      : customerInstruction(status),
    receipt_id: request.bondaReceiptId,
  };
}

function validatePage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw accessError("invalid_request", "La paginación no es válida.", 400);
  }
}

function accessError(
  code: BondaCouponApplicationError["code"],
  message: string,
  status: number,
): BondaCouponApplicationError {
  return new BondaCouponApplicationError(status, code, message);
}
