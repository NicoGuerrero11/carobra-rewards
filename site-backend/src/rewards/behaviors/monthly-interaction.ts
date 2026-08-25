import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { PointIssuancePort, PointIssuanceResult } from "../ledger/issuance.js";
import { normalizeRewardEvent, type NormalizedRewardEvent } from "../ledger/reward-event.js";
import type { Clock } from "../shared/clock.js";
import type { RewardEventSource } from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import type { CustomerId, RewardsAccountId, RuleVersionId } from "../shared/identifiers.js";
import {
  requireEnabledBehaviorRule,
  type BehaviorRuleLookupPort,
  type EnabledBehaviorRule,
} from "./rule-lookup.js";

export interface AuthenticatedRewardsCustomer {
  accountId: RewardsAccountId;
  customerId: CustomerId;
}

export interface QualifyingSiteActionCommand {
  actionCode: string;
  source: RewardEventSource;
  sourceId: string;
  occurredAt: Date;
  receivedAt: Date;
  safeMetadata?: Readonly<Record<string, unknown>>;
}

export interface MonthlyInteractionClaim {
  businessMonth: string;
  businessTimezone: string;
  actionCode: string;
  qualifiedAt: Date;
  replayed: boolean;
}

export interface MonthlyInteractionStore {
  claim(command: {
    actor: AuthenticatedRewardsCustomer;
    ruleVersionId: RuleVersionId;
    businessMonth: string;
    businessTimezone: string;
    actionCode: string;
    event: NormalizedRewardEvent;
  }): Promise<MonthlyInteractionClaim>;
}

export type MonthlyInteractionResult =
  | { status: "NOT_QUALIFYING"; businessMonth: string; award: null }
  | { status: "AWARDED"; businessMonth: string; award: PointIssuanceResult };

export class IngestQualifyingSiteAction {
  constructor(
    private readonly rules: BehaviorRuleLookupPort,
    private readonly interactions: MonthlyInteractionStore,
    private readonly issuance: PointIssuancePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthenticatedRewardsCustomer | null,
    command: QualifyingSiteActionCommand,
  ): Promise<MonthlyInteractionResult> {
    if (!actor) throw rewardsErrors.unauthenticated();
    const actionCode = bounded("actionCode", command.actionCode, 80).toUpperCase();
    const evidence = normalizeRewardEvent({
      source: command.source,
      sourceId: command.sourceId,
      eventType: "QUALIFYING_SITE_ACTION",
      customerId: actor.customerId,
      occurredAt: command.occurredAt,
      receivedAt: command.receivedAt,
      ...(command.safeMetadata === undefined ? {} : { safeMetadata: command.safeMetadata }),
    });
    const rule = requireEnabledBehaviorRule(
      await this.rules.findEffective("MONTHLY_INTERACTION", evidence.occurredAt),
      "MONTHLY_INTERACTION",
    );
    const configuration = monthlyConfiguration(rule);
    const businessMonth = businessMonthAt(evidence.occurredAt, configuration.businessTimezone);
    if (!configuration.qualifyingActions.includes(actionCode)) {
      return { status: "NOT_QUALIFYING", businessMonth, award: null };
    }
    const claim = await this.interactions.claim({
      actor,
      ruleVersionId: rule.id,
      businessMonth,
      businessTimezone: configuration.businessTimezone,
      actionCode,
      event: evidence,
    });
    const awardedAt = this.clock.now();
    const award = await this.issuance.issue({
      accountId: actor.accountId,
      ruleCode: "MONTHLY_INTERACTION",
      event: normalizeRewardEvent({
        source: "INTERNAL",
        sourceId: `monthly-interaction:${actor.accountId}:${rule.id}:${claim.businessMonth}`,
        eventType: "MONTHLY_INTERACTION",
        customerId: actor.customerId,
        occurredAt: claim.qualifiedAt,
        receivedAt: awardedAt,
        safeMetadata: {
          businessMonth: claim.businessMonth,
          businessTimezone: claim.businessTimezone,
          qualifyingAction: claim.actionCode,
        },
      }),
      issuedAt: awardedAt,
    });
    return { status: "AWARDED", businessMonth: claim.businessMonth, award };
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { customer_id: string }
interface InteractionRow extends QueryResultRow {
  account_id: string;
  customer_id: string;
  rule_version_id: string;
  business_month: string;
  business_timezone: string;
  action_code: string;
  source: RewardEventSource;
  source_id: string;
  occurred_at: Date;
}

export class PostgresMonthlyInteractionStore implements MonthlyInteractionStore {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async claim(command: Parameters<MonthlyInteractionStore["claim"]>[0]): Promise<MonthlyInteractionClaim> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
      `, [command.actor.accountId])).rows[0];
      if (!account || account.customer_id !== command.actor.customerId) throw rewardsErrors.notEligible();
      const inserted = await client.query(`
        INSERT INTO monthly_interactions (
          id, account_id, customer_id, rule_version_id, business_month,
          business_timezone, action_code, source, source_id, occurred_at,
          received_at, safe_metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $11, $11)
        ON CONFLICT DO NOTHING
      `, [
        this.generateId(), command.actor.accountId, command.actor.customerId,
        command.ruleVersionId, command.businessMonth, command.businessTimezone,
        command.actionCode, command.event.source, command.event.sourceId,
        command.event.occurredAt, command.event.receivedAt,
        JSON.stringify(command.event.safeMetadata),
      ]);
      if (inserted.rowCount === 0) {
        const sourceCollision = (await client.query<InteractionRow>(`
          SELECT account_id::text, customer_id::text, rule_version_id::text,
            business_month, business_timezone, action_code, source, source_id, occurred_at
          FROM monthly_interactions WHERE source = $1 AND source_id = $2
        `, [command.event.source, command.event.sourceId])).rows[0];
        if (sourceCollision && (
          sourceCollision.account_id !== command.actor.accountId
          || sourceCollision.customer_id !== command.actor.customerId
          || sourceCollision.rule_version_id !== command.ruleVersionId
          || sourceCollision.business_month !== command.businessMonth
        )) throw rewardsErrors.duplicateEvent();
      }
      const interaction = (await client.query<InteractionRow>(`
        SELECT account_id::text, customer_id::text, rule_version_id::text,
          business_month, business_timezone, action_code, source, source_id, occurred_at
        FROM monthly_interactions
        WHERE account_id = $1 AND rule_version_id = $2 AND business_month = $3
      `, [command.actor.accountId, command.ruleVersionId, command.businessMonth])).rows[0];
      if (!interaction) throw new Error("Monthly interaction was not persisted after claim");
      await client.query("COMMIT");
      return {
        businessMonth: interaction.business_month,
        businessTimezone: interaction.business_timezone,
        actionCode: interaction.action_code,
        qualifiedAt: interaction.occurred_at,
        replayed: inserted.rowCount === 0,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function businessMonthAt(instant: Date, timezone: string): string {
  if (Number.isNaN(instant.getTime())) throw new Error("Business month instant must be valid");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new Error("Monthly interaction business timezone is invalid");
  }
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Business month could not be calculated");
  return `${year}-${month}`;
}

function monthlyConfiguration(rule: EnabledBehaviorRule): {
  businessTimezone: string;
  qualifyingActions: readonly string[];
} {
  const timezone = rule.configuration.businessTimezone;
  const actions = rule.configuration.qualifyingActions;
  if (typeof timezone !== "string" || !Array.isArray(actions) || actions.length === 0
    || !actions.every((action) => typeof action === "string" && action.trim())) {
    throw rewardsErrors.ruleDisabled("Monthly interaction action catalog and timezone are incomplete.");
  }
  businessMonthAt(rule.effectiveFrom, timezone);
  return {
    businessTimezone: timezone,
    qualifyingActions: actions.map((action) => action.trim().toUpperCase()),
  };
}

function bounded(name: string, value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} cannot be empty`);
  if (normalized.length > maximum) throw new Error(`${name} cannot exceed ${maximum} characters`);
  return normalized;
}
