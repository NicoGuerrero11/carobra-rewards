import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import {
  findEffectiveBehaviorRule,
  requireEnabledBehaviorRule,
} from "../behaviors/rule-lookup.js";
import type {
  CustomerId,
  RewardEventId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import { scheduleExpirationNotificationCohortInTransaction } from "../operations/expiration-notifications.js";

export interface ActivateValidatedCustomerCommand {
  customerId: CustomerId;
  validatedAt: Date;
}

export interface RewardsActivationResult {
  accountId: RewardsAccountId;
  rewardEventId: RewardEventId;
  accountCreated: boolean;
  registrationAwardIssued: boolean;
  availablePoints: bigint;
}

export interface RewardsAccountActivationPort {
  activateValidatedCustomer(
    command: ActivateValidatedCustomerCommand & { activatedAt: Date },
  ): Promise<RewardsActivationResult>;
}

export class ActivateRewardsAccount {
  constructor(
    private readonly activation: RewardsAccountActivationPort,
    private readonly clock: Clock,
  ) {}

  execute(command: ActivateValidatedCustomerCommand): Promise<RewardsActivationResult> {
    return this.activation.activateValidatedCustomer({
      ...command,
      activatedAt: this.clock.now(),
    });
  }
}

interface TransactionalDatabase {
  connect(): Promise<PoolClient>;
}

interface AccountRow extends QueryResultRow {
  id: string;
  available_points: string;
}

interface EventRow extends QueryResultRow {
  id: string;
}

export class PostgresRewardsAccountActivation implements RewardsAccountActivationPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async activateValidatedCustomer(
    command: ActivateValidatedCustomerCommand & { activatedAt: Date },
  ): Promise<RewardsActivationResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await this.activateInTransaction(client, command);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async activateInTransaction(
    client: PoolClient,
    command: ActivateValidatedCustomerCommand & { activatedAt: Date },
  ): Promise<RewardsActivationResult> {
    const rule = requireEnabledBehaviorRule(
      await findEffectiveBehaviorRule(
        client,
        "REGISTRATION_ACTIVATION",
        command.activatedAt,
        true,
      ),
      "REGISTRATION_ACTIVATION",
    );

    const proposedAccountId = this.generateId();
    const insertedAccount = await client.query<AccountRow>(`
      INSERT INTO rewards_accounts (
        id, customer_id, status, activated_at, available_points, reserved_points,
        created_at, updated_at
      ) VALUES ($1, $2, 'ACTIVE', $3, 0, 0, $3, $3)
      ON CONFLICT (customer_id) DO NOTHING
      RETURNING id::text, available_points::text
    `, [proposedAccountId, command.customerId, command.activatedAt]);
    const accountCreated = insertedAccount.rowCount === 1;
    const account = insertedAccount.rows[0] ?? await selectAccount(client, command.customerId);

    const sourceId = `rewards-account-activation:${command.customerId}`;
    const proposedEventId = this.generateId();
    const insertedEvent = await client.query<EventRow>(`
      INSERT INTO reward_events (
        id, account_id, customer_id, rule_version_id, source, source_id,
        event_type, occurred_at, received_at, safe_metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'INTERNAL', $5,
        'REGISTRATION_ACTIVATION', $6, $7, '{}'::jsonb, $7, $7
      )
      ON CONFLICT (source, source_id) DO NOTHING
      RETURNING id::text
    `, [
      proposedEventId,
      account.id,
      command.customerId,
      rule.id,
      sourceId,
      command.validatedAt,
      command.activatedAt,
    ]);
    const registrationAwardIssued = insertedEvent.rowCount === 1;
    const event = insertedEvent.rows[0] ?? await selectActivationEvent(client, sourceId);

    if (registrationAwardIssued) {
      const ledgerEntryId = this.generateId();
      const correlationId = this.generateId();
      const points = rule.pointValue;
      await client.query(`
        INSERT INTO ledger_entries (
          id, account_id, reward_event_id, rule_version_id, entry_type,
          points_delta, idempotency_key, correlation_id, actor_type,
          reason_code, created_at
        ) VALUES (
          $1, $2, $3, $4, 'ISSUANCE', $5,
          $6, $7, 'SYSTEM', 'REGISTRATION_ACTIVATION', $8
        )
      `, [
        ledgerEntryId,
        account.id,
        event.id,
        rule.id,
        points.toString(),
        sourceId,
        correlationId,
        command.activatedAt,
      ]);
      const lotId = this.generateId();
      const insertedLot = await client.query<{ expires_at: Date }>(`
        INSERT INTO point_lots (
          id, account_id, source_ledger_entry_id, issued_points, remaining_points,
          issued_at, expires_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $4, $5,
          CASE
            WHEN $6 = 'CAMPAIGN_90_DAYS' THEN $5::timestamptz + INTERVAL '90 days'
            ELSE $5::timestamptz + INTERVAL '18 months'
          END,
          $5, $5
        )
        RETURNING expires_at
      `, [
        lotId,
        account.id,
        ledgerEntryId,
        points.toString(),
        command.activatedAt,
        rule.validityPolicy,
      ]);
      const expiresAt = insertedLot.rows[0]?.expires_at;
      if (!expiresAt) throw new Error("Registration lot expiration was not persisted");
      await client.query(`
        INSERT INTO scheduled_rewards_jobs (
          id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
        ) VALUES ($1, 'POINT_EXPIRATION', $2, $3, 'PENDING', $4::jsonb, $5, $5)
        ON CONFLICT (job_type, business_key) DO NOTHING
      `, [
        this.generateId(),
        lotId,
        expiresAt,
        JSON.stringify({ lotId, accountId: account.id }),
        command.activatedAt,
      ]);
      await scheduleExpirationNotificationCohortInTransaction(
        client,
        { accountId: account.id as RewardsAccountId, expiresAt },
        command.activatedAt,
        this.generateId,
      );
      await client.query(`
        UPDATE rewards_accounts
        SET available_points = available_points + $2, updated_at = $3
        WHERE id = $1
      `, [account.id, points.toString(), command.activatedAt]);
    }

    const currentAccount = await selectAccount(client, command.customerId);
    return {
      accountId: currentAccount.id as RewardsAccountId,
      rewardEventId: event.id as RewardEventId,
      accountCreated,
      registrationAwardIssued,
      availablePoints: BigInt(currentAccount.available_points),
    };
  }
}

async function selectAccount(client: PoolClient, customerId: CustomerId): Promise<AccountRow> {
  return requireSingleRow(await client.query<AccountRow>(`
    SELECT id::text, available_points::text
    FROM rewards_accounts
    WHERE customer_id = $1
    FOR UPDATE
  `, [customerId]), "Rewards account was not found after activation");
}

async function selectActivationEvent(client: PoolClient, sourceId: string): Promise<EventRow> {
  return requireSingleRow(await client.query<EventRow>(`
    SELECT id::text
    FROM reward_events
    WHERE source = 'INTERNAL' AND source_id = $1
  `, [sourceId]), "Registration activation event was not found after replay");
}

function requireSingleRow<TRow extends QueryResultRow>(
  result: QueryResult<TRow>,
  message: string,
): TRow {
  const row = result.rows[0];
  if (!row) throw new Error(message);
  return row;
}
