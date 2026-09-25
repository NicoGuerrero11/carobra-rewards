import type { QueryResult, QueryResultRow } from "pg";

import type { CustomerId } from "../shared/identifiers.js";

export type RewardsIneligibilityReason =
  | "customer_not_found"
  | "customer_inactive"
  | "sisca_not_validated"
  | "afore_relation_inactive";

export interface RewardsEligibility {
  customerId: CustomerId;
  eligible: boolean;
  reason: RewardsIneligibilityReason | null;
  customerStatus: string | null;
  siscaValidationStatus: string | null;
  aforeRelationStatus: string | null;
  aforeRelationStartedAt: Date | null;
  validatedAt: Date | null;
}

export interface RewardsEligibilityQuery {
  getForAuthenticatedCustomer(customerId: CustomerId): Promise<RewardsEligibility>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<TRow>>;
}

interface EligibilityRow extends QueryResultRow {
  customer_id: string;
  customer_status: string;
  sisca_validation_status: string | null;
  validated_at: Date | null;
  afore_relation_status: string | null;
  afore_relation_started_at: Date | null;
}

export class PostgresRewardsEligibilityQuery implements RewardsEligibilityQuery {
  constructor(private readonly database: Queryable) {}

  async getForAuthenticatedCustomer(customerId: CustomerId): Promise<RewardsEligibility> {
    const result = await this.database.query<EligibilityRow>(`
      SELECT
        customer.id::text AS customer_id,
        customer.customer_status,
        validation.status AS sisca_validation_status,
        validation.validated_at,
        afore_relation.status AS afore_relation_status,
        afore_relation.started_at AS afore_relation_started_at
      FROM customers AS customer
      LEFT JOIN sisca_validations AS validation
        ON validation.customer_id = customer.id
      LEFT JOIN services AS afore_service
        ON afore_service.code = 'AFORE'
        AND afore_service.is_active = true
      LEFT JOIN customer_services AS afore_relation
        ON afore_relation.customer_id = customer.id
        AND afore_relation.service_id = afore_service.id
      WHERE customer.id = $1
      LIMIT 1
    `, [customerId]);

    const row = result.rows[0];
    if (!row) {
      return {
        customerId,
        eligible: false,
        reason: "customer_not_found",
        customerStatus: null,
        siscaValidationStatus: null,
        aforeRelationStatus: null,
        aforeRelationStartedAt: null,
        validatedAt: null,
      };
    }

    const reason = ineligibilityReason(row);
    return {
      customerId,
      eligible: reason === null,
      reason,
      customerStatus: row.customer_status,
      siscaValidationStatus: row.sisca_validation_status,
      aforeRelationStatus: row.afore_relation_status,
      aforeRelationStartedAt: row.afore_relation_started_at,
      validatedAt: row.validated_at,
    };
  }
}

function ineligibilityReason(row: EligibilityRow): RewardsIneligibilityReason | null {
  if (row.customer_status === "INACTIVE" || row.customer_status === "BLOCKED") {
    return "customer_inactive";
  }
  if (row.sisca_validation_status !== "VALIDATED" || row.validated_at === null) {
    return "sisca_not_validated";
  }
  if (row.customer_status !== "ACTIVE") return "customer_inactive";
  if (row.afore_relation_status !== "ACTIVE" || row.afore_relation_started_at === null) {
    return "afore_relation_inactive";
  }
  return null;
}
