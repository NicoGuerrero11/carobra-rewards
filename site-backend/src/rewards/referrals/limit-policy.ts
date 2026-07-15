import type { QueryResult, QueryResultRow } from "pg";

import { rewardsErrors } from "../shared/errors.js";
import type { ReferralLimitPolicyVersionId } from "../shared/identifiers.js";

export const monthlyReferralPolicyCode = "CUSTOMER_MONTHLY_REFERRALS" as const;
export type ReferralLimitExcessOutcome = "REJECT" | "HELD_FOR_REVIEW";

export interface EffectiveReferralLimitPolicy {
  id: ReferralLimitPolicyVersionId;
  code: typeof monthlyReferralPolicyCode;
  version: number;
  enabled: boolean;
  monthlyLimit: number | null;
  businessTimezone: string | null;
  excessOutcome: ReferralLimitExcessOutcome | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
}

export interface EnabledReferralLimitPolicy extends EffectiveReferralLimitPolicy {
  enabled: true;
  monthlyLimit: number;
  businessTimezone: string;
  excessOutcome: ReferralLimitExcessOutcome;
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
  code: typeof monthlyReferralPolicyCode;
  version: number;
  enabled: boolean;
  monthly_limit: number | null;
  business_timezone: string | null;
  excess_outcome: ReferralLimitExcessOutcome | null;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  approved_by: string | null;
  approved_at: Date | null;
}

export async function findEffectiveReferralLimitPolicy(
  database: Queryable,
  effectiveAt: Date,
  lock = false,
): Promise<EffectiveReferralLimitPolicy | null> {
  const row = (await database.query<PolicyRow>(`
    SELECT id::text, code, version, enabled, monthly_limit, business_timezone,
      excess_outcome, effective_from, effective_to, disabled_reason,
      approved_by, approved_at
    FROM referral_limit_policy_versions
    WHERE code = $1
      AND effective_from <= $2
      AND (effective_to IS NULL OR effective_to > $2)
    ORDER BY version DESC, effective_from DESC
    LIMIT 1
    ${lock ? "FOR SHARE" : ""}
  `, [monthlyReferralPolicyCode, effectiveAt])).rows[0];
  return row ? mapPolicy(row) : null;
}

export function requireEnabledReferralLimitPolicy(
  policy: EffectiveReferralLimitPolicy | null,
): EnabledReferralLimitPolicy {
  if (!policy?.enabled
    || policy.monthlyLimit === null
    || !Number.isInteger(policy.monthlyLimit)
    || policy.monthlyLimit < 1
    || !policy.businessTimezone
    || !isSupportedTimezone(policy.businessTimezone)
    || policy.excessOutcome === null
    || !policy.approvedBy
    || policy.approvedAt === null) {
    throw rewardsErrors.ruleDisabled(
      policy?.disabledReason ?? "An approved monthly referral policy is not configured.",
    );
  }
  return {
    ...policy,
    enabled: true,
    monthlyLimit: policy.monthlyLimit,
    businessTimezone: policy.businessTimezone,
    excessOutcome: policy.excessOutcome,
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

function mapPolicy(row: PolicyRow): EffectiveReferralLimitPolicy {
  return {
    id: row.id as ReferralLimitPolicyVersionId,
    code: row.code,
    version: row.version,
    enabled: row.enabled,
    monthlyLimit: row.monthly_limit,
    businessTimezone: row.business_timezone,
    excessOutcome: row.excess_outcome,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    disabledReason: row.disabled_reason,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}
