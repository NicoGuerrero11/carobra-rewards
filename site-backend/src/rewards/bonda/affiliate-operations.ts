import type { QueryResult, QueryResultRow } from "pg";

import type { BondaAffiliateProvisioningApplication } from "./affiliate-provisioning.js";
import type { CustomerId } from "../shared/identifiers.js";

export interface BondaBackfillCustomer {
  customerId: CustomerId;
  rewardsId: string;
}

export interface BondaBackfillSource {
  listMissing(limit: number): Promise<readonly BondaBackfillCustomer[]>;
}

interface Queryable {
  query<TRow extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>>;
}

interface CustomerRow extends QueryResultRow {
  id: string;
  rewards_id: string;
}

export class PostgresBondaBackfillSource implements BondaBackfillSource {
  constructor(private readonly database: Queryable) {}

  async listMissing(limit: number): Promise<readonly BondaBackfillCustomer[]> {
    requireLimit(limit);
    const rows = (await this.database.query<CustomerRow>(`
      SELECT customer.id::text, customer.rewards_id
      FROM customers AS customer
      LEFT JOIN bonda_affiliate_provisioning AS provisioning
        ON provisioning.customer_id = customer.id
      WHERE provisioning.customer_id IS NULL
      ORDER BY customer.id
      LIMIT $1
    `, [limit])).rows;
    return rows.map((row) => ({
      customerId: row.id as CustomerId,
      rewardsId: row.rewards_id,
    }));
  }
}

export class BackfillBondaAffiliates {
  constructor(
    private readonly source: BondaBackfillSource,
    private readonly application: BondaAffiliateProvisioningApplication,
  ) {}

  async run(input: { limit: number; apply: boolean }): Promise<{
    scanned: number;
    attempted: number;
    active: number;
    pending: number;
    actionRequired: number;
  }> {
    requireLimit(input.limit);
    const customers = await this.source.listMissing(input.limit);
    if (!input.apply) {
      return {
        scanned: customers.length,
        attempted: 0,
        active: 0,
        pending: 0,
        actionRequired: 0,
      };
    }
    let active = 0;
    let pending = 0;
    let actionRequired = 0;
    for (const customer of customers) {
      const status = await this.application.afterRegistration(customer);
      if (status.state === "ACTIVE") active += 1;
      else if (status.state === "ACTION_REQUIRED") actionRequired += 1;
      else pending += 1;
    }
    return {
      scanned: customers.length,
      attempted: customers.length,
      active,
      pending,
      actionRequired,
    };
  }
}

function requireLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Bonda affiliate operation limit must be between 1 and 100");
  }
}
