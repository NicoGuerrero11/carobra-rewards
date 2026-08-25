import type { QueryResult, QueryResultRow } from "pg";

import type { CustomerId } from "../shared/identifiers.js";

export interface RewardsActivityDetailsHttpResponse {
  activities: ReadonlyArray<{
    activity_type: string;
    qualifies: boolean;
    occurred_at: string;
  }>;
}

export interface RewardsMovementDetailsHttpResponse {
  movements: ReadonlyArray<{
    code: string;
    entry_type: string;
    points_delta: string;
    occurred_at: string;
  }>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface ActivityRow extends QueryResultRow {
  activity_type: string;
  qualifies: boolean;
  occurred_at: Date;
}

interface MovementRow extends QueryResultRow {
  code: string;
  entry_type: string;
  points_delta: string;
  occurred_at: Date;
}

export class PostgresRewardsJourneyDetailsQuery {
  constructor(private readonly database: Queryable) {}

  async getActivities(customerId: CustomerId): Promise<RewardsActivityDetailsHttpResponse> {
    const result = await this.database.query<ActivityRow>(`
      SELECT activity_type, qualifies, occurred_at
      FROM rewards_profile_activities
      WHERE customer_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT 30
    `, [customerId]);
    return {
      activities: result.rows.map((activity) => ({
        activity_type: activity.activity_type,
        qualifies: activity.qualifies,
        occurred_at: activity.occurred_at.toISOString(),
      })),
    };
  }

  async getMovements(customerId: CustomerId): Promise<RewardsMovementDetailsHttpResponse> {
    const result = await this.database.query<MovementRow>(`
      SELECT
        COALESCE(v2_rule.code, rule.code, entry.reason_code, event.event_type, entry.entry_type) AS code,
        entry.entry_type,
        entry.points_delta::text,
        COALESCE(event.occurred_at, entry.created_at) AS occurred_at
      FROM rewards_accounts AS account
      JOIN ledger_entries AS entry ON entry.account_id = account.id
      LEFT JOIN reward_events AS event ON event.id = entry.reward_event_id
      LEFT JOIN behavior_rule_versions AS rule ON rule.id = entry.rule_version_id
      LEFT JOIN rewards_v2_rule_versions AS v2_rule ON v2_rule.id = entry.v2_rule_version_id
      WHERE account.customer_id = $1
      ORDER BY entry.created_at DESC, entry.id DESC
      LIMIT 40
    `, [customerId]);
    return {
      movements: result.rows.map((movement) => ({
        code: movement.code,
        entry_type: movement.entry_type,
        points_delta: movement.points_delta,
        occurred_at: movement.occurred_at.toISOString(),
      })),
    };
  }
}
