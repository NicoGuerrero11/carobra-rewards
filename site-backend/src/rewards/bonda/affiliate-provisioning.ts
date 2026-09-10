import type { Clock } from "../shared/clock.js";
import type { CustomerId } from "../shared/identifiers.js";
import type { BondaAffiliateStatusHttpResponse } from "./contracts.js";
import { BondaGatewayError, type BondaGateway } from "./gateway.js";
import type {
  BondaAffiliateFailureCode,
  BondaAffiliateProvisioningRecord,
  BondaAffiliateProvisioningStore,
} from "./persistence.js";

export interface BondaRegistrationIdentity {
  customerId: CustomerId;
  rewardsId: string;
}

export interface BondaAffiliateProvisioningHttpApplication {
  afterRegistration(identity: BondaRegistrationIdentity): Promise<BondaAffiliateStatusHttpResponse>;
  ensureForBenefits(identity: BondaRegistrationIdentity): Promise<BondaAffiliateStatusHttpResponse>;
  status(customerId: CustomerId): Promise<BondaAffiliateStatusHttpResponse>;
}

export class BondaAffiliateProvisioningApplication
implements BondaAffiliateProvisioningHttpApplication {
  constructor(
    private readonly enabled: boolean,
    private readonly store: BondaAffiliateProvisioningStore,
    private readonly gateway: BondaGateway,
    private readonly clock: Clock,
  ) {}

  async afterRegistration(
    identity: BondaRegistrationIdentity,
  ): Promise<BondaAffiliateStatusHttpResponse> {
    if (!this.enabled) return disabledStatus();
    try {
      await this.store.ensurePending(identity.customerId, identity.rewardsId, this.clock.now());
      return await this.attemptCustomer(identity.customerId);
    } catch {
      // Registration is already committed in FastAPI. Lazy repair/backfill owns recovery.
      return pendingStatus(false);
    }
  }

  async ensureForBenefits(
    identity: BondaRegistrationIdentity,
  ): Promise<BondaAffiliateStatusHttpResponse> {
    if (!this.enabled) return disabledStatus();
    try {
      const record = await this.store.ensurePending(
        identity.customerId,
        identity.rewardsId,
        this.clock.now(),
      );
      if (record.state === "ACTIVE") return activeStatus();
      if (record.state === "ACTION_REQUIRED") return actionRequiredStatus();
      return await this.attemptCustomer(identity.customerId);
    } catch {
      return pendingStatus(false);
    }
  }

  async status(customerId: CustomerId): Promise<BondaAffiliateStatusHttpResponse> {
    if (!this.enabled) return disabledStatus();
    const record = await this.store.find(customerId);
    return record ? statusFromRecord(record) : pendingStatus(false);
  }

  async retryDue(limit = 25): Promise<{ attempted: number; active: number; pending: number; actionRequired: number }> {
    if (!this.enabled) return { attempted: 0, active: 0, pending: 0, actionRequired: 0 };
    const records = await this.store.claimDue(this.clock.now(), limit);
    let active = 0;
    let pending = 0;
    let actionRequired = 0;
    for (const record of records) {
      const status = await this.attemptClaimed(record);
      if (status.state === "ACTIVE") active += 1;
      else if (status.state === "ACTION_REQUIRED") actionRequired += 1;
      else pending += 1;
    }
    return { attempted: records.length, active, pending, actionRequired };
  }

  private async attemptCustomer(customerId: CustomerId): Promise<BondaAffiliateStatusHttpResponse> {
    const record = await this.store.claimCustomer(customerId, this.clock.now());
    if (!record) return this.status(customerId);
    return this.attemptClaimed(record);
  }

  private async attemptClaimed(
    record: BondaAffiliateProvisioningRecord,
  ): Promise<BondaAffiliateStatusHttpResponse> {
    try {
      const exists = await this.gateway.affiliateExists(record.rewardsId);
      const result = exists
        ? { state: "ALREADY_EXISTS" as const, externalMemberId: null }
        : await this.gateway.createAffiliate(record.rewardsId);
      await this.store.markActive(record.customerId, result.externalMemberId, this.clock.now());
      return activeStatus();
    } catch (error) {
      const failure = affiliateFailure(error);
      const retryAt = failure.retryable
        ? new Date(this.clock.now().getTime() + retryDelayMilliseconds(record.attemptCount))
        : null;
      try {
        await this.store.markFailure(
          record.customerId,
          failure.code,
          retryAt,
          this.clock.now(),
        );
      } catch {
        return pendingStatus(false);
      }
      return retryAt ? pendingStatus(true) : actionRequiredStatus();
    }
  }
}

function affiliateFailure(error: unknown): {
  code: BondaAffiliateFailureCode;
  retryable: boolean;
} {
  if (!(error instanceof BondaGatewayError)) {
    return { code: "partner_unavailable", retryable: true };
  }
  switch (error.code) {
    case "UNAUTHORIZED":
      return { code: "invalid_credentials", retryable: false };
    case "INVALID_RESPONSE":
      return { code: "invalid_partner_response", retryable: false };
    case "FEATURE_DISABLED":
      return { code: "invalid_credentials", retryable: false };
    default:
      return { code: "partner_unavailable", retryable: error.retryable };
  }
}

function retryDelayMilliseconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 10));
  return Math.min(30_000 * (2 ** exponent), 6 * 60 * 60 * 1_000);
}

function statusFromRecord(
  record: BondaAffiliateProvisioningRecord,
): BondaAffiliateStatusHttpResponse {
  if (record.state === "ACTIVE") return activeStatus();
  if (record.state === "ACTION_REQUIRED") return actionRequiredStatus();
  return pendingStatus(record.nextAttemptAt !== null);
}

function disabledStatus(): BondaAffiliateStatusHttpResponse {
  return { state: "DISABLED", can_request_codes: false, retry_scheduled: false };
}

function pendingStatus(retryScheduled: boolean): BondaAffiliateStatusHttpResponse {
  return { state: "PENDING", can_request_codes: false, retry_scheduled: retryScheduled };
}

function activeStatus(): BondaAffiliateStatusHttpResponse {
  return { state: "ACTIVE", can_request_codes: true, retry_scheduled: false };
}

function actionRequiredStatus(): BondaAffiliateStatusHttpResponse {
  return { state: "ACTION_REQUIRED", can_request_codes: false, retry_scheduled: false };
}
