import type { QueryResultRow } from "pg";
import { asCustomerId } from "../shared/identifiers.js";
import type { DueJobProcessor } from "../operations/scheduler-runner.js";
import type { BondaAffiliateProvisioningHttpApplication } from "./affiliate-provisioning.js";

interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}
/** Consumes level changes from any product source; base provisioning owns the exclusive claim. */
export class BondaAffiliateEventWorker implements DueJobProcessor {
  constructor(
    private readonly database: Queryable,
    private readonly application: BondaAffiliateProvisioningHttpApplication,
    private readonly enabled: boolean,
  ) {}

  async processDue(_asOf: Date, batchSize: number, _workerId: string) {
    if (!this.enabled) return { processedJobs: 0, failedJobs: 0 };
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("invalid_affiliation_batch_size");
    const control = (await this.database.query(`SELECT capture_enabled FROM bonda_affiliation_event_controls WHERE singleton`)).rows[0];
    if (control?.capture_enabled !== true) return { processedJobs: 0, failedJobs: 0 };
    const events = (await this.database.query<{ customer_id: string; generation: string }>(`
      SELECT customer_id::text, generation::text FROM bonda_affiliation_events
      WHERE generation > processed_generation AND next_attempt_at <= now()
      ORDER BY next_attempt_at, customer_id LIMIT $1`, [batchSize])).rows;
    let failedJobs = 0;
    for (const event of events) {
      try {
        // Fetch current code; the application independently checks canonical level/status before dispatch.
        const customer = (await this.database.query<{ rewards_id: string }>(
          `SELECT rewards_id FROM customers WHERE id = $1`, [event.customer_id])).rows[0];
        const result = customer ? await this.application.ensureForBenefits({
          customerId: asCustomerId(event.customer_id), rewardsId: customer.rewards_id,
        }) : { state: "DISABLED" };
        const retry = result.state === "PENDING";
        await this.database.query(`UPDATE bonda_affiliation_events SET
          processed_generation = CASE WHEN $3 THEN processed_generation ELSE GREATEST(processed_generation, $2::bigint) END,
          next_attempt_at = CASE WHEN $3 THEN now() + interval '1 minute' ELSE now() END
          WHERE customer_id = $1`, [event.customer_id, event.generation, retry]);
        if (retry) failedJobs++;
      } catch {
        failedJobs++;
        await this.database.query(`UPDATE bonda_affiliation_events SET next_attempt_at = now() + interval '1 minute'
          WHERE customer_id = $1`, [event.customer_id]).catch(() => undefined);
      }
    }
    return { processedJobs: events.length, failedJobs };
  }
}
