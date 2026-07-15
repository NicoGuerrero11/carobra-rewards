import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CorrelationId,
  CustomerId,
  ReferralId,
  ReferralLimitPolicyVersionId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";
import {
  findEffectiveReferralLimitPolicy,
  requireEnabledReferralLimitPolicy,
} from "./limit-policy.js";

export interface AttributeReferralCommand {
  referringAccountId: RewardsAccountId;
  referredCustomerId: CustomerId | null;
  referringIdentityHash: string;
  referredIdentityHash: string;
  source: string;
  sourceId: string;
  correlationId: CorrelationId;
}

export type ReferralReviewReason = "ATTRIBUTION_CONFLICT" | "MONTHLY_LIMIT_EXCEEDED";

export interface ReferralAttributionResult {
  referralId: ReferralId;
  status: "ATTRIBUTED" | "REGISTERED" | "ACTIVE" | "HELD_FOR_REVIEW";
  replayed: boolean;
  reviewReason: ReferralReviewReason | null;
}

export interface ReferralAttributionPort {
  attribute(
    command: AttributeReferralCommand & { attributedAt: Date },
  ): Promise<ReferralAttributionResult>;
}

export class AttributeReferral {
  constructor(
    private readonly referrals: ReferralAttributionPort,
    private readonly clock: Clock,
  ) {}

  attribute(command: AttributeReferralCommand): Promise<ReferralAttributionResult> {
    requireIdentifier(command.referringAccountId);
    if (command.referredCustomerId !== null) requireIdentifier(command.referredCustomerId);
    requireIdentityHash(command.referringIdentityHash);
    requireIdentityHash(command.referredIdentityHash);
    requireIdentifier(command.source);
    requireIdentifier(command.sourceId);
    requireIdentifier(command.correlationId);
    if (command.referringIdentityHash === command.referredIdentityHash) {
      throw rewardsErrors.selfReferral();
    }
    return this.referrals.attribute({ ...command, attributedAt: this.clock.now() });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }

interface AccountRow extends QueryResultRow { customer_id: string }
interface ReferralRow extends QueryResultRow {
  id: string;
  referring_account_id: string;
  referring_customer_id: string;
  referred_customer_id: string | null;
  referred_identity_hash: string;
  status: string;
  rejection_reason: string | null;
}

export class PostgresReferralAttributions implements ReferralAttributionPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  attribute(
    command: AttributeReferralCommand & { attributedAt: Date },
  ): Promise<ReferralAttributionResult> {
    return this.transaction(async (client) => {
      const replay = await findSourceReplay(client, command.source, command.sourceId);
      if (replay) return mapReplay(replay, command);

      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text
        FROM rewards_accounts
        WHERE id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [command.referringAccountId])).rows[0];
      if (!account) throw rewardsErrors.notEligible();
      if (command.referredCustomerId === account.customer_id
        || command.referringIdentityHash === command.referredIdentityHash) {
        throw rewardsErrors.selfReferral();
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [command.referredIdentityHash],
      );
      const existing = await findAcceptedAttribution(
        client,
        command.referredIdentityHash,
        command.referredCustomerId,
      );
      if (existing) {
        if (sameAttribution(existing, command)) {
          return {
            referralId: existing.id as ReferralId,
            status: existing.status as "ATTRIBUTED" | "REGISTERED" | "ACTIVE",
            replayed: true,
            reviewReason: null,
          };
        }
        return this.createHeldReferral(client, command, account.customer_id as CustomerId,
          null, "ATTRIBUTION_CONFLICT");
      }

      const policy = requireEnabledReferralLimitPolicy(
        await findEffectiveReferralLimitPolicy(client, command.attributedAt, true),
      );
      const count = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM referrals
        WHERE referring_account_id = $1
          AND status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE')
          AND date_trunc('month', attributed_at AT TIME ZONE $3)
            = date_trunc('month', $2::timestamptz AT TIME ZONE $3)
      `, [command.referringAccountId, command.attributedAt, policy.businessTimezone]);
      if (Number(count.rows[0]?.count ?? "0") >= policy.monthlyLimit) {
        if (policy.excessOutcome === "REJECT") throw rewardsErrors.referralMonthlyLimitReached();
        return this.createHeldReferral(client, command, account.customer_id as CustomerId,
          policy.id, "MONTHLY_LIMIT_EXCEEDED");
      }

      const referralId = this.generateId() as ReferralId;
      await insertReferral(client, referralId, command, account.customer_id as CustomerId,
        policy.id, "ATTRIBUTED", null);
      return { referralId, status: "ATTRIBUTED", replayed: false, reviewReason: null };
    });
  }

  private async createHeldReferral(
    client: PoolClient,
    command: AttributeReferralCommand & { attributedAt: Date },
    referringCustomerId: CustomerId,
    policyVersionId: ReferralLimitPolicyVersionId | null,
    reason: ReferralReviewReason,
  ): Promise<ReferralAttributionResult> {
    const referralId = this.generateId() as ReferralId;
    await insertReferral(client, referralId, command, referringCustomerId,
      policyVersionId, "HELD_FOR_REVIEW", reason);
    await client.query(`
      INSERT INTO rewards_review_flags (
        id, flag_type, subject_type, subject_id, status, severity,
        safe_reason_code, safe_evidence, correlation_id,
        opened_at, created_at, updated_at
      ) VALUES (
        $1, 'REFERRAL_ATTRIBUTION', 'REFERRAL', $2, 'OPEN', 'MEDIUM',
        $3, $4::jsonb, $5, $6, $6, $6
      )
    `, [this.generateId(), referralId, reason,
      JSON.stringify({ policyVersionId }), command.correlationId, command.attributedAt]);
    return {
      referralId,
      status: "HELD_FOR_REVIEW",
      replayed: false,
      reviewReason: reason,
    };
  }

  private async transaction<TResult>(
    operation: (client: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function findSourceReplay(
  client: PoolClient,
  source: string,
  sourceId: string,
): Promise<ReferralRow | undefined> {
  return (await client.query<ReferralRow>(`
    SELECT id::text, referring_account_id::text, referring_customer_id::text,
      referred_customer_id::text, referred_identity_hash, status, rejection_reason
    FROM referrals WHERE source = $1 AND source_id = $2
  `, [source, sourceId])).rows[0];
}

async function findAcceptedAttribution(
  client: PoolClient,
  identityHash: string,
  referredCustomerId: CustomerId | null,
): Promise<ReferralRow | undefined> {
  return (await client.query<ReferralRow>(`
    SELECT id::text, referring_account_id::text, referring_customer_id::text,
      referred_customer_id::text, referred_identity_hash, status, rejection_reason
    FROM referrals
    WHERE status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE')
      AND (
        referred_identity_hash = $1 OR
        ($2::uuid IS NOT NULL AND referred_customer_id = $2)
      )
    ORDER BY attributed_at, id
    LIMIT 1
    FOR UPDATE
  `, [identityHash, referredCustomerId])).rows[0];
}

async function insertReferral(
  client: PoolClient,
  referralId: ReferralId,
  command: AttributeReferralCommand & { attributedAt: Date },
  referringCustomerId: CustomerId,
  policyVersionId: ReferralLimitPolicyVersionId | null,
  status: "ATTRIBUTED" | "HELD_FOR_REVIEW",
  rejectionReason: ReferralReviewReason | null,
): Promise<void> {
  await client.query(`
    INSERT INTO referrals (
      id, referring_account_id, referring_customer_id, referred_customer_id,
      referred_identity_hash, source, source_id, status, attributed_at,
      rejection_reason, limit_policy_version_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $9, $9)
  `, [referralId, command.referringAccountId, referringCustomerId,
    command.referredCustomerId, command.referredIdentityHash, command.source,
    command.sourceId, status, command.attributedAt, rejectionReason, policyVersionId]);
}

function mapReplay(
  replay: ReferralRow,
  command: AttributeReferralCommand,
): ReferralAttributionResult {
  if (replay.referring_account_id !== command.referringAccountId
    || replay.referred_customer_id !== command.referredCustomerId
    || replay.referred_identity_hash !== command.referredIdentityHash) {
    throw rewardsErrors.duplicateEvent();
  }
  if (!acceptedStatuses.includes(replay.status as AcceptedReferralStatus)
    && replay.status !== "HELD_FOR_REVIEW") {
    throw rewardsErrors.invalidTransition();
  }
  return {
    referralId: replay.id as ReferralId,
    status: replay.status as ReferralAttributionResult["status"],
    replayed: true,
    reviewReason: replay.rejection_reason as ReferralReviewReason | null,
  };
}

type AcceptedReferralStatus = "ATTRIBUTED" | "REGISTERED" | "ACTIVE";
const acceptedStatuses: readonly AcceptedReferralStatus[] = ["ATTRIBUTED", "REGISTERED", "ACTIVE"];

function sameAttribution(
  existing: ReferralRow,
  command: AttributeReferralCommand,
): boolean {
  return existing.referring_account_id === command.referringAccountId
    && existing.referred_identity_hash === command.referredIdentityHash
    && (command.referredCustomerId === null
      || existing.referred_customer_id === null
      || existing.referred_customer_id === command.referredCustomerId);
}

function requireIdentityHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("Referral identity evidence must be a lowercase SHA-256 HMAC hash");
  }
}
