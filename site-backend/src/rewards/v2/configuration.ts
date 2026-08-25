import type { QueryResult, QueryResultRow } from "pg";

import type { RewardsV2RuleType } from "../shared/enums.js";
import type { RewardsV2RuleVersionId } from "../shared/identifiers.js";
import {
  requireInstant,
  requireSafeObject,
  requireV2RuleType,
} from "./domain.js";

export interface RewardsV2RuleVersion {
  id: RewardsV2RuleVersionId;
  ruleType: RewardsV2RuleType;
  code: string;
  version: number;
  enabled: boolean;
  approvedForProduction: boolean;
  settings: Readonly<Record<string, unknown>>;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
}

export interface RewardsV2RuleLookupPort {
  findEffective(code: string, effectiveAt: Date): Promise<RewardsV2RuleVersion | null>;
  listEffectiveFeatureFlags(effectiveAt: Date): Promise<readonly RewardsV2RuleVersion[]>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface RuleRow extends QueryResultRow {
  id: string;
  rule_type: string;
  code: string;
  version: number;
  enabled: boolean;
  approved_for_production: boolean;
  settings: Record<string, unknown>;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
  approved_at: Date | null;
  approved_by: string | null;
}

const columns = `
  id::text, rule_type, code, version, enabled, approved_for_production,
  settings, effective_from, effective_to, disabled_reason, approved_at,
  approved_by
`;

export class PostgresRewardsV2RuleLookup implements RewardsV2RuleLookupPort {
  constructor(private readonly database: Queryable) {}

  async findEffective(code: string, effectiveAt: Date): Promise<RewardsV2RuleVersion | null> {
    const normalizedCode = normalizeRuleCode(code);
    requireInstant("effectiveAt", effectiveAt);
    const row = (await this.database.query<RuleRow>(`
      SELECT ${columns}
      FROM rewards_v2_rule_versions
      WHERE code = $1
        AND effective_from <= $2
        AND (effective_to IS NULL OR effective_to > $2)
      ORDER BY version DESC, effective_from DESC
      LIMIT 1
    `, [normalizedCode, effectiveAt])).rows[0];
    return row ? mapRule(row) : null;
  }

  async listEffectiveFeatureFlags(
    effectiveAt: Date,
  ): Promise<readonly RewardsV2RuleVersion[]> {
    requireInstant("effectiveAt", effectiveAt);
    const result = await this.database.query<RuleRow>(`
      SELECT DISTINCT ON (code) ${columns}
      FROM rewards_v2_rule_versions
      WHERE rule_type = 'FEATURE_FLAG'
        AND effective_from <= $1
        AND (effective_to IS NULL OR effective_to > $1)
      ORDER BY code, version DESC, effective_from DESC
    `, [effectiveAt]);
    return result.rows.map(mapRule);
  }
}

export function requireInternallyEnabledRule(
  rule: RewardsV2RuleVersion | null,
  code: string,
): RewardsV2RuleVersion {
  if (!rule?.enabled) {
    throw new Error(rule?.disabledReason ?? `No effective ${normalizeRuleCode(code)} rule exists`);
  }
  return rule;
}

export function requireProductionApprovedRule(
  rule: RewardsV2RuleVersion | null,
  code: string,
): RewardsV2RuleVersion {
  const enabled = requireInternallyEnabledRule(rule, code);
  if (!enabled.approvedForProduction || !enabled.approvedAt || !enabled.approvedBy) {
    throw new Error(`${enabled.code} is not approved for production`);
  }
  return enabled;
}

function normalizeRuleCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 100 || !/^[A-Z0-9_]+$/.test(normalized)) {
    throw new Error("Rewards V2 rule code is invalid");
  }
  return normalized;
}

function mapRule(row: RuleRow): RewardsV2RuleVersion {
  return {
    id: row.id as RewardsV2RuleVersionId,
    ruleType: requireV2RuleType(row.rule_type),
    code: row.code,
    version: row.version,
    enabled: row.enabled,
    approvedForProduction: row.approved_for_production,
    settings: requireSafeObject("settings", row.settings),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    disabledReason: row.disabled_reason,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
  };
}
