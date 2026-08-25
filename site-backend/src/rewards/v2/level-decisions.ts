import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type {
  RewardsJourneyState,
  RewardsLevel,
} from "../shared/enums.js";
import type {
  CustomerId,
  LevelDecisionId,
  RewardsJourneyId,
  RewardsV2RuleVersionId,
} from "../shared/identifiers.js";
import { requireInstant, requireRewardsLevel, requireSafeObject } from "./domain.js";

export interface RewardsJourneyLevelSnapshot {
  id: RewardsJourneyId;
  customerId: CustomerId;
  state: RewardsJourneyState;
  currentLevel: RewardsLevel | null;
  registeredAt: Date;
  redemptionEligible: boolean;
}

export interface ApplyLevelDecisionCommand {
  journeyId: RewardsJourneyId;
  ruleVersionId: RewardsV2RuleVersionId;
  resultingLevel: RewardsLevel | null;
  resultingState: RewardsJourneyState;
  redemptionEligible: boolean;
  triggerType: string;
  triggerId: string;
  decisionInputs: Readonly<Record<string, unknown>>;
  reasonCode: string;
  idempotencyKey: string;
  decidedAt: Date;
}

export interface AppliedLevelDecision {
  id: LevelDecisionId;
  previousLevel: RewardsLevel | null;
  resultingLevel: RewardsLevel | null;
  replayed: boolean;
}

export interface JourneyLevelStore {
  getForCustomer(customerId: CustomerId): Promise<RewardsJourneyLevelSnapshot | null>;
  applyDecision(command: ApplyLevelDecisionCommand): Promise<AppliedLevelDecision>;
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface JourneyRow extends QueryResultRow {
  id: string;
  customer_id: string;
  state: RewardsJourneyState;
  current_level: string | null;
  registered_at: Date;
  redemption_eligible: boolean;
}
interface DecisionRow extends QueryResultRow {
  id: string;
  previous_level: string | null;
  resulting_level: string | null;
}

export class PostgresJourneyLevelStore implements JourneyLevelStore {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async getForCustomer(customerId: CustomerId): Promise<RewardsJourneyLevelSnapshot | null> {
    const client = await this.database.connect();
    try {
      const row = (await client.query<JourneyRow>(`
        SELECT id::text, customer_id::text, state, current_level,
          registered_at, redemption_eligible
        FROM rewards_v2_journeys
        WHERE customer_id = $1
      `, [customerId])).rows[0];
      return row ? mapJourney(row) : null;
    } finally {
      client.release();
    }
  }

  async applyDecision(command: ApplyLevelDecisionCommand): Promise<AppliedLevelDecision> {
    const normalized = normalizeCommand(command);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const journey = (await client.query<JourneyRow>(`
        SELECT id::text, customer_id::text, state, current_level,
          registered_at, redemption_eligible
        FROM rewards_v2_journeys
        WHERE id = $1
        FOR UPDATE
      `, [normalized.journeyId])).rows[0];
      if (!journey) throw new Error("Rewards V2 journey was not found");

      const decisionId = this.generateId();
      const inserted = await client.query(`
        INSERT INTO rewards_level_decisions (
          id, journey_id, rule_version_id, previous_level, resulting_level,
          trigger_type, trigger_id, decision_inputs, reason_code,
          idempotency_key, decided_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $11)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        decisionId, normalized.journeyId, normalized.ruleVersionId,
        journey.current_level, normalized.resultingLevel, normalized.triggerType,
        normalized.triggerId, JSON.stringify(normalized.decisionInputs),
        normalized.reasonCode, normalized.idempotencyKey, normalized.decidedAt,
      ]);
      const replayed = inserted.rowCount === 0;
      const decision = (await client.query<DecisionRow>(`
        SELECT id::text, previous_level, resulting_level
        FROM rewards_level_decisions
        WHERE idempotency_key = $1
      `, [normalized.idempotencyKey])).rows[0];
      if (!decision) throw new Error("Rewards level decision was not persisted");

      if (replayed) {
        if (decision.resulting_level !== normalized.resultingLevel) {
          throw new Error("Level decision idempotency key conflicts with another outcome");
        }
      } else {
        await client.query(`
          UPDATE rewards_v2_journeys
          SET state = $2,
              current_level = $3,
              redemption_eligible = $4,
              last_evaluated_at = $5,
              updated_at = $5
          WHERE id = $1
        `, [
          normalized.journeyId, normalized.resultingState,
          normalized.resultingLevel, normalized.redemptionEligible,
          normalized.decidedAt,
        ]);
      }
      await client.query("COMMIT");
      return {
        id: decision.id as LevelDecisionId,
        previousLevel: requireRewardsLevel(decision.previous_level),
        resultingLevel: requireRewardsLevel(decision.resulting_level),
        replayed,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function normalizeCommand(command: ApplyLevelDecisionCommand): ApplyLevelDecisionCommand {
  requireInstant("decidedAt", command.decidedAt);
  requireSafeObject("decisionInputs", command.decisionInputs);
  for (const [label, value, maximum] of [
    ["triggerType", command.triggerType, 40],
    ["triggerId", command.triggerId, 180],
    ["reasonCode", command.reasonCode, 100],
    ["idempotencyKey", command.idempotencyKey, 200],
  ] as const) {
    if (!value.trim() || value.length > maximum) {
      throw new Error(`${label} is invalid`);
    }
  }
  if (command.redemptionEligible && command.resultingState !== "ACTIVE") {
    throw new Error("Redemption eligibility requires an active journey");
  }
  return command;
}

function mapJourney(row: JourneyRow): RewardsJourneyLevelSnapshot {
  return {
    id: row.id as RewardsJourneyId,
    customerId: row.customer_id as CustomerId,
    state: row.state,
    currentLevel: requireRewardsLevel(row.current_level),
    registeredAt: row.registered_at,
    redemptionEligible: row.redemption_eligible,
  };
}
