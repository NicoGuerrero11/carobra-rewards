import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { CustomerId } from "../shared/identifiers.js";

export interface ValidatedAforeEvidence {
  provider: "SISCA";
  productType: "AFORE";
  sourceId: string;
  validatedAt: Date;
}

export interface EnsureInvitedJourneyCommand {
  customerId: CustomerId;
  registeredAt: Date;
}

export interface SynchronizeRewardsEvidenceCommand extends EnsureInvitedJourneyCommand {
  validationStatus: string;
  validatedAfore: ValidatedAforeEvidence | null;
}

export interface RewardsV2LiveJourneyPort {
  ensureInvited(command: EnsureInvitedJourneyCommand): Promise<void>;
  synchronize(command: SynchronizeRewardsEvidenceCommand): Promise<void>;
}

interface TransactionalDatabase {
  connect(): Promise<PoolClient>;
}

interface RuleRow extends QueryResultRow {
  id: string;
  code: string;
  approved_for_production: boolean;
  settings: Record<string, unknown>;
}

interface AccountJourneyRow extends QueryResultRow {
  account_id: string;
  journey_id: string;
  current_level: string | null;
}

interface ProductFactRow extends QueryResultRow {
  id: string;
  account_id: string;
  customer_id: string;
  status: string;
}

export class PostgresRewardsV2LiveJourney implements RewardsV2LiveJourneyPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly clock: Clock,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async ensureInvited(command: EnsureInvitedJourneyCommand): Promise<void> {
    requireInstant("registeredAt", command.registeredAt);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await this.ensureInvitedInTransaction(client, command);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async synchronize(command: SynchronizeRewardsEvidenceCommand): Promise<void> {
    requireInstant("registeredAt", command.registeredAt);
    const receivedAt = this.clock.now();
    requireInstant("receivedAt", receivedAt);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const journey = await this.ensureInvitedInTransaction(client, command);
      if (command.validationStatus !== "VALIDATED" || !command.validatedAfore) {
        await client.query("COMMIT");
        return;
      }

      requireInstant("validatedAt", command.validatedAfore.validatedAt);
      const productEvidenceRule = await requireEnabledRule(
        client,
        "V2_SISCA_AFORE_ACTIVE",
        receivedAt,
      );
      const productSourceId = normalizeSourceId(command.validatedAfore.sourceId);
      const existingEvent = (await client.query<{ product_fact_id: string }>(`
        SELECT product_fact_id::text
        FROM rewards_product_fact_events
        WHERE source = 'SISCA' AND source_id = $1
      `, [productSourceId])).rows[0];

      let productFactId = existingEvent?.product_fact_id;
      if (!productFactId) {
        const existingFact = (await client.query<ProductFactRow>(`
          SELECT id::text, account_id::text, customer_id::text, status
          FROM rewards_product_facts
          WHERE provider = 'SISCA' AND external_reference = $1
          FOR UPDATE
        `, [productSourceId])).rows[0];
        if (existingFact
          && (existingFact.account_id !== journey.account_id
            || existingFact.customer_id !== command.customerId)) {
          throw new Error("SISCA evidence belongs to another Rewards journey");
        }
        productFactId = existingFact?.id ?? this.generateId();
        if (!existingFact) {
          await client.query(`
            INSERT INTO rewards_product_facts (
              id, account_id, customer_id, provider, product_type,
              external_reference, status, source, source_id, safe_evidence,
              accepted_at, activated_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, 'SISCA', 'AFORE', $4, 'ACTIVE', 'SISCA', $4,
              $5::jsonb, $6, $6, $7, $7
            )
          `, [
            productFactId,
            journey.account_id,
            command.customerId,
            productSourceId,
            JSON.stringify({
              evidenceReference: productSourceId,
              ruleVersionId: productEvidenceRule.id,
            }),
            command.validatedAfore.validatedAt,
            receivedAt,
          ]);
        } else if (existingFact.status !== "ACTIVE") {
          await client.query(`
            UPDATE rewards_product_facts
            SET status = 'ACTIVE', accepted_at = $2, activated_at = $2,
                ended_at = NULL, updated_at = $3,
                safe_evidence = safe_evidence || $4::jsonb
            WHERE id = $1
          `, [
            existingFact.id,
            command.validatedAfore.validatedAt,
            receivedAt,
            JSON.stringify({ ruleVersionId: productEvidenceRule.id }),
          ]);
        }
        await client.query(`
          INSERT INTO rewards_product_fact_events (
            id, product_fact_id, from_status, to_status, source, source_id,
            safe_evidence, occurred_at, received_at, created_at
          ) VALUES ($1, $2, $3, 'ACTIVE', 'SISCA', $4, $5::jsonb, $6, $7, $7)
          ON CONFLICT (source, source_id) DO NOTHING
        `, [
          this.generateId(),
          productFactId,
          existingFact?.status ?? null,
          productSourceId,
          JSON.stringify({ ruleVersionId: productEvidenceRule.id }),
          command.validatedAfore.validatedAt,
          receivedAt,
        ]);
      }

      const productAwardRule = await requireEnabledRule(
        client,
        "V2_INITIAL_PRODUCT_ACTIVE",
        receivedAt,
      );
      await this.issueV2Award(client, {
        accountId: journey.account_id,
        customerId: command.customerId,
        rule: productAwardRule,
        source: "SISCA",
        sourceId: `v2-initial-product:${productSourceId}`,
        eventType: "V2_INITIAL_PRODUCT_ACTIVE",
        occurredAt: command.validatedAfore.validatedAt,
        issuedAt: receivedAt,
        safeMetadata: { productFactId },
      });

      const levelRule = await requireEnabledRule(
        client,
        "V2_FIRST_ACTIVE_PRODUCT_LEVEL",
        receivedAt,
      );
      if (journey.current_level === null) {
        const decisionKey = `v2-first-active-product:${productSourceId}`;
        await client.query(`
          INSERT INTO rewards_level_decisions (
            id, journey_id, rule_version_id, previous_level, resulting_level,
            trigger_type, trigger_id, decision_inputs, reason_code,
            idempotency_key, decided_at, created_at
          ) VALUES (
            $1, $2, $3, NULL, 'BRONZE', 'SISCA_VALIDATION', $4,
            $5::jsonb, 'FIRST_ACTIVE_PRODUCT', $6, $7, $7
          ) ON CONFLICT (idempotency_key) DO NOTHING
        `, [
          this.generateId(),
          journey.journey_id,
          levelRule.id,
          productSourceId,
          JSON.stringify({ activeProductCount: 1, productFactId }),
          decisionKey,
          command.validatedAfore.validatedAt,
        ]);
      }
      await client.query(`
        UPDATE rewards_v2_journeys
        SET state = 'ACTIVE',
            current_level = COALESCE(current_level, 'BRONZE'),
            redemption_eligible = false,
            last_evaluated_at = $2,
            updated_at = $2
        WHERE id = $1
      `, [journey.journey_id, receivedAt]);
      await client.query(`
        UPDATE rewards_accounts
        SET status = 'ACTIVE', updated_at = $2
        WHERE id = $1
      `, [journey.account_id, receivedAt]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureInvitedInTransaction(
    client: PoolClient,
    command: EnsureInvitedJourneyCommand,
  ): Promise<AccountJourneyRow> {
    const issuedAt = this.clock.now();
    requireInstant("issuedAt", issuedAt);
    const rule = await requireEnabledRule(
      client,
      "V2_INVITED_REGISTRATION",
      issuedAt,
    );
    const proposedAccountId = this.generateId();
    await client.query(`
      INSERT INTO rewards_accounts (
        id, customer_id, status, activated_at, available_points,
        reserved_points, created_at, updated_at
      ) VALUES ($1, $2, 'ACTIVE', $3, 0, 0, $3, $3)
      ON CONFLICT (customer_id) DO NOTHING
    `, [proposedAccountId, command.customerId, command.registeredAt]);
    const account = (await client.query<{ id: string }>(`
      SELECT id::text FROM rewards_accounts WHERE customer_id = $1 FOR UPDATE
    `, [command.customerId])).rows[0];
    if (!account) throw new Error("Rewards account was not found after invited creation");

    const proposedJourneyId = this.generateId();
    await client.query(`
      INSERT INTO rewards_v2_journeys (
        id, account_id, customer_id, state, current_level,
        redemption_eligible, registered_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'INVITED', NULL, false, $4, $4, $4)
      ON CONFLICT (customer_id) DO NOTHING
    `, [proposedJourneyId, account.id, command.customerId, command.registeredAt]);
    const journey = (await client.query<AccountJourneyRow>(`
      SELECT account_id::text, id::text AS journey_id, current_level
      FROM rewards_v2_journeys
      WHERE customer_id = $1
      FOR UPDATE
    `, [command.customerId])).rows[0];
    if (!journey || journey.account_id !== account.id) {
      throw new Error("Rewards journey was not found after invited creation");
    }

    await this.issueV2Award(client, {
      accountId: account.id,
      customerId: command.customerId,
      rule,
      source: "INTERNAL",
      sourceId: `v2-invited-registration:${command.customerId}`,
      eventType: "V2_INVITED_REGISTRATION",
      occurredAt: command.registeredAt,
      issuedAt,
      safeMetadata: { journeyId: journey.journey_id },
    });
    return journey;
  }

  private async issueV2Award(
    client: PoolClient,
    input: {
      accountId: string;
      customerId: CustomerId;
      rule: RuleRow;
      source: "INTERNAL" | "SISCA";
      sourceId: string;
      eventType: string;
      occurredAt: Date;
      issuedAt: Date;
      safeMetadata: Readonly<Record<string, unknown>>;
    },
  ): Promise<void> {
    const points = positiveIntegerSetting(input.rule, "points");
    const validityMonths = canonicalValidityMonths(input.rule);
    const eventId = this.generateId();
    const inserted = await client.query(`
      INSERT INTO reward_events (
        id, account_id, customer_id, rule_version_id, v2_rule_version_id,
        source, source_id, event_type, occurred_at, received_at,
        safe_metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10::jsonb, $9, $9
      ) ON CONFLICT (source, source_id) DO NOTHING
    `, [
      eventId,
      input.accountId,
      input.customerId,
      input.rule.id,
      input.source,
      normalizeSourceId(input.sourceId),
      input.eventType,
      input.occurredAt,
      input.issuedAt,
      JSON.stringify(input.safeMetadata),
    ]);
    if (inserted.rowCount === 0) return;

    const ledgerEntryId = this.generateId();
    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, reward_event_id, rule_version_id, v2_rule_version_id,
        entry_type, points_delta, idempotency_key, correlation_id,
        actor_type, reason_code, created_at
      ) VALUES ($1, $2, $3, NULL, $4, 'ISSUANCE', $5, $6, $7, 'SYSTEM', $8, $9)
    `, [
      ledgerEntryId,
      input.accountId,
      eventId,
      input.rule.id,
      points.toString(),
      normalizeSourceId(input.sourceId),
      this.generateId(),
      input.eventType,
      input.issuedAt,
    ]);
    const lotId = this.generateId();
    const expiration = addUtcMonths(input.issuedAt, validityMonths);
    await client.query(`
      INSERT INTO point_lots (
        id, account_id, source_ledger_entry_id, issued_points,
        remaining_points, issued_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $4, $5, $6, $5, $5)
    `, [lotId, input.accountId, ledgerEntryId, points.toString(), input.issuedAt, expiration]);
    await client.query(`
      INSERT INTO scheduled_rewards_jobs (
        id, job_type, business_key, due_at, status, safe_payload,
        created_at, updated_at
      ) VALUES ($1, 'POINT_EXPIRATION', $2, $3, 'PENDING', $4::jsonb, $5, $5)
      ON CONFLICT (job_type, business_key) DO NOTHING
    `, [
      this.generateId(),
      lotId,
      expiration,
      JSON.stringify({ lotId, accountId: input.accountId }),
      input.issuedAt,
    ]);
    await client.query(`
      UPDATE rewards_accounts
      SET available_points = available_points + $2, updated_at = $3
      WHERE id = $1
    `, [input.accountId, points.toString(), input.issuedAt]);
  }
}

async function requireEnabledRule(
  client: PoolClient,
  code: string,
  effectiveAt: Date,
): Promise<RuleRow> {
  const row = (await client.query<RuleRow>(`
    SELECT id::text, code, approved_for_production, settings
    FROM rewards_v2_rule_versions
    WHERE code = $1 AND enabled = true
      AND effective_from <= $2
      AND (effective_to IS NULL OR effective_to > $2)
    ORDER BY version DESC
    LIMIT 1
  `, [code, effectiveAt])).rows[0];
  if (!row) throw new Error(`${code} is not enabled for the V2 live journey`);
  if (!row.approved_for_production) {
    throw new Error(`${code} is not approved for the canonical V2 journey`);
  }
  return row;
}

function canonicalValidityMonths(rule: RuleRow): number {
  const productionValue = rule.settings.productionValidityMonths;
  if (Number.isInteger(productionValue) && (productionValue as number) > 0) {
    return productionValue as number;
  }
  return positiveIntegerSetting(rule, "testValidityMonths");
}

function positiveIntegerSetting(rule: RuleRow, key: string): number {
  const value = rule.settings[key];
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${rule.code}.${key} must be a positive integer`);
  }
  return value as number;
}

function normalizeSourceId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) throw new Error("Evidence source id is invalid");
  return normalized;
}

function requireInstant(label: string, value: Date): void {
  if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid instant`);
}

function addUtcMonths(value: Date, months: number): Date {
  const result = new Date(value.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
