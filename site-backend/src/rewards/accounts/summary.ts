import type { QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { CustomerId, RewardsAccountId } from "../shared/identifiers.js";

export interface RewardsAccountSummary {
  accountId: RewardsAccountId;
  availablePoints: bigint;
  reservedPoints: bigint;
  nextExpiringPoints: bigint;
  nextExpirationAt: Date | null;
  recentMovements: readonly RewardsMovementSummary[];
  earningOpportunities: readonly RewardsEarningOpportunitySummary[];
  benefits: RewardsBenefitAvailabilitySummary;
}

export interface RewardsMovementSummary {
  id: string;
  entryType: string;
  pointsDelta: bigint;
  ruleCode: string | null;
  occurredAt: Date;
}

export interface RewardsEarningOpportunitySummary {
  code: string;
  pointValue: bigint;
  validityPolicy: string;
}

export interface RewardsBenefitAvailabilitySummary {
  availableItems: number;
  redemptionEnabled: boolean;
  unavailableReason: string | null;
}

export interface RewardsAccountSummaryQuery {
  getForCustomer(customerId: CustomerId): Promise<RewardsAccountSummary | null>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface SummaryRow extends QueryResultRow {
  account_id: string;
  available_points: string;
  reserved_points: string;
  next_expiring_points: string;
  next_expiration_at: Date | null;
}

interface MovementRow extends QueryResultRow {
  id: string;
  entry_type: string;
  points_delta: string;
  rule_code: string | null;
  occurred_at: Date;
}

interface EarningRow extends QueryResultRow {
  code: string;
  point_value: string;
  validity_policy: string;
}

interface BenefitRow extends QueryResultRow {
  available_items: number;
  redemption_enabled: boolean;
  unavailable_reason: string | null;
}

export class PostgresRewardsAccountSummaryQuery implements RewardsAccountSummaryQuery {
  constructor(
    private readonly database: Queryable,
    private readonly clock: Clock,
  ) {}

  async getForCustomer(customerId: CustomerId): Promise<RewardsAccountSummary | null> {
    const result = await this.database.query<SummaryRow>(`
      SELECT
        account.id::text AS account_id,
        account.available_points::text,
        account.reserved_points::text,
        COALESCE(next_expiration.points, 0)::text AS next_expiring_points,
        next_expiration.expires_at AS next_expiration_at
      FROM rewards_accounts AS account
      LEFT JOIN LATERAL (
        SELECT lot.expires_at, sum(lot.remaining_points) AS points
        FROM point_lots AS lot
        WHERE lot.account_id = account.id
          AND lot.remaining_points > 0
          AND lot.expired_at IS NULL
          AND lot.expires_at > $2
        GROUP BY lot.expires_at
        ORDER BY lot.expires_at
        LIMIT 1
      ) AS next_expiration ON true
      WHERE account.customer_id = $1
      LIMIT 1
    `, [customerId, this.clock.now()]);
    const row = result.rows[0];
    if (!row) return null;
    const [movements, earning, benefits] = await Promise.all([
      this.database.query<MovementRow>(`
        SELECT
          entry.id::text,
          entry.entry_type,
          entry.points_delta::text,
          rule.code AS rule_code,
          COALESCE(event.occurred_at, entry.created_at) AS occurred_at
        FROM ledger_entries AS entry
        LEFT JOIN reward_events AS event ON event.id = entry.reward_event_id
        LEFT JOIN behavior_rule_versions AS rule ON rule.id = entry.rule_version_id
        WHERE entry.account_id = $1
        ORDER BY entry.created_at DESC, entry.id DESC
        LIMIT 5
      `, [row.account_id]),
      this.database.query<EarningRow>(`
        SELECT code, point_value::text, validity_policy
        FROM behavior_rule_versions
        WHERE enabled = true
          AND point_value IS NOT NULL
          AND configuration @> '{"customerVisible":true}'::jsonb
          AND effective_from <= $1
          AND (effective_to IS NULL OR effective_to > $1)
        ORDER BY code
      `, [this.clock.now()]),
      this.database.query<BenefitRow>(`
        SELECT
          count(item.id)::integer AS available_items,
          COALESCE(gate.enabled, false) AS redemption_enabled,
          gate.disabled_reason AS unavailable_reason
        FROM behavior_rule_versions AS gate
        LEFT JOIN catalog_items AS item
          ON item.enabled = true
          AND item.effective_from <= $1
          AND (item.effective_to IS NULL OR item.effective_to > $1)
        WHERE gate.code = 'CATALOG_REDEMPTION'
          AND gate.effective_from <= $1
          AND (gate.effective_to IS NULL OR gate.effective_to > $1)
        GROUP BY gate.enabled, gate.disabled_reason, gate.version
        ORDER BY gate.version DESC
        LIMIT 1
      `, [this.clock.now()]),
    ]);
    const benefit = benefits.rows[0];
    return {
      accountId: row.account_id as RewardsAccountId,
      availablePoints: BigInt(row.available_points),
      reservedPoints: BigInt(row.reserved_points),
      nextExpiringPoints: BigInt(row.next_expiring_points),
      nextExpirationAt: row.next_expiration_at,
      recentMovements: movements.rows.map((movement) => ({
        id: movement.id,
        entryType: movement.entry_type,
        pointsDelta: BigInt(movement.points_delta),
        ruleCode: movement.rule_code,
        occurredAt: movement.occurred_at,
      })),
      earningOpportunities: earning.rows.map((opportunity) => ({
        code: opportunity.code,
        pointValue: BigInt(opportunity.point_value),
        validityPolicy: opportunity.validity_policy,
      })),
      benefits: {
        availableItems: benefit?.available_items ?? 0,
        redemptionEnabled: benefit?.redemption_enabled ?? false,
        unavailableReason: benefit?.unavailable_reason ?? "Catalog configuration is unavailable.",
      },
    };
  }
}
