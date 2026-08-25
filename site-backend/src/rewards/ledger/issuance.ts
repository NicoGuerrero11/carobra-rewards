import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import {
  findEffectiveBehaviorRule,
  requireEnabledBehaviorRule,
} from "../behaviors/rule-lookup.js";
import type {
  LedgerEntryId,
  PointLotId,
  RewardEventId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import type { NormalizedRewardEvent } from "./reward-event.js";
import { scheduleExpirationNotificationCohortInTransaction } from "../operations/expiration-notifications.js";

export interface IssuePointsCommand {
  accountId: RewardsAccountId;
  ruleCode: string;
  event: NormalizedRewardEvent;
}

export interface PointIssuanceResult {
  eventId: RewardEventId;
  ledgerEntryId: LedgerEntryId;
  lotId: PointLotId;
  points: bigint;
  availablePoints: bigint;
  replayed: boolean;
}

export interface PointIssuancePort {
  issue(command: IssuePointsCommand & { issuedAt: Date }): Promise<PointIssuanceResult>;
}

export interface TransactionalPointIssuancePort extends PointIssuancePort {
  issueInTransaction(
    client: PoolClient,
    command: IssuePointsCommand & { issuedAt: Date },
  ): Promise<PointIssuanceResult>;
}

export class IssuePoints {
  constructor(
    private readonly issuance: PointIssuancePort,
    private readonly clock: Clock,
  ) {}

  execute(command: IssuePointsCommand): Promise<PointIssuanceResult> {
    return this.issuance.issue({ ...command, issuedAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { id: string; customer_id: string; available_points: string }
interface EventRow extends QueryResultRow {
  id: string;
  account_id: string;
  customer_id: string;
  event_type: string;
}
interface ReplayRow extends QueryResultRow {
  ledger_entry_id: string;
  lot_id: string;
  points: string;
}

export class PostgresPointIssuance implements PointIssuancePort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async issue(command: IssuePointsCommand & { issuedAt: Date }): Promise<PointIssuanceResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await this.issueInTransaction(client, command);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async issueInTransaction(
    client: PoolClient,
    command: IssuePointsCommand & { issuedAt: Date },
  ): Promise<PointIssuanceResult> {
    const account = (await client.query<AccountRow>(`
      SELECT id::text, customer_id::text, available_points::text
      FROM rewards_accounts
      WHERE id = $1
      FOR UPDATE
    `, [command.accountId])).rows[0];
    if (!account || account.customer_id !== command.event.customerId) {
      throw rewardsErrors.notEligible();
    }

    const rule = requireEnabledBehaviorRule(
      await findEffectiveBehaviorRule(client, command.ruleCode, command.event.occurredAt, true),
      command.ruleCode,
    );

    const proposedEventId = this.generateId();
    const insertedEvent = await client.query<EventRow>(`
      INSERT INTO reward_events (
        id, account_id, customer_id, rule_version_id, source, source_id,
        event_type, occurred_at, received_at, service_id, product_contract_id,
        safe_metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $13)
      ON CONFLICT (source, source_id) DO NOTHING
      RETURNING id::text, account_id::text, customer_id::text, event_type
    `, [
      proposedEventId,
      command.accountId,
      command.event.customerId,
      rule.id,
      command.event.source,
      command.event.sourceId,
      command.event.eventType,
      command.event.occurredAt,
      command.event.receivedAt,
      command.event.serviceId,
      command.event.productContractId,
      JSON.stringify(command.event.safeMetadata),
      command.issuedAt,
    ]);
    const event = insertedEvent.rows[0] ?? (await client.query<EventRow>(`
      SELECT id::text, account_id::text, customer_id::text, event_type
      FROM reward_events WHERE source = $1 AND source_id = $2
    `, [command.event.source, command.event.sourceId])).rows[0];
    if (!event) throw new Error("Reward event was not found after upsert");
    if (
      event.account_id !== command.accountId ||
      event.customer_id !== command.event.customerId ||
      event.event_type !== command.event.eventType
    ) {
      throw rewardsErrors.duplicateEvent();
    }

    if (insertedEvent.rowCount === 0) {
      const replay = (await client.query<ReplayRow>(`
        SELECT
          entry.id::text AS ledger_entry_id,
          lot.id::text AS lot_id,
          entry.points_delta::text AS points
        FROM ledger_entries AS entry
        JOIN point_lots AS lot ON lot.source_ledger_entry_id = entry.id
        WHERE entry.reward_event_id = $1
      `, [event.id])).rows[0];
      if (!replay) throw new Error("Committed reward event is missing its issuance records");
      return {
        eventId: event.id as RewardEventId,
        ledgerEntryId: replay.ledger_entry_id as LedgerEntryId,
        lotId: replay.lot_id as PointLotId,
        points: BigInt(replay.points),
        availablePoints: BigInt(account.available_points),
        replayed: true,
      };
    }

    const points = rule.pointValue;
    const ledgerEntryId = this.generateId();
    const lotId = this.generateId();
    await client.query(`
      INSERT INTO ledger_entries (
        id, account_id, reward_event_id, rule_version_id, entry_type,
        points_delta, idempotency_key, correlation_id, actor_type, created_at
      ) VALUES ($1, $2, $3, $4, 'ISSUANCE', $5, $6, $7, 'SYSTEM', $8)
    `, [
      ledgerEntryId,
      command.accountId,
      event.id,
      rule.id,
      points.toString(),
      command.event.sourceIdentity,
      this.generateId(),
      command.issuedAt,
    ]);
    const insertedLot = await client.query<{ expires_at: Date }>(`
      INSERT INTO point_lots (
        id, account_id, source_ledger_entry_id, issued_points, remaining_points,
        issued_at, expires_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $4, $5,
        CASE WHEN $6 = 'CAMPAIGN_90_DAYS'
          THEN $5::timestamptz + INTERVAL '90 days'
          ELSE $5::timestamptz + INTERVAL '18 months'
        END,
        $5, $5
      )
      RETURNING expires_at
    `, [lotId, command.accountId, ledgerEntryId, points.toString(), command.issuedAt, rule.validityPolicy]);
    const expiresAt = insertedLot.rows[0]?.expires_at;
    if (!expiresAt) throw new Error("Point lot expiration was not persisted");
    await client.query(`
      INSERT INTO scheduled_rewards_jobs (
        id, job_type, business_key, due_at, status, safe_payload, created_at, updated_at
      ) VALUES ($1, 'POINT_EXPIRATION', $2, $3, 'PENDING', $4::jsonb, $5, $5)
      ON CONFLICT (job_type, business_key) DO NOTHING
    `, [
      this.generateId(),
      lotId,
      expiresAt,
      JSON.stringify({ lotId, accountId: command.accountId }),
      command.issuedAt,
    ]);
    await scheduleExpirationNotificationCohortInTransaction(
      client,
      { accountId: command.accountId, expiresAt },
      command.issuedAt,
      this.generateId,
    );
    const updated = (await client.query<{ available_points: string }>(`
      UPDATE rewards_accounts
      SET available_points = available_points + $2, updated_at = $3
      WHERE id = $1
      RETURNING available_points::text
    `, [command.accountId, points.toString(), command.issuedAt])).rows[0];
    if (!updated) throw new Error("Rewards balance was not updated after issuance");
    return {
      eventId: event.id as RewardEventId,
      ledgerEntryId: ledgerEntryId as LedgerEntryId,
      lotId: lotId as PointLotId,
      points,
      availablePoints: BigInt(updated.available_points),
      replayed: false,
    };
  }
}
