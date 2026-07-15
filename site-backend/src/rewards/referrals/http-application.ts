import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { CorrelationId, CustomerId, RewardsAccountId } from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";
import type { AttributeReferral } from "./attribution.js";
import { findEffectiveReferralLimitPolicy } from "./limit-policy.js";
import type { ConfirmReferralRegistration } from "./registration-award.js";

const referralTokenPattern = /^[A-Za-z0-9_-]{32,64}$/;

export interface CaptureReferralRegistrationCommand {
  token: string;
  referredCustomerId: CustomerId;
  registeredAt: Date;
}

export interface ReferralCaptureHttpResult {
  status: "REGISTERED" | "UNDER_REVIEW" | "IGNORED";
}

export interface ReferralProgressHttpItem {
  position: number;
  status: "INVITED" | "REGISTERED" | "ACTIVE" | "UNDER_REVIEW" | "NOT_ELIGIBLE";
  registration_completed: boolean;
  six_month_completed: boolean;
  twelve_month_completed: boolean;
}

export interface ReferralDashboardHttpResponse {
  invite_path: string;
  accepting_referrals: boolean;
  unavailable_reason: string | null;
  totals: {
    invited: number;
    registered: number;
    active: number;
    earned_points: string;
  };
  referrals: ReadonlyArray<ReferralProgressHttpItem>;
}

export interface ReferralHttpApplication {
  captureRegistration(
    command: CaptureReferralRegistrationCommand,
  ): Promise<ReferralCaptureHttpResult>;
  getDashboard(customerId: CustomerId): Promise<ReferralDashboardHttpResponse>;
}

export interface ResolvedReferralLink {
  referringAccountId: RewardsAccountId;
  referringCustomerId: CustomerId;
}

export interface ReferralCustomerExperiencePort {
  resolveActiveLink(token: string): Promise<ResolvedReferralLink | null>;
  getOrCreateDashboard(
    customerId: CustomerId,
    observedAt: Date,
  ): Promise<ReferralDashboardHttpResponse>;
}

export class DefaultReferralHttpApplication implements ReferralHttpApplication {
  constructor(
    private readonly experience: ReferralCustomerExperiencePort,
    private readonly attribution: AttributeReferral,
    private readonly registration: ConfirmReferralRegistration,
    private readonly clock: Clock,
    private readonly identityHmacSecret: string,
    private readonly generateCorrelationId: () => string = randomUUID,
  ) {
    if (Buffer.byteLength(identityHmacSecret, "utf8") < 32) {
      throw new Error("Referral identity HMAC secret must contain at least 32 bytes");
    }
  }

  async captureRegistration(
    command: CaptureReferralRegistrationCommand,
  ): Promise<ReferralCaptureHttpResult> {
    requireIdentifier(command.referredCustomerId);
    if (!isReferralToken(command.token)) return { status: "IGNORED" };
    if (Number.isNaN(command.registeredAt.getTime())) {
      throw new Error("Referral registration time must be valid");
    }
    const link = await this.experience.resolveActiveLink(command.token);
    if (!link) return { status: "IGNORED" };

    const attribution = await this.attribution.attribute({
      referringAccountId: link.referringAccountId,
      referredCustomerId: command.referredCustomerId,
      referringIdentityHash: identityHash(this.identityHmacSecret, link.referringCustomerId),
      referredIdentityHash: identityHash(this.identityHmacSecret, command.referredCustomerId),
      source: "REFERRAL_LINK",
      sourceId: `referral-link-registration:${command.referredCustomerId}`,
      correlationId: this.generateCorrelationId() as CorrelationId,
    });
    if (attribution.status === "HELD_FOR_REVIEW") return { status: "UNDER_REVIEW" };
    if (attribution.status === "ACTIVE") return { status: "REGISTERED" };

    await this.registration.confirm({
      referralId: attribution.referralId,
      referredCustomerId: command.referredCustomerId,
      registrationEvidenceId: `site-registration:${command.referredCustomerId}`,
      registeredAt: command.registeredAt,
    });
    return { status: "REGISTERED" };
  }

  getDashboard(customerId: CustomerId): Promise<ReferralDashboardHttpResponse> {
    requireIdentifier(customerId);
    return this.experience.getOrCreateDashboard(customerId, this.clock.now());
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface AccountRow extends QueryResultRow { id: string; customer_id: string }
interface LinkRow extends QueryResultRow { token: string }
interface ProgressRow extends QueryResultRow {
  status: string;
  registration_completed: boolean;
  six_month_completed: boolean;
  twelve_month_completed: boolean;
}

export class PostgresReferralCustomerExperience implements ReferralCustomerExperiencePort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
    private readonly generateToken: () => string = () => randomBytes(32).toString("base64url"),
  ) {}

  async resolveActiveLink(token: string): Promise<ResolvedReferralLink | null> {
    if (!isReferralToken(token)) return null;
    const client = await this.database.connect();
    try {
      const row = (await client.query<AccountRow>(`
        SELECT account.id::text AS id, account.customer_id::text
        FROM referral_invitation_links link
        JOIN rewards_accounts account ON account.id = link.account_id
        WHERE link.token = $1 AND link.status = 'ACTIVE' AND account.status = 'ACTIVE'
      `, [token])).rows[0];
      return row ? {
        referringAccountId: row.id as RewardsAccountId,
        referringCustomerId: row.customer_id as CustomerId,
      } : null;
    } finally {
      client.release();
    }
  }

  async getOrCreateDashboard(
    customerId: CustomerId,
    observedAt: Date,
  ): Promise<ReferralDashboardHttpResponse> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const account = (await client.query<AccountRow>(`
        SELECT id::text, customer_id::text
        FROM rewards_accounts
        WHERE customer_id = $1 AND status = 'ACTIVE'
        FOR UPDATE
      `, [customerId])).rows[0];
      if (!account) throw new Error("Active Rewards account was not found");

      await client.query(`
        INSERT INTO referral_invitation_links (
          id, account_id, token, status, created_at, updated_at
        ) VALUES ($1, $2, $3, 'ACTIVE', $4, $4)
        ON CONFLICT (account_id) DO NOTHING
      `, [this.generateId(), account.id, this.generateToken(), observedAt]);
      const link = (await client.query<LinkRow>(`
        SELECT token FROM referral_invitation_links
        WHERE account_id = $1 AND status = 'ACTIVE'
      `, [account.id])).rows[0];
      if (!link) throw new Error("Active referral invitation link was not found");

      const policy = await findEffectiveReferralLimitPolicy(client, observedAt);
      const acceptingReferrals = Boolean(
        policy?.enabled && policy.monthlyLimit && policy.businessTimezone
          && policy.excessOutcome && policy.approvedBy && policy.approvedAt,
      );
      const progress = (await client.query<ProgressRow>(`
        SELECT referral.status,
          EXISTS (
            SELECT 1 FROM reward_events event
            WHERE event.source_id = 'referral-registration:' || referral.id::text
          ) AS registration_completed,
          EXISTS (
            SELECT 1 FROM reward_events event
            WHERE event.source_id = 'referral-permanence:' || referral.id::text || ':6m'
          ) AS six_month_completed,
          EXISTS (
            SELECT 1 FROM reward_events event
            WHERE event.source_id = 'referral-permanence:' || referral.id::text || ':12m'
          ) AS twelve_month_completed
        FROM referrals referral
        WHERE referral.referring_account_id = $1
        ORDER BY referral.attributed_at, referral.id
      `, [account.id])).rows;
      const earned = (await client.query<{ points: string }>(`
        SELECT coalesce(sum(entry.points_delta), 0)::text AS points
        FROM ledger_entries entry
        JOIN behavior_rule_versions rule ON rule.id = entry.rule_version_id
        WHERE entry.account_id = $1
          AND rule.code IN (
            'REFERRAL_REGISTRATION',
            'REFERRAL_PERMANENCE_6_MONTHS',
            'REFERRAL_PERMANENCE_12_MONTHS'
          )
      `, [account.id])).rows[0]?.points ?? "0";
      await client.query("COMMIT");

      return {
        invite_path: `/registro?ref=${link.token}`,
        accepting_referrals: acceptingReferrals,
        unavailable_reason: acceptingReferrals
          ? null
          : "El programa de referidos aún no está habilitado.",
        totals: {
          invited: progress.filter((row) => row.status !== "REJECTED").length,
          registered: progress.filter((row) => row.registration_completed).length,
          active: progress.filter((row) => row.status === "ACTIVE").length,
          earned_points: earned,
        },
        referrals: progress.map((row, index) => ({
          position: index + 1,
          status: safeProgressStatus(row.status),
          registration_completed: row.registration_completed,
          six_month_completed: row.six_month_completed,
          twelve_month_completed: row.twelve_month_completed,
        })),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function isReferralToken(value: string): boolean {
  return referralTokenPattern.test(value);
}

export function identityHash(secret: string, customerId: CustomerId): string {
  return createHmac("sha256", secret).update(customerId).digest("hex");
}

function safeProgressStatus(status: string): ReferralProgressHttpItem["status"] {
  if (status === "ATTRIBUTED") return "INVITED";
  if (status === "REGISTERED") return "REGISTERED";
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "HELD_FOR_REVIEW") return "UNDER_REVIEW";
  return "NOT_ELIGIBLE";
}
