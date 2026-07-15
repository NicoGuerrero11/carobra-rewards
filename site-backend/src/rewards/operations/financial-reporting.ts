import type { PoolClient, QueryResultRow } from "pg";

import { rewardsErrors } from "../shared/errors.js";

export interface FinancialReportPeriod {
  fromInclusive: Date;
  toExclusive: Date;
}

export interface FinancialPointTotals {
  issuedPoints: bigint;
  availablePoints: bigint;
  reservedPoints: bigint;
  consumedPoints: bigint;
  expiredPoints: bigint;
  adjustedPoints: bigint;
  refundedPoints: bigint;
}

export interface FinancialRuleBreakdown {
  ruleCode: string;
  ruleVersion: number;
  issuedPoints: bigint;
}

export interface FinancialCampaignBreakdown {
  campaignCode: string;
  issuedPoints: bigint;
}

export interface FinancialCatalogBreakdown {
  catalogCode: string;
  catalogVersion: number;
  consumedPoints: bigint;
  refundedPoints: bigint;
}

export interface FinancialLiabilityEstimate {
  assumptionId: string;
  assumptionCode: string;
  assumptionVersion: number;
  expectedRedemptionBasisPoints: number;
  estimatedLiabilityPoints: string;
}

export interface FinancialPeriodReport {
  period: FinancialReportPeriod;
  totals: FinancialPointTotals;
  rules: readonly FinancialRuleBreakdown[];
  campaigns: readonly FinancialCampaignBreakdown[];
  catalog: readonly FinancialCatalogBreakdown[];
  liability: FinancialLiabilityEstimate;
}

export interface FinancialReportActor {
  id: string;
  permissions: readonly string[];
}

export interface FinancialReportingPort {
  reportPeriod(period: FinancialReportPeriod): Promise<FinancialPeriodReport>;
}

export class ReadFinancialReports {
  constructor(private readonly reporting: FinancialReportingPort) {}

  reportPeriod(
    actor: FinancialReportActor,
    period: FinancialReportPeriod,
  ): Promise<FinancialPeriodReport> {
    if (!actor.id.trim() || !actor.permissions.includes("rewards:finance:view")) {
      throw rewardsErrors.forbidden();
    }
    return this.reporting.reportPeriod(period);
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface TotalsRow extends QueryResultRow {
  issued_points: string;
  available_points: string;
  reserved_points: string;
  consumed_points: string;
  expired_points: string;
  adjusted_points: string;
  refunded_points: string;
}
interface RuleRow extends QueryResultRow {
  rule_code: string;
  rule_version: number;
  issued_points: string;
}
interface CampaignRow extends QueryResultRow { campaign_code: string; issued_points: string }
interface CatalogRow extends QueryResultRow {
  catalog_code: string;
  catalog_version: number;
  consumed_points: string;
  refunded_points: string;
}
interface AssumptionRow extends QueryResultRow {
  id: string;
  code: string;
  version: number;
  expected_redemption_basis_points: number;
}

export class PostgresFinancialReporting implements FinancialReportingPort {
  constructor(private readonly database: TransactionalDatabase) {}

  async reportPeriod(period: FinancialReportPeriod): Promise<FinancialPeriodReport> {
    requireFinancialReportPeriod(period);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const totals = (await client.query<TotalsRow>(`
        WITH period_entries AS (
          SELECT entry_type, points_delta
          FROM ledger_entries
          WHERE created_at >= $1 AND created_at < $2
        ), closing_available AS (
          SELECT COALESCE(sum(entry.points_delta), 0) AS points
          FROM ledger_entries entry
          WHERE entry.created_at < $2
            AND (
              entry.entry_type IN (
                'ISSUANCE', 'ADJUSTMENT', 'REFUND', 'EXPIRATION', 'RESERVATION', 'RELEASE'
              )
              OR (
                entry.entry_type = 'CONSUMPTION'
                AND EXISTS (
                  SELECT 1
                  FROM point_allocations allocation
                  JOIN redemption_allocations redemption_allocation
                    ON redemption_allocation.point_allocation_id = allocation.id
                  WHERE allocation.ledger_entry_id = entry.id
                )
              )
            )
        ), closing_reserved AS (
          SELECT COALESCE(sum(allocation.points), 0) AS points
          FROM point_allocations allocation
          JOIN ledger_entries reservation ON reservation.id = allocation.ledger_entry_id
          WHERE reservation.entry_type = 'RESERVATION'
            AND allocation.created_at < $2
            AND (allocation.status = 'RESERVED' OR allocation.updated_at >= $2)
        )
        SELECT
          COALESCE(sum(points_delta) FILTER (WHERE entry_type = 'ISSUANCE'), 0)::text
            AS issued_points,
          (SELECT points::text FROM closing_available) AS available_points,
          (SELECT points::text FROM closing_reserved) AS reserved_points,
          COALESCE(-sum(points_delta) FILTER (WHERE entry_type = 'CONSUMPTION'), 0)::text
            AS consumed_points,
          COALESCE(-sum(points_delta) FILTER (WHERE entry_type = 'EXPIRATION'), 0)::text
            AS expired_points,
          COALESCE(sum(points_delta) FILTER (WHERE entry_type = 'ADJUSTMENT'), 0)::text
            AS adjusted_points,
          COALESCE(sum(points_delta) FILTER (WHERE entry_type = 'REFUND'), 0)::text
            AS refunded_points
        FROM period_entries
      `, [period.fromInclusive, period.toExclusive])).rows[0];
      if (!totals) throw new Error("Financial report totals were not returned");

      const rules = (await client.query<RuleRow>(`
        SELECT
          COALESCE(rule.code, 'UNATTRIBUTED') AS rule_code,
          COALESCE(rule.version, 0) AS rule_version,
          sum(entry.points_delta)::text AS issued_points
        FROM ledger_entries entry
        LEFT JOIN behavior_rule_versions rule ON rule.id = entry.rule_version_id
        WHERE entry.entry_type = 'ISSUANCE'
          AND entry.created_at >= $1 AND entry.created_at < $2
        GROUP BY rule.code, rule.version
        ORDER BY rule.code NULLS LAST, rule.version NULLS LAST
      `, [period.fromInclusive, period.toExclusive])).rows;

      const campaigns = (await client.query<CampaignRow>(`
        SELECT campaign_code, sum(points_delta)::text AS issued_points
        FROM (
          SELECT entry.points_delta,
            COALESCE(
              rule.configuration->>'campaign',
              event.safe_metadata->>'campaign',
              CASE WHEN rule.validity_policy = 'CAMPAIGN_90_DAYS' THEN rule.code END
            ) AS campaign_code
          FROM ledger_entries entry
          LEFT JOIN behavior_rule_versions rule ON rule.id = entry.rule_version_id
          LEFT JOIN reward_events event ON event.id = entry.reward_event_id
          WHERE entry.entry_type = 'ISSUANCE'
            AND entry.created_at >= $1 AND entry.created_at < $2
        ) campaign_entries
        WHERE campaign_code IS NOT NULL AND campaign_code <> ''
        GROUP BY campaign_code
        ORDER BY campaign_code
      `, [period.fromInclusive, period.toExclusive])).rows;

      const catalog = (await client.query<CatalogRow>(`
        WITH catalog_activity AS (
          SELECT redemption.catalog_item_id,
            sum(allocation.points) AS consumed_points,
            0::numeric AS refunded_points
          FROM redemptions redemption
          JOIN redemption_allocations redemption_allocation
            ON redemption_allocation.redemption_id = redemption.id
          JOIN point_allocations allocation
            ON allocation.id = redemption_allocation.point_allocation_id
          JOIN ledger_entries consumption ON consumption.id = allocation.ledger_entry_id
          WHERE consumption.entry_type = 'CONSUMPTION'
            AND consumption.created_at >= $1 AND consumption.created_at < $2
          GROUP BY redemption.id, redemption.catalog_item_id
          UNION ALL
          SELECT redemption.catalog_item_id,
            0::numeric AS consumed_points,
            sum(refund.points_delta) AS refunded_points
          FROM redemptions redemption
          JOIN ledger_entries refund ON refund.correlation_id = redemption.correlation_id
          WHERE refund.entry_type = 'REFUND'
            AND refund.created_at >= $1 AND refund.created_at < $2
          GROUP BY redemption.id, redemption.catalog_item_id
        )
        SELECT item.code AS catalog_code, item.version AS catalog_version,
          sum(activity.consumed_points)::text AS consumed_points,
          sum(activity.refunded_points)::text AS refunded_points
        FROM catalog_activity activity
        JOIN catalog_items item ON item.id = activity.catalog_item_id
        GROUP BY item.code, item.version
        ORDER BY item.code, item.version
      `, [period.fromInclusive, period.toExclusive])).rows;

      const assumptions = (await client.query<AssumptionRow>(`
        SELECT id::text, code, version, expected_redemption_basis_points
        FROM expected_redemption_assumption_versions
        WHERE code = 'EXPECTED_REDEMPTION' AND enabled
          AND effective_from < $1
          AND (effective_to IS NULL OR effective_to >= $1)
        ORDER BY effective_from DESC, version DESC
        LIMIT 2
      `, [period.toExclusive])).rows;
      if (assumptions.length === 0) {
        throw new Error("No approved expected-redemption assumption applies to the report period");
      }
      if (assumptions.length > 1) {
        throw new Error("Multiple expected-redemption assumptions apply to the report period");
      }
      const assumption = assumptions[0]!;
      const mappedTotals = mapTotals(totals);

      const report = {
        period: {
          fromInclusive: new Date(period.fromInclusive),
          toExclusive: new Date(period.toExclusive),
        },
        totals: mappedTotals,
        rules: rules.map((row) => ({
          ruleCode: row.rule_code,
          ruleVersion: row.rule_version,
          issuedPoints: nonNegativePoints(row.issued_points, "rule issued"),
        })),
        campaigns: campaigns.map((row) => ({
          campaignCode: row.campaign_code,
          issuedPoints: nonNegativePoints(row.issued_points, "campaign issued"),
        })),
        catalog: catalog.map((row) => ({
          catalogCode: row.catalog_code,
          catalogVersion: row.catalog_version,
          consumedPoints: nonNegativePoints(row.consumed_points, "catalog consumed"),
          refundedPoints: nonNegativePoints(row.refunded_points, "catalog refunded"),
        })),
        liability: {
          assumptionId: assumption.id,
          assumptionCode: assumption.code,
          assumptionVersion: assumption.version,
          expectedRedemptionBasisPoints: assumption.expected_redemption_basis_points,
          estimatedLiabilityPoints: estimateLiabilityPoints(
            mappedTotals.availablePoints,
            assumption.expected_redemption_basis_points,
          ),
        },
      } satisfies FinancialPeriodReport;
      const ruleIssued = report.rules.reduce((sum, row) => sum + row.issuedPoints, 0n);
      if (ruleIssued !== report.totals.issuedPoints) {
        throw new Error("Financial report rule totals do not reconcile");
      }
      await client.query("COMMIT");
      return report;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function requireFinancialReportPeriod(period: FinancialReportPeriod): void {
  if (Number.isNaN(period.fromInclusive.getTime())
    || Number.isNaN(period.toExclusive.getTime())
    || period.fromInclusive >= period.toExclusive) {
    throw new Error("Financial report period must be a valid non-empty half-open interval");
  }
}

export function estimateLiabilityPoints(
  availablePoints: bigint,
  expectedRedemptionBasisPoints: number,
): string {
  if (availablePoints < 0n
    || !Number.isInteger(expectedRedemptionBasisPoints)
    || expectedRedemptionBasisPoints < 0
    || expectedRedemptionBasisPoints > 10_000) {
    throw new Error("Liability estimate inputs must use non-negative points and valid basis points");
  }
  const scaled = availablePoints * BigInt(expectedRedemptionBasisPoints);
  const whole = scaled / 10_000n;
  const remainder = scaled % 10_000n;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(4, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function mapTotals(row: TotalsRow): FinancialPointTotals {
  return {
    issuedPoints: nonNegativePoints(row.issued_points, "issued"),
    availablePoints: nonNegativePoints(row.available_points, "available"),
    reservedPoints: nonNegativePoints(row.reserved_points, "reserved"),
    consumedPoints: nonNegativePoints(row.consumed_points, "consumed"),
    expiredPoints: nonNegativePoints(row.expired_points, "expired"),
    adjustedPoints: BigInt(row.adjusted_points),
    refundedPoints: nonNegativePoints(row.refunded_points, "refunded"),
  };
}

function nonNegativePoints(value: string, label: string): bigint {
  const points = BigInt(value);
  if (points < 0n) throw new Error(`Financial report ${label} points cannot be negative`);
  return points;
}
