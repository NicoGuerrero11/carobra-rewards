import type { BondaConfig } from "../../config.js";
import type { CustomerProfile } from "../../contracts.js";
import { BondaAffiliateProfileSyncApplication, affiliateProfileKeys, pendingAffiliateProfileContract } from "./affiliate-profile.js";
import { PostgresAffiliateProfileSyncStore, type ProfileDatabase } from "./affiliate-profile-persistence.js";
import { BondaHttpGateway } from "./http-gateway.js";
import type { DueJobProcessor } from "../operations/scheduler-runner.js";

export interface ProfileSyncReadiness { enabled: boolean; contractReady: boolean; keyReady: boolean; }
export class BondaAffiliateProfileWorker implements DueJobProcessor {
  constructor(
    private readonly database: ProfileDatabase,
    private readonly application: BondaAffiliateProfileSyncApplication,
    private readonly readiness: ProfileSyncReadiness,
  ) {}

  /** Explicit bounded catch-up after approved activation; does not itself send any profile. */
  async enqueueExisting(batchSize: number, afterCustomerId: string | null = null) {
    if (!this.readiness.enabled || !this.readiness.contractReady || !this.readiness.keyReady) return { enqueued: 0, nextCursor: null };
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("invalid_profile_batch_size");
    const rows = (await this.database.query<{ customer_id: string }>(`
      WITH candidates AS (
        SELECT c.id FROM customers c JOIN rewards_v2_journeys j ON j.customer_id = c.id
        JOIN bonda_affiliate_provisioning a ON a.customer_id = c.id AND a.rewards_id = c.rewards_id AND a.state = 'ACTIVE'
        WHERE c.customer_status = 'ACTIVE' AND j.state = 'ACTIVE' AND j.current_level IN ('GOLD','PLATINUM','TITANIUM')
          AND ($1::uuid IS NULL OR c.id > $1::uuid)
          AND EXISTS (SELECT 1 FROM bonda_profile_sync_controls WHERE capture_enabled)
        ORDER BY c.id LIMIT $2
      )
      INSERT INTO bonda_profile_sync_queue (customer_id) SELECT id FROM candidates
      ON CONFLICT (customer_id) DO UPDATE SET generation = bonda_profile_sync_queue.generation + 1,
        next_attempt_at = now(), updated_at = now()
      RETURNING customer_id::text`, [afterCustomerId, batchSize])).rows;
    const ids = rows.map(row => row.customer_id).sort();
    return { enqueued: ids.length, nextCursor: ids.length === batchSize ? ids.at(-1)! : null };
  }

  async processDue(_asOf: Date, batchSize: number, _workerId: string) {
    if (!this.readiness.enabled || !this.readiness.contractReady || !this.readiness.keyReady) return { processedJobs: 0, failedJobs: 0 };
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("invalid_profile_batch_size");
    const control = (await this.database.query(`SELECT capture_enabled FROM bonda_profile_sync_controls WHERE singleton`)).rows[0];
    if (control?.capture_enabled !== true) return { processedJobs: 0, failedJobs: 0 };
    const items = (await this.database.query<{ customer_id: string; generation: string }>(`
      SELECT customer_id::text, generation::text FROM bonda_profile_sync_queue
      WHERE generation > processed_generation AND next_attempt_at <= now()
      ORDER BY next_attempt_at, customer_id LIMIT $1`, [batchSize])).rows;
    let processedJobs = 0;
    let failedJobs = 0;
    for (const item of items) {
      processedJobs++;
      try {
        // Read current canonical values at execution time; no personal data is stored in the queue.
        const row = (await this.database.query<CustomerProfile & {
          journey_state: string | null; current_level: string | null; affiliate_state: string | null;
        }>(`SELECT c.id::text, c.rewards_id, c.curp, c.first_name, c.last_name, c.email,
          c.customer_status, c.onboarding_status,
          j.state AS journey_state, j.current_level, a.state AS affiliate_state
          FROM customers c LEFT JOIN rewards_v2_journeys j ON j.customer_id = c.id
          LEFT JOIN bonda_affiliate_provisioning a ON a.customer_id = c.id AND a.rewards_id = c.rewards_id
          WHERE c.id = $1`, [item.customer_id])).rows[0];
        const result = row ? await this.application.synchronize({
          customer: row,
          journey: row.journey_state ? { state: row.journey_state, currentLevel: row.current_level } : null,
          // Existing base provisioning owns creation. Never infer absence from a missing local row or partner 404.
          affiliate: row.affiliate_state === "ACTIVE" ? "EXISTING_CONFIRMED" : "UNKNOWN",
        }) : { status: "IDENTITY_INVALID" as const };
        const retry = ["UNAVAILABLE", "IN_PROGRESS"].includes(result.status);
        await this.database.query(`UPDATE bonda_profile_sync_queue
          SET processed_generation = CASE WHEN $3 THEN processed_generation ELSE GREATEST(processed_generation, $2::bigint) END,
            last_status = $4, next_attempt_at = CASE WHEN $3 THEN now() + interval '1 minute' ELSE now() END
          WHERE customer_id = $1`, [item.customer_id, item.generation, retry, result.status]);
        if (retry) failedJobs++;
      } catch {
        // Leave unacknowledged work durable without logging customer data or spinning in this batch.
        failedJobs++;
        await this.database.query(`UPDATE bonda_profile_sync_queue SET next_attempt_at = now() + interval '1 minute'
          WHERE customer_id = $1`, [item.customer_id]).catch(() => undefined);
      }
    }
    return { processedJobs, failedJobs };
  }
}

export function createBondaAffiliateProfileRuntime(database: ProfileDatabase, config: BondaConfig) {
  const settings = config.profileSync;
  const contract = settings?.contract ?? pendingAffiliateProfileContract;
  const readiness = {
    enabled: settings?.enabled === true && config.affiliateProvisioningEnabled && !config.localPreviewEnabled,
    contractReady: contract.curpTextAccepted && affiliateProfileKeys.every(key => contract.patchFields?.includes(key)),
    keyReady: (settings?.revisionKey?.length ?? 0) >= 32,
  };
  const store = new PostgresAffiliateProfileSyncStore(database);
  const application = new BondaAffiliateProfileSyncApplication(
    readiness.enabled, contract, new BondaHttpGateway(config, undefined, contract), store, settings?.revisionKey ?? "",
  );
  return { store, worker: new BondaAffiliateProfileWorker(database, application, readiness), readiness };
}
