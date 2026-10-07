import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { ProfileDatabase } from "./affiliate-profile-persistence.js";
import type { BondaCredit, BondaWallet } from "./points-gateway.js";
import { assertSafeText } from "../shared/privacy.js";

export interface CreditRow extends QueryResultRow {
  ledger_entry_id: string; customer_id: string; points: string; state: string; operation_id: string | null;
  microsite_id: string | null; source_wallet_id: string | null; affiliate_wallet_id: string | null;
  rewards_id: string | null; movement_id: string | null;
}
export interface PointReview { entryId: string; operationId: string; outcome: "APPLIED" | "NOT_APPLIED"; reviewerId: string; evidenceReference: string; movementId?: string; }
export class PostgresBondaPointsStore {
  constructor(readonly database: ProfileDatabase) {}
  async due(limit: number): Promise<string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("invalid_points_batch");
    return (await this.database.query<{ id: string }>(`SELECT ledger_entry_id::text AS id FROM bonda_point_credits
      WHERE state = 'PENDING' AND next_attempt_at <= now() AND (lease_until IS NULL OR lease_until <= now())
      ORDER BY next_attempt_at, ledger_entry_id LIMIT $1`, [limit])).rows.map(x => x.id);
  }
  async claim(id: string, review = false): Promise<string | null> {
    const token = randomUUID();
    const result = await this.database.query(`UPDATE bonda_point_credits SET lease_token = $2, lease_until = now() + interval '3 minutes'
      WHERE ledger_entry_id = $1 AND (lease_until IS NULL OR lease_until <= now())
        AND ($3 OR (state = 'PENDING' AND next_attempt_at <= now())) RETURNING ledger_entry_id`, [id, token, review]);
    return result.rows.length ? token : null;
  }
  async read(id: string): Promise<CreditRow | null> {
    return (await this.database.query<CreditRow>(`SELECT *, points::text FROM bonda_point_credits WHERE ledger_entry_id = $1`, [id])).rows[0] ?? null;
  }
  async release(id: string, token: string) {
    await this.database.query(`UPDATE bonda_point_credits SET lease_token = NULL, lease_until = NULL WHERE ledger_entry_id = $1 AND lease_token = $2`, [id, token]);
  }
  async defer(id: string, token: string, reason: string, action = false, operation?: string) {
    const result = await this.database.query(`UPDATE bonda_point_credits SET state = $4, reason = $3,
      next_attempt_at = now() + interval '5 minutes' WHERE ledger_entry_id = $1 AND lease_token = $2
      AND lease_until > now() AND ((state = 'PENDING' AND $5::uuid IS NULL)
        OR (state = 'VERIFICATION_REQUIRED' AND operation_id = $5))
      RETURNING ledger_entry_id`, [id, token, reason, action ? 'ACTION_REQUIRED' : 'PENDING', operation ?? null]);
    if (!result.rows.length) throw Error("points_claim_lost");
  }
  async intent(id: string, token: string, credit: BondaCredit): Promise<string> {
    const operation = randomUUID();
    const result = await this.database.query(`UPDATE bonda_point_credits SET state = 'VERIFICATION_REQUIRED',
      operation_id = $3, microsite_id = $4, source_wallet_id = $5, affiliate_wallet_id = $6, rewards_id = $7,
      reason = 'AWAITING_CONFIRMATION'
      WHERE ledger_entry_id = $1 AND lease_token = $2 AND lease_until > now() AND state = 'PENDING'
        AND points = $8::bigint AND (rewards_id IS NULL OR rewards_id = $7)
        AND (microsite_id IS NULL OR microsite_id = $4) AND (source_wallet_id IS NULL OR source_wallet_id = $5)
      RETURNING ledger_entry_id`, [id, token, operation, credit.micrositeId, credit.sourceWalletId, credit.walletId, credit.rewardsId, credit.points]);
    if (!result.rows.length) throw Error("points_claim_lost_or_identity_changed");
    return operation;
  }
  async confirm(id: string, token: string, operation: string, movement: string) {
    const result = await this.database.query(`UPDATE bonda_point_credits SET state = 'CONFIRMED', movement_id = $4,
      confirmed_at = now(), reason = NULL WHERE ledger_entry_id = $1 AND lease_token = $2 AND operation_id = $3
      AND lease_until > now() AND state = 'VERIFICATION_REQUIRED' RETURNING ledger_entry_id`, [id, token, operation, movement]);
    if (!result.rows.length) throw Error("points_confirmation_not_saved");
  }
  async context(customerId: string, entryId?: string) {
    return (await this.database.query<{ rewards_id: string; email: string; customer_status: string; state: string | null; current_level: string | null; affiliate_state: string | null; source_valid: boolean }>(`
      SELECT c.rewards_id, c.email, c.customer_status, j.state, j.current_level, a.state AS affiliate_state,
        CASE WHEN $2::uuid IS NULL THEN true ELSE EXISTS (
          SELECT 1 FROM point_lots l JOIN bonda_point_credits q ON q.ledger_entry_id = l.source_ledger_entry_id
          WHERE q.ledger_entry_id = $2 AND l.remaining_points >= q.points AND l.expired_at IS NULL AND l.expires_at > now()
        ) END AS source_valid
      FROM customers c LEFT JOIN rewards_v2_journeys j ON j.customer_id = c.id
      LEFT JOIN bonda_affiliate_provisioning a ON a.customer_id = c.id AND a.rewards_id = c.rewards_id WHERE c.id = $1`, [customerId, entryId ?? null])).rows[0] ?? null;
  }
  async pending(customerId: string) {
    const row = (await this.database.query<{ pending: string; uncertain: string }>(`SELECT
      COALESCE(sum(points) FILTER (WHERE state = 'PENDING'),0)::text AS pending,
      COALESCE(sum(points) FILTER (WHERE state IN ('VERIFICATION_REQUIRED','ACTION_REQUIRED')),0)::text AS uncertain
      FROM bonda_point_credits WHERE customer_id = $1`, [customerId])).rows[0]!;
    return row;
  }
  async cached(customerId: string, microsite: string, code: string) {
    return (await this.database.query<{ balance: string; observed_at: Date }>(`SELECT balance::text, observed_at
      FROM bonda_point_balances WHERE customer_id = $1 AND microsite_id = $2 AND rewards_id = $3`, [customerId, microsite, code])).rows[0] ?? null;
  }
  async saveBalance(customerId: string, microsite: string, code: string, wallet: BondaWallet, started: Date, observed: Date) {
    await this.database.query(`INSERT INTO bonda_point_balances (customer_id, microsite_id, rewards_id, wallet_id, balance, observed_at, request_started_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (customer_id,microsite_id) DO UPDATE SET rewards_id = $3,
      wallet_id = $4, balance = $5, observed_at = $6, request_started_at = $7
      WHERE bonda_point_balances.request_started_at <= $7`, [customerId, microsite, code, wallet.id, wallet.balance, observed, started]);
  }
  /** Explicit operator-only catch-up, never called on startup or a customer GET. */
  async enqueueExisting(limit: number, after: string | null = null) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("invalid_points_batch");
    const rows = (await this.database.query<{ id: string }>(`WITH candidates AS (
      SELECT e.id, a.customer_id, LEAST(e.points_delta,l.remaining_points) AS points
      FROM ledger_entries e JOIN rewards_accounts a ON a.id = e.account_id
      JOIN point_lots l ON l.source_ledger_entry_id = e.id
      WHERE e.entry_type = 'ISSUANCE' AND e.points_delta > 0 AND l.remaining_points > 0
        AND l.expired_at IS NULL AND l.expires_at > now() AND ($1::uuid IS NULL OR e.id > $1)
        AND NOT EXISTS (SELECT 1 FROM bonda_point_credits q WHERE q.ledger_entry_id = e.id)
      ORDER BY e.id LIMIT $2
    ) INSERT INTO bonda_point_credits (ledger_entry_id,customer_id,points) SELECT id,customer_id,points FROM candidates
      ON CONFLICT (ledger_entry_id) DO NOTHING RETURNING ledger_entry_id::text AS id`, [after, limit])).rows;
    const ids = rows.map(x => x.id).sort();
    return { enqueued: ids.length, nextCursor: ids.length === limit ? ids.at(-1)! : null };
  }
  async review(input: PointReview, token: string) {
    const evidence = assertSafeText("evidenceReference", input.evidenceReference, 180);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,179}$/.test(evidence)) throw Error("invalid_review_reference");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(`SELECT * FROM bonda_point_credits WHERE ledger_entry_id = $1 AND lease_token = $2
        AND lease_until > now() FOR UPDATE`, [input.entryId, token])).rows[0];
      if (!row || row.operation_id !== input.operationId) throw Error("stale_points_review");
      const existing = (await client.query(`SELECT outcome,movement_id FROM bonda_point_reviews WHERE operation_id = $1`, [input.operationId])).rows[0];
      if (existing) {
        if (existing.outcome !== input.outcome || existing.movement_id !== (input.movementId ?? null)) throw Error("conflicting_points_review");
        await client.query("COMMIT"); return "ALREADY_RECONCILED";
      }
      if (row.state !== 'VERIFICATION_REQUIRED' || !['APPLIED','NOT_APPLIED'].includes(input.outcome)
        || (input.outcome === 'APPLIED' && !input.movementId) || (input.outcome === 'NOT_APPLIED' && input.movementId)) throw Error("invalid_points_review");
      await client.query(`INSERT INTO bonda_point_reviews (operation_id,ledger_entry_id,outcome,movement_id,reviewer_id,evidence_reference)
        VALUES ($1,$2,$3,$4,$5,$6)`, [input.operationId,input.entryId,input.outcome,input.movementId ?? null,input.reviewerId,evidence]);
      await client.query(`UPDATE bonda_point_credits SET state = $2, movement_id = $3,
        confirmed_at = CASE WHEN $2::varchar = 'CONFIRMED' THEN now() ELSE NULL END,
        next_attempt_at = now(), reason = NULL WHERE ledger_entry_id = $1`,
      [input.entryId, input.outcome === 'APPLIED' ? 'CONFIRMED' : 'PENDING', input.movementId ?? null]);
      await client.query("COMMIT"); return "RECONCILED";
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
