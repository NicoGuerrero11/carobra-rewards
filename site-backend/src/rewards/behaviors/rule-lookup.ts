import type { QueryResult, QueryResultRow } from "pg";

import { rewardsErrors } from "../shared/errors.js";
import type { RuleVersionId } from "../shared/identifiers.js";
import type { ValidityPolicy } from "../shared/enums.js";

export interface EffectiveBehaviorRule {
  id: RuleVersionId;
  code: string;
  version: number;
  enabled: boolean;
  pointValue: bigint | null;
  validityPolicy: ValidityPolicy;
  evidenceRequirements: Readonly<Record<string, unknown>>;
  configuration: Readonly<Record<string, unknown>>;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  disabledReason: string | null;
}

export interface EnabledBehaviorRule extends EffectiveBehaviorRule {
  enabled: true;
  pointValue: bigint;
}

export interface BehaviorRuleLookupPort {
  findEffective(code: string, effectiveAt: Date): Promise<EffectiveBehaviorRule | null>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface BehaviorRuleRow extends QueryResultRow {
  id: string;
  code: string;
  version: number;
  enabled: boolean;
  point_value: string | null;
  validity_policy: ValidityPolicy;
  evidence_requirements: Record<string, unknown>;
  configuration: Record<string, unknown>;
  effective_from: Date;
  effective_to: Date | null;
  disabled_reason: string | null;
}

export class PostgresBehaviorRuleLookup implements BehaviorRuleLookupPort {
  constructor(private readonly database: Queryable) {}

  findEffective(code: string, effectiveAt: Date): Promise<EffectiveBehaviorRule | null> {
    return findEffectiveBehaviorRule(this.database, code, effectiveAt);
  }
}

export async function findEffectiveBehaviorRule(
  database: Queryable,
  code: string,
  effectiveAt: Date,
  lock = false,
): Promise<EffectiveBehaviorRule | null> {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error("Behavior rule code cannot be empty");
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new Error("Behavior rule effective time must be valid");
  }
  const row = (await database.query<BehaviorRuleRow>(`
    SELECT
      id::text,
      code,
      version,
      enabled,
      point_value::text,
      validity_policy,
      evidence_requirements,
      configuration,
      effective_from,
      effective_to,
      disabled_reason
    FROM behavior_rule_versions
    WHERE code = $1
      AND effective_from <= $2
      AND (effective_to IS NULL OR effective_to > $2)
    ORDER BY version DESC, effective_from DESC
    LIMIT 1
    ${lock ? "FOR SHARE" : ""}
  `, [normalizedCode, effectiveAt])).rows[0];
  return row ? mapRule(row) : null;
}

export function requireEnabledBehaviorRule(
  rule: EffectiveBehaviorRule | null,
  code: string,
): EnabledBehaviorRule {
  if (!rule?.enabled || rule.pointValue === null) {
    throw rewardsErrors.ruleDisabled(
      rule?.disabledReason ?? `No effective ${code.trim()} rule exists.`,
    );
  }
  return { ...rule, enabled: true, pointValue: rule.pointValue };
}

function mapRule(row: BehaviorRuleRow): EffectiveBehaviorRule {
  return {
    id: row.id as RuleVersionId,
    code: row.code,
    version: row.version,
    enabled: row.enabled,
    pointValue: row.point_value === null ? null : BigInt(row.point_value),
    validityPolicy: row.validity_policy,
    evidenceRequirements: row.evidence_requirements,
    configuration: row.configuration,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    disabledReason: row.disabled_reason,
  };
}
