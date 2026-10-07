import { createHmac } from "node:crypto";
import type { CustomerProfile } from "../../contracts.js";
import { BondaGatewayError } from "./gateway.js";

export const affiliateProfileKeys = ["email", "nombre", "apellido", "curp"] as const;
export type AffiliateProfileKey = typeof affiliateProfileKeys[number];
export type AffiliateProfileFields = Readonly<Record<AffiliateProfileKey, string>>;
export type AffiliateProfileChanges = Readonly<Partial<AffiliateProfileFields>>;

/** Only the microsite's explicit agreement may complete these confirmations. */
export interface AffiliateProfileContract {
  readonly curpTextAccepted: boolean;
  readonly patchFields: readonly AffiliateProfileKey[] | null;
}
export const pendingAffiliateProfileContract: AffiliateProfileContract = Object.freeze({
  curpTextAccepted: false, patchFields: null,
});

export interface BondaAffiliateProfileGateway {
  createAffiliateProfile(rewardsId: string, fields: AffiliateProfileFields): Promise<"CREATED" | "ALREADY_EXISTS">;
  updateAffiliateProfile(rewardsId: string, changes: AffiliateProfileChanges): Promise<void>;
}

export function assertAffiliateProfileFields(fields: AffiliateProfileChanges, complete = false): void {
  const keys = Object.keys(fields);
  if (keys.some(key => !affiliateProfileKeys.includes(key as AffiliateProfileKey))
    || (complete && affiliateProfileKeys.some(key => !(key in fields)))) throw new Error("invalid_affiliate_profile_fields");
  for (const key of keys as AffiliateProfileKey[]) {
    const value = fields[key];
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 320 || /[\u0000-\u001f]/.test(value)) throw new Error("invalid_affiliate_profile_fields");
    if (key === "curp" && !/^[A-Z0-9]{18}$/.test(value)) throw new Error("invalid_affiliate_profile_fields");
    if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("invalid_affiliate_profile_fields");
  }
}

export function assertAffiliateProfileContract(contract: AffiliateProfileContract, fields: AffiliateProfileChanges, operation: "CREATE" | "UPDATE") {
  if (!contract.curpTextAccepted || (operation === "UPDATE"
    && (!contract.patchFields || Object.keys(fields).some(key => !contract.patchFields!.includes(key as AffiliateProfileKey))))) {
    throw new BondaGatewayError("FEATURE_DISABLED", "Affiliate profile contract is pending confirmation", false);
  }
}

export type AffiliateProfileSyncStatus = "SYNCHRONIZED" | "VERIFICATION_REQUIRED" | "ACTION_REQUIRED" | "RETRY_APPROVED";
export interface AffiliateProfileCheckpoint {
  readonly operationId?: string;
  readonly rewardsId: string;
  readonly status: AffiliateProfileSyncStatus;
  readonly fieldDigests: Readonly<Partial<Record<AffiliateProfileKey, string>>>;
}
/** Implementations must provide durable, exclusive claims across workers before runtime wiring. */
export interface AffiliateProfileSyncStore {
  claim(customerId: string): Promise<boolean>;
  read(customerId: string): Promise<AffiliateProfileCheckpoint | null>;
  write(customerId: string, checkpoint: AffiliateProfileCheckpoint): Promise<void>;
  release(customerId: string): Promise<void>;
}
export interface AffiliateProfileSyncInput {
  readonly customer: CustomerProfile;
  /** Must come from the canonical server journey, never from a client-supplied level. */
  readonly journey: { readonly state: string; readonly currentLevel: string | null } | null;
  /** A 404 cannot establish ABSENT_CONFIRMED: POST can restore a soft-deleted affiliate. */
  readonly affiliate: "EXISTING_CONFIRMED" | "ABSENT_CONFIRMED" | "UNKNOWN";
}
export type AffiliateProfileSyncResult = {
  readonly status: AffiliateProfileSyncStatus | "DISABLED" | "CONTRACT_PENDING" | "NOT_ELIGIBLE" | "IDENTITY_INVALID" | "IDENTITY_CONFLICT" | "AFFILIATE_REVIEW_REQUIRED" | "IN_PROGRESS" | "UNAVAILABLE";
  readonly changedFields?: readonly AffiliateProfileKey[];
};

/** Contract-gated synchronization; only the canonical-source worker may call this in runtime. */
export class BondaAffiliateProfileSyncApplication {
  constructor(
    private readonly enabled: boolean,
    private readonly contract: AffiliateProfileContract,
    private readonly gateway: BondaAffiliateProfileGateway,
    private readonly store: AffiliateProfileSyncStore,
    private readonly revisionKey: string,
  ) {}

  async synchronize(input: AffiliateProfileSyncInput): Promise<AffiliateProfileSyncResult> {
    if (!this.enabled) return { status: "DISABLED" };
    if (!input.journey || input.journey.state !== "ACTIVE"
      || !["GOLD", "PLATINUM", "TITANIUM"].includes(input.journey.currentLevel ?? "")
      || input.customer.customer_status !== "ACTIVE") return { status: "NOT_ELIGIBLE" };
    if (!this.contract.curpTextAccepted || !this.contract.patchFields
      || affiliateProfileKeys.some(key => !this.contract.patchFields!.includes(key))) return { status: "CONTRACT_PENDING" };
    const customer = input.customer;
    if (!/^[1-9][0-9]{8}$/.test(customer.rewards_id) || !customer.id || this.revisionKey.length < 32) return { status: "IDENTITY_INVALID" };
    const fields = { email: customer.email, nombre: customer.first_name, apellido: customer.last_name, curp: customer.curp };
    try { assertAffiliateProfileFields(fields, true); } catch { return { status: "IDENTITY_INVALID" }; }
    if (input.affiliate === "UNKNOWN") return { status: "AFFILIATE_REVIEW_REQUIRED" };
    let claimed = false;
    let dispatched = false;
    try {
      claimed = await this.store.claim(customer.id);
      if (!claimed) return { status: "IN_PROGRESS" };
      const previous = await this.store.read(customer.id);
      if (previous && previous.rewardsId !== customer.rewards_id) return { status: "IDENTITY_CONFLICT" };
      if (previous?.status === "VERIFICATION_REQUIRED" || previous?.status === "ACTION_REQUIRED") return { status: previous.status };
      const digests: Partial<Record<AffiliateProfileKey, string>> = {};
      const changes: Partial<Record<AffiliateProfileKey, string>> = {};
      for (const key of affiliateProfileKeys) {
        digests[key] = createHmac("sha256", this.revisionKey).update(JSON.stringify([customer.id, customer.rewards_id, key, fields[key]])).digest("hex");
        if (previous?.fieldDigests[key] !== digests[key]) changes[key] = fields[key];
      }
      const changedFields = Object.keys(changes) as AffiliateProfileKey[];
      if (!changedFields.length) return { status: "SYNCHRONIZED", changedFields: [] };
      if (previous && input.affiliate !== "EXISTING_CONFIRMED") return { status: "AFFILIATE_REVIEW_REQUIRED" };
      // Persist intent before dispatch. A crash or timeout must not silently resend.
      const checkpoint = { rewardsId: customer.rewards_id, fieldDigests: digests };
      await this.store.write(customer.id, { ...checkpoint, status: "VERIFICATION_REQUIRED" });
      dispatched = true;
      if (input.affiliate === "ABSENT_CONFIRMED") {
        const result = await this.gateway.createAffiliateProfile(customer.rewards_id, fields);
        if (result === "ALREADY_EXISTS") return { status: "VERIFICATION_REQUIRED" };
      } else {
        await this.gateway.updateAffiliateProfile(customer.rewards_id, changes);
      }
      await this.store.write(customer.id, { ...checkpoint, status: "SYNCHRONIZED" });
      return { status: "SYNCHRONIZED", changedFields };
    } catch (error) {
      if (!dispatched) return { status: "UNAVAILABLE" };
      // No payloads, raw partner errors or customer fields escape through diagnostics.
      if (error instanceof BondaGatewayError && ["UNAUTHORIZED", "FEATURE_DISABLED"].includes(error.code)) {
        try {
          const checkpoint = await this.store.read(customer.id);
          if (checkpoint) await this.store.write(customer.id, { ...checkpoint, status: "ACTION_REQUIRED" });
        } catch { return { status: "VERIFICATION_REQUIRED" }; }
        return { status: "ACTION_REQUIRED" };
      }
      return { status: "VERIFICATION_REQUIRED" };
    } finally {
      if (claimed) await this.store.release(customer.id).catch(() => undefined);
    }
  }
}
