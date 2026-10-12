import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { AffiliateProfileCheckpoint, AffiliateProfileSyncStore } from "./affiliate-profile.js";
import { assertSafeText } from "../shared/privacy.js";

export interface ProfileDatabase {
  connect(): Promise<PoolClient>;
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
}
interface CheckpointRow extends QueryResultRow {
  rewards_id: string | null; status: AffiliateProfileCheckpoint["status"] | null;
  operation_id: string | null; field_digests: AffiliateProfileCheckpoint["fieldDigests"];
}
export interface ProfileReview {
  customerId: string; operationId: string; outcome: "APPLIED" | "NOT_APPLIED";
  evidenceReference: string; reviewerId: string; apply: boolean;
}

export class PostgresAffiliateProfileSyncStore implements AffiliateProfileSyncStore {
  private readonly leases = new Map<string, string>();
  constructor(private readonly database: ProfileDatabase) {}

  async claim(customerId: string): Promise<boolean> {
    if (this.leases.has(customerId)) return false;
    const token = randomUUID();
    const result = await this.database.query(`
      INSERT INTO bonda_profile_sync_checkpoints (customer_id, lease_token, lease_until)
      VALUES ($1, $2, now() + interval '2 minutes')
      ON CONFLICT (customer_id) DO UPDATE SET lease_token = $2, lease_until = now() + interval '2 minutes'
      WHERE bonda_profile_sync_checkpoints.lease_until IS NULL OR bonda_profile_sync_checkpoints.lease_until <= now()
      RETURNING customer_id
    `, [customerId, token]);
    if (!result.rows.length) return false;
    this.leases.set(customerId, token);
    return true;
  }

  async read(customerId: string): Promise<AffiliateProfileCheckpoint | null> {
    const row = (await this.database.query<CheckpointRow>(`
      SELECT rewards_id, status, operation_id, field_digests FROM bonda_profile_sync_checkpoints WHERE customer_id = $1
    `, [customerId])).rows[0];
    return row?.status && row.rewards_id && row.operation_id
      ? { rewardsId: row.rewards_id, status: row.status, fieldDigests: row.field_digests, operationId: row.operation_id }
      : null;
  }

  async write(customerId: string, checkpoint: AffiliateProfileCheckpoint): Promise<void> {
    const token = this.leases.get(customerId);
    if (!token) throw new Error("profile_sync_claim_required");
    const result = await this.database.query(`
      UPDATE bonda_profile_sync_checkpoints SET rewards_id = $3::varchar, status = $4::varchar, field_digests = $5::jsonb,
        operation_id = CASE WHEN $4::varchar = 'VERIFICATION_REQUIRED' THEN $6::uuid ELSE operation_id END, updated_at = now()
      WHERE customer_id = $1 AND lease_token = $2 AND lease_until > now()
        AND (rewards_id IS NULL OR rewards_id = $3::varchar)
      RETURNING customer_id
    `, [customerId, token, checkpoint.rewardsId, checkpoint.status, JSON.stringify(checkpoint.fieldDigests), randomUUID()]);
    if (!result.rows.length) throw new Error("profile_sync_claim_lost_or_identity_conflict");
  }

  async release(customerId: string): Promise<void> {
    const token = this.leases.get(customerId);
    if (!token) return;
    this.leases.delete(customerId);
    await this.database.query(`UPDATE bonda_profile_sync_checkpoints SET lease_token = NULL, lease_until = NULL
      WHERE customer_id = $1 AND lease_token = $2`, [customerId, token]);
  }

  /** Human-verified evidence only. Never queries a partner or treats a 404 as proof of non-application. */
  async reconcile(review: ProfileReview): Promise<"DRY_RUN" | "RECONCILED" | "ALREADY_RECONCILED" | "IN_PROGRESS"> {
    if (!review.apply) return "DRY_RUN";
    if (!["APPLIED", "NOT_APPLIED"].includes(review.outcome)) throw new Error("invalid_review_outcome");
    const evidence = assertSafeText("evidenceReference", review.evidenceReference, 180);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,179}$/.test(evidence)) throw new Error("invalid_evidence_reference");
    if (!await this.claim(review.customerId)) return "IN_PROGRESS";
    let client: PoolClient | undefined;
    try {
      client = await this.database.connect();
      await client.query("BEGIN");
      const row = (await client.query(`SELECT operation_id, status FROM bonda_profile_sync_checkpoints
        WHERE customer_id = $1 AND lease_token = $2 AND lease_until > now() FOR UPDATE`,
      [review.customerId, this.leases.get(review.customerId)])).rows[0];
      if (!row || row.operation_id !== review.operationId) throw new Error("stale_profile_review");
      const existing = (await client.query(`SELECT outcome FROM bonda_profile_sync_reviews WHERE operation_id = $1`, [review.operationId])).rows[0];
      if (existing) {
        if (existing.outcome !== review.outcome) throw new Error("conflicting_profile_review");
        await client.query("COMMIT"); return "ALREADY_RECONCILED";
      }
      if (!["VERIFICATION_REQUIRED", "ACTION_REQUIRED"].includes(row.status)) throw new Error("profile_review_not_required");
      await client.query(`INSERT INTO bonda_profile_sync_reviews
        (operation_id, customer_id, outcome, evidence_reference, reviewer_id) VALUES ($1,$2,$3,$4,$5)`,
      [review.operationId, review.customerId, review.outcome, evidence, review.reviewerId]);
      await client.query(`UPDATE bonda_profile_sync_checkpoints SET status = $2::varchar,
        field_digests = CASE WHEN $2::varchar = 'RETRY_APPROVED' THEN '{}'::jsonb ELSE field_digests END, updated_at = now()
        WHERE customer_id = $1`, [review.customerId, review.outcome === "APPLIED" ? "SYNCHRONIZED" : "RETRY_APPROVED"]);
      // Also replay after APPLIED: newer local profile changes may have arrived while verification was pending.
      await client.query(`INSERT INTO bonda_profile_sync_queue (customer_id) VALUES ($1)
        ON CONFLICT (customer_id) DO UPDATE SET generation = bonda_profile_sync_queue.generation + 1,
        next_attempt_at = now(), updated_at = now()`, [review.customerId]);
      await client.query("COMMIT");
      return "RECONCILED";
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client?.release(); await this.release(review.customerId);
    }
  }
}
