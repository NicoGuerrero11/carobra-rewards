import type { QueryResultRow } from "pg";
import type { CustomerId } from "../shared/identifiers.js";

export interface BondaAffiliateEligibility {
  read(customerId: CustomerId): Promise<{ rewardsId: string; eligible: boolean } | null>;
}
export const deniedAffiliateEligibility: BondaAffiliateEligibility = { read: async () => null };

interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}
/** Canonical database facts only; never accepts a level supplied by a caller or cookie. */
export class PostgresBondaAffiliateEligibility implements BondaAffiliateEligibility {
  constructor(private readonly database: Queryable) {}
  async read(customerId: CustomerId) {
    const row = (await this.database.query<{ rewards_id: string; eligible: boolean }>(`
      SELECT c.rewards_id,
        COALESCE(c.customer_status = 'ACTIVE' AND j.state = 'ACTIVE'
          AND j.current_level IN ('BRONZE','SILVER','GOLD','PLATINUM','TITANIUM'), false) AS eligible
      FROM customers c LEFT JOIN rewards_v2_journeys j ON j.customer_id = c.id
      WHERE c.id = $1`, [customerId])).rows[0];
    return row ? { rewardsId: row.rewards_id, eligible: row.eligible } : null;
  }
}
