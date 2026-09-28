import type { QueryResult, QueryResultRow } from "pg";

import { readBondaCouponPolicy } from "../catalog/domain.js";
import type { Clock } from "../shared/clock.js";
import type { CatalogItemId } from "../shared/identifiers.js";
import type { BondaCouponDetail } from "./contracts.js";
import type { BondaGateway } from "./gateway.js";

export interface BondaCatalogPolicyCandidate {
  catalogItemId: CatalogItemId;
  code: string;
  name: string;
  description: string;
  bondaCouponId: string | null;
  enabled: boolean;
  minimumLevel: string;
  displayOrder: number;
}

export interface BondaCatalogReconciliationSource {
  list(at: Date): Promise<readonly BondaCatalogPolicyCandidate[]>;
}

export interface BondaCatalogReconciliationItem {
  catalog_item_id: string;
  candidate_name: string;
  minimum_level: string;
  display_order: number;
  state: "PROPOSED_MATCH" | "MISSING" | "DUPLICATE_NAME" | "CONTENT_CHANGED" | "EXPIRED" | "CURRENT";
  proposed_bonda_coupon_ids: readonly string[];
}

export interface BondaCatalogReconciliationReport {
  generated_at: string;
  totals: Readonly<Record<BondaCatalogReconciliationItem["state"], number>>;
  items: readonly BondaCatalogReconciliationItem[];
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface CandidateRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  description: string;
  partner_item_reference: string | null;
  enabled: boolean;
  eligibility_rule: Readonly<Record<string, unknown>>;
}

export class PostgresBondaCatalogReconciliationSource
implements BondaCatalogReconciliationSource {
  constructor(private readonly database: Queryable) {}

  async list(at: Date): Promise<readonly BondaCatalogPolicyCandidate[]> {
    const rows = (await this.database.query<CandidateRow>(`
      SELECT DISTINCT ON (code)
        id::text, code, name, description, partner_item_reference, enabled, eligibility_rule
      FROM catalog_items
      WHERE partner_dependency = 'BONDA'
        AND effective_from <= $1
        AND (effective_to IS NULL OR effective_to > $1)
      ORDER BY code, version DESC
    `, [at])).rows;
    return rows.map((row) => {
      const policy = readBondaCouponPolicy(row.eligibility_rule);
      return {
        catalogItemId: row.id as CatalogItemId,
        code: row.code,
        name: row.name,
        description: row.description,
        bondaCouponId: row.partner_item_reference,
        enabled: row.enabled,
        minimumLevel: policy.minimumLevel,
        displayOrder: policy.displayOrder,
      };
    });
  }
}

export class ReconcileBondaCatalog {
  constructor(
    private readonly source: BondaCatalogReconciliationSource,
    private readonly gateway: BondaGateway,
    private readonly clock: Clock,
  ) {}

  async run(affiliateCode: string): Promise<BondaCatalogReconciliationReport> {
    const at = this.clock.now();
    const [candidates, live] = await Promise.all([
      this.source.list(at),
      this.gateway.listCoupons(affiliateCode),
    ]);
    const byId = new Map(live.map((coupon) => [coupon.id, coupon]));
    const byName = groupByNormalizedName(live);
    const items = candidates.map((candidate): BondaCatalogReconciliationItem => {
      if (candidate.bondaCouponId) {
        const coupon = byId.get(candidate.bondaCouponId);
        if (!coupon) return reportItem(candidate, "MISSING", []);
        if (isExpired(coupon, at)) return reportItem(candidate, "EXPIRED", [coupon.id]);
        if (normalizeName(coupon.name) !== normalizeName(candidate.name)) {
          return reportItem(candidate, "CONTENT_CHANGED", [coupon.id]);
        }
        return reportItem(candidate, "CURRENT", [coupon.id]);
      }
      const matches = byName.get(normalizeName(candidate.name)) ?? [];
      if (matches.length === 0) return reportItem(candidate, "MISSING", []);
      if (matches.length > 1) {
        return reportItem(candidate, "DUPLICATE_NAME", matches.map((coupon) => coupon.id));
      }
      if (isExpired(matches[0]!, at)) return reportItem(candidate, "EXPIRED", [matches[0]!.id]);
      return reportItem(candidate, "PROPOSED_MATCH", [matches[0]!.id]);
    });
    return {
      generated_at: at.toISOString(),
      totals: countStates(items),
      items,
    };
  }
}

function reportItem(
  candidate: BondaCatalogPolicyCandidate,
  state: BondaCatalogReconciliationItem["state"],
  proposedIds: readonly string[],
): BondaCatalogReconciliationItem {
  return {
    catalog_item_id: candidate.catalogItemId,
    candidate_name: candidate.name,
    minimum_level: candidate.minimumLevel,
    display_order: candidate.displayOrder,
    state,
    proposed_bonda_coupon_ids: proposedIds,
  };
}

function groupByNormalizedName(
  coupons: readonly BondaCouponDetail[],
): ReadonlyMap<string, readonly BondaCouponDetail[]> {
  const result = new Map<string, BondaCouponDetail[]>();
  for (const coupon of coupons) {
    const key = normalizeName(coupon.name);
    result.set(key, [...(result.get(key) ?? []), coupon]);
  }
  return result;
}

function normalizeName(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isExpired(coupon: BondaCouponDetail, at: Date): boolean {
  return coupon.expirationAt !== null && new Date(coupon.expirationAt) <= at;
}

function countStates(
  items: readonly BondaCatalogReconciliationItem[],
): Readonly<Record<BondaCatalogReconciliationItem["state"], number>> {
  const totals: Record<BondaCatalogReconciliationItem["state"], number> = {
    PROPOSED_MATCH: 0,
    MISSING: 0,
    DUPLICATE_NAME: 0,
    CONTENT_CHANGED: 0,
    EXPIRED: 0,
    CURRENT: 0,
  };
  for (const item of items) totals[item.state] += 1;
  return totals;
}
