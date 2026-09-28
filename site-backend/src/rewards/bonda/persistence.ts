import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { CatalogItemId, CustomerId } from "../shared/identifiers.js";
import { requireIdentifier } from "../shared/identifiers.js";
import { assertSafeMetadata } from "../shared/privacy.js";
import type { BondaAffiliateIntegrationState, BondaCouponCodeStatus } from "./contracts.js";

export interface BondaAffiliateProvisioningRecord {
  customerId: CustomerId;
  rewardsId: string;
  state: Exclude<BondaAffiliateIntegrationState, "DISABLED">;
  externalMemberId: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  safeErrorCode: BondaAffiliateFailureCode | null;
}

export type BondaAffiliateFailureCode =
  | "partner_unavailable"
  | "invalid_credentials"
  | "invalid_partner_response"
  | "affiliate_identity_conflict";

export interface BondaAffiliateProvisioningStore {
  ensurePending(
    customerId: CustomerId,
    rewardsId: string,
    at: Date,
  ): Promise<BondaAffiliateProvisioningRecord>;
  find(customerId: CustomerId): Promise<BondaAffiliateProvisioningRecord | null>;
  claimCustomer(
    customerId: CustomerId,
    at: Date,
  ): Promise<BondaAffiliateProvisioningRecord | null>;
  claimDue(at: Date, limit: number): Promise<readonly BondaAffiliateProvisioningRecord[]>;
  markActive(
    customerId: CustomerId,
    externalMemberId: string | null,
    at: Date,
  ): Promise<void>;
  markFailure(
    customerId: CustomerId,
    code: BondaAffiliateFailureCode,
    retryAt: Date | null,
    at: Date,
  ): Promise<void>;
}

export interface BeginBondaCouponRequestCommand {
  customerId: CustomerId;
  catalogItemId: CatalogItemId;
  bondaCouponId: string;
  externalId: string;
  requestedAt: Date;
}

export interface BondaCouponRequestRecord {
  id: string;
  customerId: CustomerId;
  catalogItemId: CatalogItemId;
  bondaCouponId: string;
  externalId: string;
  status: "PENDING" | BondaCouponCodeStatus;
  bondaReceiptId: string | null;
  safeResultMetadata: Readonly<Record<string, unknown>>;
  requestedAt: Date;
  resolvedAt: Date | null;
}

export interface BondaCouponRequestStore {
  begin(command: BeginBondaCouponRequestCommand): Promise<{
    request: BondaCouponRequestRecord;
    replayed: boolean;
  }>;
  resolve(
    requestId: string,
    status: BondaCouponCodeStatus,
    bondaReceiptId: string | null,
    safeResultMetadata: Readonly<Record<string, unknown>>,
    at: Date,
  ): Promise<void>;
  findByExternalId(externalId: string): Promise<BondaCouponRequestRecord | null>;
  listVerificationRequired(limit: number): Promise<readonly BondaCouponRequestRecord[]>;
  listVerificationRequiredForCustomer(
    customerId: CustomerId,
    limit: number,
  ): Promise<readonly BondaCouponRequestRecord[]>;
}

interface TransactionalDatabase { connect(): Promise<PoolClient> }

interface AffiliateRow extends QueryResultRow {
  customer_id: string;
  rewards_id: string;
  state: "PENDING" | "ACTIVE" | "ACTION_REQUIRED";
  external_member_id: string | null;
  attempt_count: number;
  last_attempt_at: Date | null;
  next_attempt_at: Date | null;
  safe_error_code: BondaAffiliateFailureCode | null;
}

interface CouponRequestRow extends QueryResultRow {
  id: string;
  customer_id: string;
  catalog_item_id: string;
  bonda_coupon_id: string;
  external_id: string;
  status: BondaCouponRequestRecord["status"];
  bonda_receipt_id: string | null;
  safe_result_metadata: Readonly<Record<string, unknown>>;
  requested_at: Date;
  resolved_at: Date | null;
}

export class PostgresBondaAffiliateProvisioning implements BondaAffiliateProvisioningStore {
  constructor(private readonly database: TransactionalDatabase) {}

  async ensurePending(
    customerId: CustomerId,
    rewardsId: string,
    at: Date,
  ): Promise<BondaAffiliateProvisioningRecord> {
    requireIdentifier(customerId);
    requireIdentifier(rewardsId);
    const client = await this.database.connect();
    try {
      const row = (await client.query<AffiliateRow>(`
        INSERT INTO bonda_affiliate_provisioning (
          customer_id, rewards_id, state, attempt_count, created_at, updated_at
        ) VALUES ($1, $2, 'PENDING', 0, $3, $3)
        ON CONFLICT (customer_id) DO UPDATE
          SET updated_at = bonda_affiliate_provisioning.updated_at
        RETURNING *
      `, [customerId, rewardsId, at])).rows[0];
      if (!row) throw new Error("Bonda affiliate provisioning record was not returned");
      if (row.rewards_id !== rewardsId) {
        throw new Error("Bonda affiliate provisioning Rewards ID conflict");
      }
      return affiliateRecord(row);
    } finally {
      client.release();
    }
  }

  async find(customerId: CustomerId): Promise<BondaAffiliateProvisioningRecord | null> {
    const client = await this.database.connect();
    try {
      const row = (await client.query<AffiliateRow>(`
        SELECT * FROM bonda_affiliate_provisioning WHERE customer_id = $1
      `, [customerId])).rows[0];
      return row ? affiliateRecord(row) : null;
    } finally {
      client.release();
    }
  }

  async claimDue(
    at: Date,
    limit: number,
  ): Promise<readonly BondaAffiliateProvisioningRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Bonda affiliate retry limit must be between 1 and 100");
    }
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const rows = (await client.query<AffiliateRow>(`
        WITH due AS (
          SELECT customer_id
          FROM bonda_affiliate_provisioning
          WHERE state = 'PENDING'
            AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
          ORDER BY COALESCE(next_attempt_at, created_at), customer_id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE bonda_affiliate_provisioning AS provisioning
        SET attempt_count = provisioning.attempt_count + 1,
            last_attempt_at = $1,
            next_attempt_at = $1 + interval '5 minutes',
            updated_at = $1
        FROM due
        WHERE provisioning.customer_id = due.customer_id
        RETURNING provisioning.*
      `, [at, limit])).rows;
      await client.query("COMMIT");
      return rows.map(affiliateRecord);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimCustomer(
    customerId: CustomerId,
    at: Date,
  ): Promise<BondaAffiliateProvisioningRecord | null> {
    const client = await this.database.connect();
    try {
      const row = (await client.query<AffiliateRow>(`
        UPDATE bonda_affiliate_provisioning
        SET attempt_count = attempt_count + 1,
            last_attempt_at = $2,
            next_attempt_at = $2 + interval '5 minutes',
            updated_at = $2
        WHERE customer_id = $1
          AND state = 'PENDING'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
        RETURNING *
      `, [customerId, at])).rows[0];
      return row ? affiliateRecord(row) : null;
    } finally {
      client.release();
    }
  }

  async markActive(
    customerId: CustomerId,
    externalMemberId: string | null,
    at: Date,
  ): Promise<void> {
    const result = await this.update(`
      UPDATE bonda_affiliate_provisioning
      SET state = 'ACTIVE', external_member_id = $2, next_attempt_at = NULL,
          safe_error_code = NULL, updated_at = $3
      WHERE customer_id = $1
    `, [customerId, externalMemberId, at]);
    if (result === 0) throw new Error("Bonda affiliate provisioning record is missing");
  }

  async markFailure(
    customerId: CustomerId,
    code: BondaAffiliateFailureCode,
    retryAt: Date | null,
    at: Date,
  ): Promise<void> {
    const state = retryAt ? "PENDING" : "ACTION_REQUIRED";
    const result = await this.update(`
      UPDATE bonda_affiliate_provisioning
      SET state = $2, safe_error_code = $3, next_attempt_at = $4, updated_at = $5
      WHERE customer_id = $1
    `, [customerId, state, code, retryAt, at]);
    if (result === 0) throw new Error("Bonda affiliate provisioning record is missing");
  }

  private async update(sql: string, values: readonly unknown[]): Promise<number> {
    const client = await this.database.connect();
    try {
      return (await client.query(sql, [...values])).rowCount ?? 0;
    } finally {
      client.release();
    }
  }
}

export class PostgresBondaCouponRequests implements BondaCouponRequestStore {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async begin(command: BeginBondaCouponRequestCommand): Promise<{
    request: BondaCouponRequestRecord;
    replayed: boolean;
  }> {
    requireIdentifier(command.customerId);
    requireIdentifier(command.catalogItemId);
    requireIdentifier(command.bondaCouponId);
    requireIdentifier(command.externalId);
    const client = await this.database.connect();
    try {
      const id = this.generateId();
      const inserted = (await client.query<CouponRequestRow>(`
        INSERT INTO bonda_coupon_requests (
          id, customer_id, catalog_item_id, bonda_coupon_id, external_id, status,
          safe_result_metadata, requested_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', '{}'::jsonb, $6, $6, $6)
        ON CONFLICT (external_id) DO NOTHING
        RETURNING *
      `, [id, command.customerId, command.catalogItemId, command.bondaCouponId,
        command.externalId, command.requestedAt])).rows[0];
      if (inserted) return { request: couponRequestRecord(inserted), replayed: false };
      const replay = (await client.query<CouponRequestRow>(`
        SELECT * FROM bonda_coupon_requests WHERE external_id = $1
      `, [command.externalId])).rows[0];
      if (!replay) throw new Error("Bonda coupon request replay is missing");
      if (replay.customer_id !== command.customerId
        || replay.catalog_item_id !== command.catalogItemId
        || replay.bonda_coupon_id !== command.bondaCouponId) {
        throw new Error("Bonda coupon request idempotency conflict");
      }
      return { request: couponRequestRecord(replay), replayed: true };
    } finally {
      client.release();
    }
  }

  async resolve(
    requestId: string,
    status: BondaCouponCodeStatus,
    bondaReceiptId: string | null,
    safeResultMetadata: Readonly<Record<string, unknown>>,
    at: Date,
  ): Promise<void> {
    requireIdentifier(requestId);
    assertSafeMetadata(safeResultMetadata, "Bonda coupon request result");
    const resolvedAt = status === "VERIFICATION_REQUIRED" ? null : at;
    const client = await this.database.connect();
    try {
      const result = await client.query(`
        UPDATE bonda_coupon_requests
        SET status = $2, bonda_receipt_id = $3, safe_result_metadata = $4::jsonb,
            resolved_at = $5, updated_at = $6
        WHERE id = $1 AND status IN ('PENDING', 'VERIFICATION_REQUIRED')
      `, [requestId, status, bondaReceiptId, JSON.stringify(safeResultMetadata), resolvedAt, at]);
      if ((result.rowCount ?? 0) === 0) {
        const current = (await client.query<{ status: string }>(`
          SELECT status FROM bonda_coupon_requests WHERE id = $1
        `, [requestId])).rows[0];
        if (!current || current.status !== status) {
          throw new Error("Bonda coupon request transition is invalid");
        }
      }
    } finally {
      client.release();
    }
  }

  async findByExternalId(externalId: string): Promise<BondaCouponRequestRecord | null> {
    const client = await this.database.connect();
    try {
      const row = (await client.query<CouponRequestRow>(`
        SELECT * FROM bonda_coupon_requests WHERE external_id = $1
      `, [externalId])).rows[0];
      return row ? couponRequestRecord(row) : null;
    } finally {
      client.release();
    }
  }

  async listVerificationRequired(limit: number): Promise<readonly BondaCouponRequestRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Bonda coupon verification limit must be between 1 and 100");
    }
    const client = await this.database.connect();
    try {
      return (await client.query<CouponRequestRow>(`
        SELECT * FROM bonda_coupon_requests
        WHERE status = 'VERIFICATION_REQUIRED'
        ORDER BY requested_at, id
        LIMIT $1
      `, [limit])).rows.map(couponRequestRecord);
    } finally {
      client.release();
    }
  }

  async listVerificationRequiredForCustomer(
    customerId: CustomerId,
    limit: number,
  ): Promise<readonly BondaCouponRequestRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Bonda coupon verification limit must be between 1 and 100");
    }
    const client = await this.database.connect();
    try {
      return (await client.query<CouponRequestRow>(`
        SELECT * FROM bonda_coupon_requests
        WHERE customer_id = $1 AND status = 'VERIFICATION_REQUIRED'
        ORDER BY requested_at, id
        LIMIT $2
      `, [customerId, limit])).rows.map(couponRequestRecord);
    } finally {
      client.release();
    }
  }
}

function affiliateRecord(row: AffiliateRow): BondaAffiliateProvisioningRecord {
  return {
    customerId: row.customer_id as CustomerId,
    rewardsId: row.rewards_id,
    state: row.state,
    externalMemberId: row.external_member_id,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: row.next_attempt_at,
    safeErrorCode: row.safe_error_code,
  };
}

function couponRequestRecord(row: CouponRequestRow): BondaCouponRequestRecord {
  return {
    id: row.id,
    customerId: row.customer_id as CustomerId,
    catalogItemId: row.catalog_item_id as CatalogItemId,
    bondaCouponId: row.bonda_coupon_id,
    externalId: row.external_id,
    status: row.status,
    bondaReceiptId: row.bonda_receipt_id,
    safeResultMetadata: row.safe_result_metadata,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
  };
}
