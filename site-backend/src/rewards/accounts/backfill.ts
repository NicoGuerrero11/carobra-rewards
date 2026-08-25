import type { QueryResult, QueryResultRow } from "pg";

import type { RewardsActivationResult } from "./activation.js";
import type { RewardsActivationUseCase } from "./observe-validated-evidence.js";
import { asCustomerId, type CustomerId } from "../shared/identifiers.js";

export interface RewardsBackfillCandidate {
  customerId: CustomerId;
  validatedAt: Date;
}

export interface RewardsBackfillCandidateQuery {
  listEligibleAfter(
    afterCustomerId: CustomerId | null,
    limit: number,
  ): Promise<readonly RewardsBackfillCandidate[]>;
}

export interface RewardsBackfillOptions {
  dryRun: boolean;
  batchSize: number;
}

export interface RewardsBackfillResult {
  scanned: number;
  wouldActivate: number;
  activated: number;
  repairedAwards: number;
  replayed: number;
  failures: ReadonlyArray<{ customerId: CustomerId; code: string }>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface CandidateRow extends QueryResultRow {
  customer_id: string;
  validated_at: Date;
}

export class PostgresRewardsBackfillCandidateQuery implements RewardsBackfillCandidateQuery {
  constructor(private readonly database: Queryable) {}

  async listEligibleAfter(
    afterCustomerId: CustomerId | null,
    limit: number,
  ): Promise<readonly RewardsBackfillCandidate[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("Backfill batch size must be between 1 and 1000");
    }
    const result = await this.database.query<CandidateRow>(`
      SELECT customer.id::text AS customer_id, validation.validated_at
      FROM customers AS customer
      JOIN sisca_validations AS validation
        ON validation.customer_id = customer.id
        AND validation.status = 'VALIDATED'
        AND validation.validated_at IS NOT NULL
      JOIN customer_services AS afore_relation
        ON afore_relation.customer_id = customer.id
        AND afore_relation.status = 'ACTIVE'
        AND afore_relation.started_at IS NOT NULL
      JOIN services AS afore_service
        ON afore_service.id = afore_relation.service_id
        AND afore_service.code = 'AFORE'
        AND afore_service.is_active = true
      WHERE customer.customer_status = 'ACTIVE'
        AND ($1::uuid IS NULL OR customer.id > $1::uuid)
      ORDER BY customer.id
      LIMIT $2
    `, [afterCustomerId, limit]);
    return result.rows.map((row) => ({
      customerId: asCustomerId(row.customer_id),
      validatedAt: row.validated_at,
    }));
  }
}

export class BackfillRewardsAccounts {
  constructor(
    private readonly candidates: RewardsBackfillCandidateQuery,
    private readonly activation: RewardsActivationUseCase,
  ) {}

  async execute(options: RewardsBackfillOptions): Promise<RewardsBackfillResult> {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 1000) {
      throw new Error("Backfill batch size must be between 1 and 1000");
    }
    const result: MutableBackfillResult = {
      scanned: 0,
      wouldActivate: 0,
      activated: 0,
      repairedAwards: 0,
      replayed: 0,
      failures: [],
    };
    let cursor: CustomerId | null = null;

    while (true) {
      const batch = await this.candidates.listEligibleAfter(cursor, options.batchSize);
      if (batch.length === 0) break;
      for (const candidate of batch) {
        result.scanned += 1;
        if (options.dryRun) {
          result.wouldActivate += 1;
          continue;
        }
        try {
          classifyActivation(await this.activation.execute(candidate), result);
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

interface MutableBackfillResult extends Omit<RewardsBackfillResult, "failures"> {
  failures: Array<{ customerId: CustomerId; code: string }>;
}

function classifyActivation(
  activation: RewardsActivationResult,
  result: MutableBackfillResult,
): void {
  if (activation.accountCreated) {
    result.activated += 1;
    return;
  }
  if (activation.registrationAwardIssued) {
    result.repairedAwards += 1;
    return;
  }
  result.replayed += 1;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "activation_failed";
}
