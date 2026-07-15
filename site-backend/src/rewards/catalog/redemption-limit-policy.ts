import type { QueryResult, QueryResultRow } from "pg";

import type { InventoryMode, RedemptionLimitScope } from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CatalogItemId,
  RedemptionLimitPolicyVersionId,
} from "../shared/identifiers.js";

export const monthlyRedemptionPolicyCode = "CUSTOMER_MONTHLY_REDEMPTIONS" as const;

export interface EffectiveRedemptionLimitPolicy {
  id: RedemptionLimitPolicyVersionId;
  code: typeof monthlyRedemptionPolicyCode;
  version: number;
  enabled: boolean;
  scopeType: RedemptionLimitScope;
  scopeKey: string | null;
  monthlyLimit: number | null;
  businessTimezone: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
}

export interface EnabledRedemptionLimitPolicy extends EffectiveRedemptionLimitPolicy {
  enabled: true;
  monthlyLimit: number;
  businessTimezone: string;
  approvedBy: string;
  approvedAt: Date;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface PolicyRow extends QueryResultRow {
  id: string;
  code: typeof monthlyRedemptionPolicyCode;
  version: number;
  enabled: boolean;
  scope_type: RedemptionLimitScope;
  scope_key: string | null;
  monthly_limit: number | null;
  business_timezone: string | null;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  approved_by: string | null;
  approved_at: Date | null;
}

export async function findEffectiveRedemptionLimitPolicy(
  database: Queryable,
  context: {
    catalogItemId: CatalogItemId;
    inventoryMode: InventoryMode;
    effectiveAt: Date;
  },
  lock = false,
): Promise<EffectiveRedemptionLimitPolicy | null> {
  const row = (await database.query<PolicyRow>(`
    SELECT id::text, code, version, enabled, scope_type, scope_key,
      monthly_limit, business_timezone, effective_from, effective_to,
      disabled_reason, approved_by, approved_at
    FROM redemption_limit_policy_versions
    WHERE code = $1
      AND effective_from <= $2
      AND (effective_to IS NULL OR effective_to > $2)
      AND (
        scope_type = 'GLOBAL' OR
        (scope_type = 'CATALOG_ITEM' AND scope_key = $3) OR
        (scope_type = 'INVENTORY_MODE' AND scope_key = $4)
      )
    ORDER BY
      CASE scope_type
        WHEN 'CATALOG_ITEM' THEN 1
        WHEN 'INVENTORY_MODE' THEN 2
        ELSE 3
      END,
      version DESC,
      effective_from DESC
    LIMIT 1
    ${lock ? "FOR SHARE" : ""}
  `, [monthlyRedemptionPolicyCode, context.effectiveAt,
    context.catalogItemId, context.inventoryMode])).rows[0];
  return row ? mapPolicy(row) : null;
}

export function requireEnabledRedemptionLimitPolicy(
  policy: EffectiveRedemptionLimitPolicy | null,
): EnabledRedemptionLimitPolicy {
  if (!policy?.enabled
    || policy.monthlyLimit === null
    || !Number.isInteger(policy.monthlyLimit)
    || policy.monthlyLimit < 1
    || !policy.businessTimezone
    || !isSupportedTimezone(policy.businessTimezone)
    || !policy.approvedBy
    || policy.approvedAt === null) {
    throw rewardsErrors.ruleDisabled(
      policy?.disabledReason ?? "An approved monthly redemption policy is not configured.",
    );
  }
  return {
    ...policy,
    enabled: true,
    monthlyLimit: policy.monthlyLimit,
    businessTimezone: policy.businessTimezone,
    approvedBy: policy.approvedBy,
    approvedAt: policy.approvedAt,
  };
}

function isSupportedTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function mapPolicy(row: PolicyRow): EffectiveRedemptionLimitPolicy {
  return {
    id: row.id as RedemptionLimitPolicyVersionId,
    code: row.code,
    version: row.version,
    enabled: row.enabled,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    monthlyLimit: row.monthly_limit,
    businessTimezone: row.business_timezone,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    disabledReason: row.disabled_reason,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}
