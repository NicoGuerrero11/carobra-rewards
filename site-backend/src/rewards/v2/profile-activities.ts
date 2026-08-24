import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import { rewardsErrors } from "../shared/errors.js";
import type {
  CustomerId,
  ProfileActivityId,
  RewardsAccountId,
  RewardsV2RuleVersionId,
} from "../shared/identifiers.js";
import {
  normalizeActivityType,
  normalizeSource,
  normalizeSourceId,
  requireInstant,
  requireSafeObject,
} from "./domain.js";

export interface RecordProfileActivityCommand {
  accountId: RewardsAccountId;
  customerId: CustomerId;
  activityType: string;
  source: string;
  sourceId: string;
  qualifies: boolean;
  ruleVersionId?: RewardsV2RuleVersionId | null;
  safeMetadata?: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  receivedAt: Date;
}

export interface ProfileActivity {
  id: ProfileActivityId;
  accountId: RewardsAccountId;
  customerId: CustomerId;
  activityType: string;
  qualifies: boolean;
  ruleVersionId: RewardsV2RuleVersionId | null;
  occurredAt: Date;
  replayed: boolean;
}

export interface ProfileProgress {
  qualifyingActivityCount: number;
  qualifyingActivityTypes: readonly string[];
  lastQualifyingActivityAt: Date | null;
}

export interface ProfileActivityRepository {
  record(command: RecordProfileActivityCommand): Promise<ProfileActivity>;
  getProgress(customerId: CustomerId, from: Date | null): Promise<ProfileProgress>;
}

interface TransactionalDatabase {
  connect(): Promise<PoolClient>;
}

interface AccountRow extends QueryResultRow { customer_id: string }
interface ActivityRow extends QueryResultRow {
  id: string;
  account_id: string;
  customer_id: string;
  activity_type: string;
  source: string;
  source_id: string;
  qualifies: boolean;
  rule_version_id: string | null;
  occurred_at: Date;
}
interface ProgressRow extends QueryResultRow {
  qualifying_count: number;
  qualifying_types: string[];
  last_qualifying_at: Date | null;
}

export class PostgresProfileActivityRepository implements ProfileActivityRepository {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async record(command: RecordProfileActivityCommand): Promise<ProfileActivity> {
    const normalized = normalizeCommand(command);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text FROM rewards_accounts WHERE id = $1 FOR UPDATE
      `, [normalized.accountId])).rows[0];
      if (!account || account.customer_id !== normalized.customerId) {
        throw rewardsErrors.notEligible();
      }
      const inserted = await client.query(`
        INSERT INTO rewards_profile_activities (
          id, account_id, customer_id, activity_type, source, source_id,
          qualifies, rule_version_id, safe_metadata, occurred_at, received_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $11)
        ON CONFLICT (source, source_id) DO NOTHING
      `, [
        this.generateId(), normalized.accountId, normalized.customerId,
        normalized.activityType, normalized.source, normalized.sourceId,
        normalized.qualifies, normalized.ruleVersionId,
        JSON.stringify(normalized.safeMetadata), normalized.occurredAt,
        normalized.receivedAt,
      ]);
      const row = (await client.query<ActivityRow>(`
        SELECT id::text, account_id::text, customer_id::text, activity_type,
          source, source_id, qualifies, rule_version_id::text, occurred_at
        FROM rewards_profile_activities
        WHERE source = $1 AND source_id = $2
      `, [normalized.source, normalized.sourceId])).rows[0];
      if (!row) throw new Error("Profile activity was not persisted");
      if (row.account_id !== normalized.accountId
        || row.customer_id !== normalized.customerId
        || row.activity_type !== normalized.activityType
        || row.qualifies !== normalized.qualifies
        || row.rule_version_id !== normalized.ruleVersionId) {
        throw rewardsErrors.duplicateEvent();
      }
      await client.query("COMMIT");
      return mapActivity(row, inserted.rowCount === 0);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getProgress(customerId: CustomerId, from: Date | null): Promise<ProfileProgress> {
    if (from) requireInstant("from", from);
    const client = await this.database.connect();
    try {
      const row = (await client.query<ProgressRow>(`
        SELECT
          count(*)::integer AS qualifying_count,
          COALESCE(array_agg(DISTINCT activity_type ORDER BY activity_type), ARRAY[]::varchar[]) AS qualifying_types,
          max(occurred_at) AS last_qualifying_at
        FROM rewards_profile_activities
        WHERE customer_id = $1
          AND qualifies = true
          AND ($2::timestamptz IS NULL OR occurred_at >= $2)
      `, [customerId, from])).rows[0];
      return {
        qualifyingActivityCount: row?.qualifying_count ?? 0,
        qualifyingActivityTypes: row?.qualifying_types ?? [],
        lastQualifyingActivityAt: row?.last_qualifying_at ?? null,
      };
    } finally {
      client.release();
    }
  }
}

function normalizeCommand(command: RecordProfileActivityCommand) {
  requireInstant("occurredAt", command.occurredAt);
  requireInstant("receivedAt", command.receivedAt);
  if (command.receivedAt < command.occurredAt) {
    throw new Error("Profile activity cannot be received before it occurred");
  }
  const ruleVersionId = command.ruleVersionId ?? null;
  if (command.qualifies && !ruleVersionId) {
    throw new Error("Qualifying profile activity requires a rule version");
  }
  return {
    ...command,
    activityType: normalizeActivityType(command.activityType),
    source: normalizeSource(command.source),
    sourceId: normalizeSourceId(command.sourceId),
    ruleVersionId,
    safeMetadata: requireSafeObject("safeMetadata", command.safeMetadata),
  };
}

function mapActivity(row: ActivityRow, replayed: boolean): ProfileActivity {
  return {
    id: row.id as ProfileActivityId,
    accountId: row.account_id as RewardsAccountId,
    customerId: row.customer_id as CustomerId,
    activityType: row.activity_type,
    qualifies: row.qualifies,
    ruleVersionId: row.rule_version_id as RewardsV2RuleVersionId | null,
    occurredAt: row.occurred_at,
    replayed,
  };
}
