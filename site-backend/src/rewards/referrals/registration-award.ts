import type { PoolClient, QueryResultRow } from "pg";

import type { Clock } from "../shared/clock.js";
import type { PointIssuanceResult, TransactionalPointIssuancePort } from "../ledger/issuance.js";
import { normalizeRewardEvent } from "../ledger/reward-event.js";
import { rewardsErrors } from "../shared/errors.js";
import type { CustomerId, ReferralId, RewardsAccountId } from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";

export interface ConfirmReferralRegistrationCommand {
  referralId: ReferralId;
  referredCustomerId: CustomerId;
  registrationEvidenceId: string;
  registeredAt: Date;
}

export interface ReferralRegistrationAwardResult {
  referralId: ReferralId;
  status: "REGISTERED";
  award: PointIssuanceResult;
}

export interface ReferralRegistrationAwardPort {
  confirm(
    command: ConfirmReferralRegistrationCommand & { receivedAt: Date },
  ): Promise<ReferralRegistrationAwardResult>;
}

export class ConfirmReferralRegistration {
  constructor(
    private readonly registrations: ReferralRegistrationAwardPort,
    private readonly clock: Clock,
  ) {}

  confirm(command: ConfirmReferralRegistrationCommand): Promise<ReferralRegistrationAwardResult> {
    requireIdentifier(command.referralId);
    requireIdentifier(command.referredCustomerId);
    requireIdentifier(command.registrationEvidenceId);
    if (Number.isNaN(command.registeredAt.getTime())) {
      throw new Error("Referral registration time must be valid");
    }
    const receivedAt = this.clock.now();
    if (command.registeredAt > receivedAt) {
      throw new Error("Referral registration cannot be observed before it occurs");
    }
    return this.registrations.confirm({ ...command, receivedAt });
  }
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }
interface ReferralRow extends QueryResultRow {
  id: string;
  referring_account_id: string;
  referring_customer_id: string;
  referred_customer_id: string | null;
  status: string;
}

export class PostgresReferralRegistrationAwards implements ReferralRegistrationAwardPort {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly issuance: TransactionalPointIssuancePort,
  ) {}

  async confirm(
    command: ConfirmReferralRegistrationCommand & { receivedAt: Date },
  ): Promise<ReferralRegistrationAwardResult> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const referral = (await client.query<ReferralRow>(`
        SELECT id::text, referring_account_id::text, referring_customer_id::text,
          referred_customer_id::text, status
        FROM referrals WHERE id = $1 FOR UPDATE
      `, [command.referralId])).rows[0];
      if (!referral || !["ATTRIBUTED", "REGISTERED"].includes(referral.status)) {
        throw rewardsErrors.invalidTransition();
      }
      if (referral.referring_customer_id === command.referredCustomerId) {
        throw rewardsErrors.selfReferral();
      }
      if (referral.referred_customer_id !== null
        && referral.referred_customer_id !== command.referredCustomerId) {
        throw rewardsErrors.invalidTransition();
      }

      const conflicting = (await client.query<{ id: string }>(`
        SELECT id::text FROM referrals
        WHERE id <> $1 AND referred_customer_id = $2
          AND status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE')
        LIMIT 1 FOR UPDATE
      `, [command.referralId, command.referredCustomerId])).rows[0];
      if (conflicting) throw rewardsErrors.invalidTransition();

      const award = await this.issuance.issueInTransaction(client, {
        accountId: referral.referring_account_id as RewardsAccountId,
        ruleCode: "REFERRAL_REGISTRATION",
        event: normalizeRewardEvent({
          source: "INTERNAL",
          sourceId: `referral-registration:${command.referralId}`,
          eventType: "REFERRAL_REGISTRATION",
          customerId: referral.referring_customer_id as CustomerId,
          occurredAt: command.registeredAt,
          receivedAt: command.receivedAt,
          safeMetadata: {
            referralId: command.referralId,
            registrationEvidenceId: command.registrationEvidenceId,
          },
        }),
        issuedAt: command.receivedAt,
      });
      await client.query(`
        UPDATE referrals
        SET referred_customer_id = $2, status = 'REGISTERED', registered_at = $3, updated_at = $4
        WHERE id = $1
      `, [command.referralId, command.referredCustomerId,
        command.registeredAt, command.receivedAt]);
      await client.query("COMMIT");
      return { referralId: command.referralId, status: "REGISTERED", award };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
