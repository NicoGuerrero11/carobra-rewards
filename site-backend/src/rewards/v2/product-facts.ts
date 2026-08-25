import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";

import type { RewardsProductFactStatus } from "../shared/enums.js";
import { rewardsErrors } from "../shared/errors.js";
import type {
  CustomerId,
  ProductFactId,
  RewardsAccountId,
} from "../shared/identifiers.js";
import {
  assertProductEvidenceChronology,
  assertProductStatusTransition,
  normalizeExternalReference,
  normalizeProductType,
  normalizeProvider,
  normalizeSource,
  normalizeSourceId,
  requireProductFactStatus,
  requireSafeObject,
} from "./domain.js";

export interface ProductFact {
  id: ProductFactId;
  accountId: RewardsAccountId;
  customerId: CustomerId;
  provider: string;
  productType: string;
  externalReference: string | null;
  status: RewardsProductFactStatus;
  source: string;
  sourceId: string;
  safeEvidence: Readonly<Record<string, unknown>>;
  signedAt: Date | null;
  acceptedAt: Date | null;
  activatedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordProductFactCommand {
  accountId: RewardsAccountId;
  customerId: CustomerId;
  provider: string;
  productType: string;
  externalReference?: string | null;
  status: RewardsProductFactStatus;
  source: string;
  sourceId: string;
  safeEvidence?: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  receivedAt: Date;
  signedAt?: Date | null;
  acceptedAt?: Date | null;
  activatedAt?: Date | null;
  endedAt?: Date | null;
}

export interface RecordProductFactResult {
  fact: ProductFact;
  factCreated: boolean;
  eventCreated: boolean;
}

export interface ProductFactRepository {
  record(command: RecordProductFactCommand): Promise<RecordProductFactResult>;
  listForCustomer(customerId: CustomerId): Promise<readonly ProductFact[]>;
}

interface TransactionalDatabase {
  connect(): Promise<PoolClient>;
}

interface AccountRow extends QueryResultRow {
  customer_id: string;
}

interface ProductFactRow extends QueryResultRow {
  id: string;
  account_id: string;
  customer_id: string;
  provider: string;
  product_type: string;
  external_reference: string | null;
  status: string;
  source: string;
  source_id: string;
  safe_evidence: Record<string, unknown>;
  signed_at: Date | null;
  accepted_at: Date | null;
  activated_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface EventReplayRow extends ProductFactRow {
  event_to_status: string;
}

const factColumns = `
  fact.id::text, fact.account_id::text, fact.customer_id::text,
  fact.provider, fact.product_type, fact.external_reference, fact.status,
  fact.source, fact.source_id, fact.safe_evidence, fact.signed_at,
  fact.accepted_at, fact.activated_at, fact.ended_at, fact.created_at,
  fact.updated_at
`;

export class PostgresProductFactRepository implements ProductFactRepository {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async record(command: RecordProductFactCommand): Promise<RecordProductFactResult> {
    const normalized = normalizeCommand(command);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const replay = (await client.query<EventReplayRow>(`
        SELECT ${factColumns}, event.to_status AS event_to_status
        FROM rewards_product_fact_events AS event
        JOIN rewards_product_facts AS fact ON fact.id = event.product_fact_id
        WHERE event.source = $1 AND event.source_id = $2
        FOR UPDATE OF fact
      `, [normalized.source, normalized.sourceId])).rows[0];
      if (replay) {
        assertReplayMatches(replay, normalized);
        await client.query("COMMIT");
        return { fact: mapFact(replay), factCreated: false, eventCreated: false };
      }

      const account = (await client.query<AccountRow>(`
        SELECT customer_id::text
        FROM rewards_accounts
        WHERE id = $1
        FOR UPDATE
      `, [normalized.accountId])).rows[0];
      if (!account || account.customer_id !== normalized.customerId) {
        throw rewardsErrors.notEligible();
      }

      const existing = normalized.externalReference
        ? (await client.query<ProductFactRow>(`
            SELECT ${factColumns}
            FROM rewards_product_facts AS fact
            WHERE fact.provider = $1 AND fact.external_reference = $2
            FOR UPDATE
          `, [normalized.provider, normalized.externalReference])).rows[0]
        : undefined;

      let fact: ProductFactRow;
      let factCreated = false;
      if (!existing) {
        const inserted = (await client.query<ProductFactRow>(`
          INSERT INTO rewards_product_facts (
            id, account_id, customer_id, provider, product_type,
            external_reference, status, source, source_id, safe_evidence,
            signed_at, accepted_at, activated_at, ended_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
            $11, $12, $13, $14, $15, $15
          )
          RETURNING id::text, account_id::text, customer_id::text, provider,
            product_type, external_reference, status, source, source_id,
            safe_evidence, signed_at, accepted_at, activated_at, ended_at,
            created_at, updated_at
        `, [
          this.generateId(), normalized.accountId, normalized.customerId,
          normalized.provider, normalized.productType, normalized.externalReference,
          normalized.status, normalized.source, normalized.sourceId,
          JSON.stringify(normalized.safeEvidence), normalized.signedAt,
          normalized.acceptedAt, normalized.activatedAt, normalized.endedAt,
          normalized.receivedAt,
        ])).rows[0];
        if (!inserted) throw new Error("Product fact was not inserted");
        fact = inserted;
        factCreated = true;
      } else {
        assertExistingIdentity(existing, normalized);
        assertProductStatusTransition(requireProductFactStatus(existing.status), normalized.status);
        const merged = {
          signedAt: normalized.signedAt ?? existing.signed_at,
          acceptedAt: normalized.acceptedAt ?? existing.accepted_at,
          activatedAt: normalized.activatedAt ?? existing.activated_at,
          endedAt: normalized.endedAt ?? existing.ended_at,
        };
        assertProductEvidenceChronology({
          status: normalized.status,
          occurredAt: normalized.occurredAt,
          receivedAt: normalized.receivedAt,
          ...merged,
        });
        const updated = (await client.query<ProductFactRow>(`
          UPDATE rewards_product_facts AS fact
          SET status = $2,
              safe_evidence = fact.safe_evidence || $3::jsonb,
              signed_at = $4,
              accepted_at = $5,
              activated_at = $6,
              ended_at = $7,
              updated_at = $8
          WHERE fact.id = $1
          RETURNING id::text, account_id::text, customer_id::text, provider,
            product_type, external_reference, status, source, source_id,
            safe_evidence, signed_at, accepted_at, activated_at, ended_at,
            created_at, updated_at
        `, [
          existing.id, normalized.status, JSON.stringify(normalized.safeEvidence),
          merged.signedAt, merged.acceptedAt, merged.activatedAt, merged.endedAt,
          normalized.receivedAt,
        ])).rows[0];
        if (!updated) throw new Error("Product fact was not updated");
        fact = updated;
      }

      await client.query(`
        INSERT INTO rewards_product_fact_events (
          id, product_fact_id, from_status, to_status, source, source_id,
          safe_evidence, occurred_at, received_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9)
      `, [
        this.generateId(), fact.id, existing?.status ?? null, normalized.status,
        normalized.source, normalized.sourceId, JSON.stringify(normalized.safeEvidence),
        normalized.occurredAt, normalized.receivedAt,
      ]);
      await client.query("COMMIT");
      return { fact: mapFact(fact), factCreated, eventCreated: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listForCustomer(customerId: CustomerId): Promise<readonly ProductFact[]> {
    const client = await this.database.connect();
    try {
      const result = await client.query<ProductFactRow>(`
        SELECT ${factColumns}
        FROM rewards_product_facts AS fact
        WHERE fact.customer_id = $1
        ORDER BY fact.created_at, fact.id
      `, [customerId]);
      return result.rows.map(mapFact);
    } finally {
      client.release();
    }
  }
}

function normalizeCommand(command: RecordProductFactCommand) {
  const normalized = {
    ...command,
    provider: normalizeProvider(command.provider),
    productType: normalizeProductType(command.productType),
    externalReference: normalizeExternalReference(command.externalReference),
    source: normalizeSource(command.source),
    sourceId: normalizeSourceId(command.sourceId),
    safeEvidence: requireSafeObject("safeEvidence", command.safeEvidence),
    signedAt: command.signedAt ?? null,
    acceptedAt: command.acceptedAt ?? null,
    activatedAt: command.activatedAt ?? null,
    endedAt: command.endedAt ?? null,
  };
  assertProductEvidenceChronology(normalized);
  return normalized;
}

function assertReplayMatches(row: EventReplayRow, command: ReturnType<typeof normalizeCommand>): void {
  if (row.account_id !== command.accountId
    || row.customer_id !== command.customerId
    || row.provider !== command.provider
    || row.product_type !== command.productType
    || row.event_to_status !== command.status) {
    throw rewardsErrors.duplicateEvent();
  }
}

function assertExistingIdentity(
  row: ProductFactRow,
  command: ReturnType<typeof normalizeCommand>,
): void {
  if (row.account_id !== command.accountId
    || row.customer_id !== command.customerId
    || row.provider !== command.provider
    || row.product_type !== command.productType) {
    throw rewardsErrors.duplicateEvent();
  }
}

function mapFact(row: ProductFactRow): ProductFact {
  return {
    id: row.id as ProductFactId,
    accountId: row.account_id as RewardsAccountId,
    customerId: row.customer_id as CustomerId,
    provider: row.provider,
    productType: row.product_type,
    externalReference: row.external_reference,
    status: requireProductFactStatus(row.status),
    source: row.source,
    sourceId: row.source_id,
    safeEvidence: requireSafeObject("safeEvidence", row.safe_evidence),
    signedAt: row.signed_at,
    acceptedAt: row.accepted_at,
    activatedAt: row.activated_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
