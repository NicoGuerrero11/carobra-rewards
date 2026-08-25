import type { QueryResult, QueryResultRow } from "pg";

import { asCustomerId, type CustomerId } from "../shared/identifiers.js";
import type {
  RewardsV2LiveJourneyPort,
  SynchronizeRewardsEvidenceCommand,
} from "./live-journey.js";

export interface RewardsV2BackfillCandidate extends SynchronizeRewardsEvidenceCommand {
  journeyExists: boolean;
}

export interface RewardsV2BackfillCandidateQuery {
  listAfter(
    afterCustomerId: CustomerId | null,
    limit: number,
  ): Promise<readonly RewardsV2BackfillCandidate[]>;
}

export interface RewardsV2BackfillOptions {
  dryRun: boolean;
  batchSize: number;
}

export interface RewardsV2BackfillResult {
  scanned: number;
  wouldCreate: number;
  wouldSynchronizeValidated: number;
  migrated: number;
  synchronizedValidated: number;
  alreadyExisting: number;
  failures: ReadonlyArray<{ customerId: CustomerId; code: string }>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface CandidateRow extends QueryResultRow {
  customer_id: string;
  registered_at: Date;
  validation_id: string | null;
  validation_status: string | null;
  validated_at: Date | null;
  journey_exists: boolean;
}

export class PostgresRewardsV2BackfillCandidateQuery implements RewardsV2BackfillCandidateQuery {
  constructor(private readonly database: Queryable) {}

  async listAfter(
    afterCustomerId: CustomerId | null,
    limit: number,
  ): Promise<readonly RewardsV2BackfillCandidate[]> {
    requireBatchSize(limit);
    const result = await this.database.query<CandidateRow>(`
      SELECT customer.id::text AS customer_id,
        COALESCE(validation.registered_at, customer.created_at) AS registered_at,
        validation.id::text AS validation_id,
        validation.status AS validation_status,
        validation.validated_at,
        (journey.id IS NOT NULL) AS journey_exists
      FROM customers AS customer
      LEFT JOIN sisca_validations AS validation ON validation.customer_id = customer.id
      LEFT JOIN rewards_v2_journeys AS journey ON journey.customer_id = customer.id
      WHERE ($1::uuid IS NULL OR customer.id > $1::uuid)
      ORDER BY customer.id
      LIMIT $2
    `, [afterCustomerId, limit]);
    return result.rows.map((row) => {
      const validated = row.validation_status === "VALIDATED"
        && row.validated_at !== null
        && row.validation_id !== null;
      return {
        customerId: asCustomerId(row.customer_id),
        registeredAt: row.registered_at,
        validationStatus: row.validation_status ?? "PENDING",
        validatedAfore: validated ? {
          provider: "SISCA",
          productType: "AFORE",
          sourceId: `sisca-validation:${row.validation_id}`,
          validatedAt: row.validated_at!,
        } : null,
        journeyExists: row.journey_exists,
      };
    });
  }
}

export class BackfillRewardsV2Journeys {
  constructor(
    private readonly candidates: RewardsV2BackfillCandidateQuery,
    private readonly journeys: RewardsV2LiveJourneyPort,
  ) {}

  async execute(options: RewardsV2BackfillOptions): Promise<RewardsV2BackfillResult> {
    requireBatchSize(options.batchSize);
    const result: MutableBackfillResult = {
      scanned: 0,
      wouldCreate: 0,
      wouldSynchronizeValidated: 0,
      migrated: 0,
      synchronizedValidated: 0,
      alreadyExisting: 0,
      failures: [],
    };
    let cursor: CustomerId | null = null;

    while (true) {
      const batch = await this.candidates.listAfter(cursor, options.batchSize);
      if (batch.length === 0) break;
      for (const candidate of batch) {
        result.scanned += 1;
        if (options.dryRun) {
          if (!candidate.journeyExists) result.wouldCreate += 1;
          if (candidate.validatedAfore) result.wouldSynchronizeValidated += 1;
          continue;
        }
        try {
          const wasExisting = candidate.journeyExists;
          await this.journeys.synchronize(candidate);
          if (wasExisting) result.alreadyExisting += 1;
          else result.migrated += 1;
          if (candidate.validatedAfore) result.synchronizedValidated += 1;
        } catch (error) {
          result.failures.push({
            customerId: candidate.customerId,
            code: safeErrorCode(error),
          });
        }
      }
      cursor = batch.at(-1)!.customerId;
      if (batch.length < options.batchSize) break;
    }
    return result;
  }
}

interface MutableBackfillResult extends Omit<RewardsV2BackfillResult, "failures"> {
  failures: Array<{ customerId: CustomerId; code: string }>;
}

function requireBatchSize(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error("Backfill batch size must be between 1 and 1000");
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) return error.code;
  return "v2_journey_backfill_failed";
}
