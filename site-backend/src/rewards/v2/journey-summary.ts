import type { QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import {
  rewardsJourneyStates,
  type RewardsJourneyState,
  type RewardsLevel,
} from "../shared/enums.js";
import type { CustomerId } from "../shared/identifiers.js";
import type { RewardsV2RuleLookupPort } from "./configuration.js";
import { requireProductFactStatus, requireRewardsLevel } from "./domain.js";
import {
  assertRewardsJourneySummaryContract,
  type RewardsJourneySummaryHttpResponse,
} from "./journey-summary-contract.js";

export interface RewardsJourneySummaryQuery {
  getForCustomer(
    customerId: CustomerId,
    validationStatus: string,
  ): Promise<RewardsJourneySummaryHttpResponse | null>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface JourneyRow extends QueryResultRow {
  state: string;
  current_level: string | null;
  redemption_eligible: boolean;
  registered_at: Date;
  account_id: string;
  available_points: string;
  reserved_points: string;
}

interface ProductRow extends QueryResultRow {
  product_type: string;
  status: string;
  activated_at: Date | null;
}

interface MovementRow extends QueryResultRow {
  code: string;
  points_delta: string;
  occurred_at: Date;
}

interface ExpirationRow extends QueryResultRow {
  expires_at: Date | null;
}

const featureCodes = {
  V2_REDEMPTION: "benefits_enabled",
  V2_EXPIRY: "expiry_policy_approved",
  V2_AVE: "ave_enabled",
  V2_REFERRALS: "referrals_enabled",
  V2_RENEWALS: "renewals_enabled",
} as const;

export class PostgresRewardsJourneySummaryQuery implements RewardsJourneySummaryQuery {
  constructor(
    private readonly database: Queryable,
    private readonly rules: RewardsV2RuleLookupPort,
    private readonly clock: Clock,
  ) {}

  async getForCustomer(
    customerId: CustomerId,
    validationStatus: string,
  ): Promise<RewardsJourneySummaryHttpResponse | null> {
    const now = this.clock.now();
    const row = (await this.database.query<JourneyRow>(`
      SELECT
        journey.state,
        journey.current_level,
        journey.redemption_eligible,
        journey.registered_at,
        account.id::text AS account_id,
        account.available_points::text,
        account.reserved_points::text
      FROM rewards_v2_journeys AS journey
      JOIN rewards_accounts AS account ON account.id = journey.account_id
      WHERE journey.customer_id = $1
      LIMIT 1
    `, [customerId])).rows[0];
    if (!row) return null;

    const [productsResult, movementsResult, effectiveFlags] = await Promise.all([
      this.database.query<ProductRow>(`
        SELECT product_type, status, activated_at
        FROM rewards_product_facts
        WHERE customer_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 12
      `, [customerId]),
      this.database.query<MovementRow>(`
        SELECT
          COALESCE(v2_rule.code, rule.code, entry.reason_code, event.event_type, entry.entry_type) AS code,
          entry.points_delta::text,
          COALESCE(event.occurred_at, entry.created_at) AS occurred_at
        FROM ledger_entries AS entry
        LEFT JOIN reward_events AS event ON event.id = entry.reward_event_id
        LEFT JOIN behavior_rule_versions AS rule ON rule.id = entry.rule_version_id
        LEFT JOIN rewards_v2_rule_versions AS v2_rule ON v2_rule.id = entry.v2_rule_version_id
        WHERE entry.account_id = $1
          AND entry.rule_version_id IS NULL
          AND entry.reason_code IS DISTINCT FROM 'V2_TEST_BALANCE_NORMALIZATION'
        ORDER BY entry.created_at DESC, entry.id DESC
        LIMIT 8
      `, [row.account_id]),
      this.rules.listEffectiveFeatureFlags(now),
    ]);

    const modules = {
      benefits_enabled: false,
      expiry_policy_approved: false,
      ave_enabled: false,
      referrals_enabled: false,
      renewals_enabled: false,
    };
    for (const rule of effectiveFlags) {
      const module = featureCodes[rule.code as keyof typeof featureCodes];
      if (module) modules[module] = rule.enabled && rule.approvedForProduction;
    }

    const expiration = modules.expiry_policy_approved
      ? (await this.database.query<ExpirationRow>(`
          SELECT min(expires_at) AS expires_at
          FROM point_lots
          WHERE account_id = $1
            AND remaining_points > 0
            AND expired_at IS NULL
            AND expires_at > $2
        `, [row.account_id, now])).rows[0]?.expires_at ?? null
      : null;
    const products = productsResult.rows.map((product) => ({
      product_type: product.product_type,
      status: requireProductFactStatus(product.status),
      activated_at: product.activated_at?.toISOString() ?? null,
    }));
    const activeProductCount = products.filter((product) => product.status === "ACTIVE").length;
    const currentLevel = requireRewardsLevel(row.current_level);
    const state = requireJourneyState(row.state);
    const redemptionEligible = row.redemption_eligible
      && activeProductCount > 0
      && modules.benefits_enabled;

    return assertRewardsJourneySummaryContract({
      customer_id: customerId,
      journey: {
        state,
        current_level: currentLevel,
        validation_status: validationStatus,
        registered_at: row.registered_at.toISOString(),
      },
      redemption: {
        eligible: redemptionEligible,
        reason: redemptionEligible
          ? null
          : activeProductCount === 0
            ? "NO_ACTIVE_PRODUCT"
            : "REDEMPTION_DISABLED",
      },
      points: {
        available: row.available_points,
        reserved: row.reserved_points,
        next_expiration_at: expiration?.toISOString() ?? null,
      },
      progress: {
        target_level: nextLevel(currentLevel),
        rule_available: false,
        remaining_active_products: null,
        remaining_registration_months: null,
        remaining_qualifying_activities: null,
      },
      products,
      recent_movements: movementsResult.rows.map((movement) => ({
        code: movement.code,
        points_delta: movement.points_delta,
        occurred_at: movement.occurred_at.toISOString(),
      })),
      modules,
    });
  }
}

function nextLevel(level: RewardsLevel | null): RewardsLevel | null {
  if (level === null) return "BRONZE";
  const levels: Readonly<Record<RewardsLevel, RewardsLevel | null>> = {
    BRONZE: "SILVER",
    SILVER: "GOLD",
    GOLD: "PLATINUM",
    PLATINUM: "TITANIUM",
    TITANIUM: null,
  };
  return levels[level];
}

function requireJourneyState(value: string): RewardsJourneyState {
  if (!rewardsJourneyStates.includes(value as RewardsJourneyState)) {
    throw new Error("Rewards journey state is invalid");
  }
  return value as RewardsJourneyState;
}
