import type { PoolClient } from "pg";
import { bondaAffiliationEvents } from "../../database/migrations/028-bonda-affiliation-events.js";

/** Explicitly installs only event capture, which stays OFF after installation. */
export async function prepareAffiliateEventSchema(client: PoolClient, apply: boolean) {
  await client.query("SELECT pg_advisory_lock(72420260714)");
  try {
    const applied = new Set((await client.query<{ id: string }>("SELECT id FROM site_backend_migrations")).rows.map(row => row.id));
    for (const dependency of ["021_rewards_v2_canonical", "022_bonda_coupons"]) {
      if (!applied.has(dependency)) throw new Error("AFFILIATION_SCHEMA_DEPENDENCY_MISSING");
    }
    if (applied.has(bondaAffiliationEvents.id)) return { state: "ALREADY_APPLIED", migration: bondaAffiliationEvents.id };
    if (!apply) return { state: "PLANNED", migration: bondaAffiliationEvents.id, captureEnabled: false };
    await client.query("BEGIN");
    try {
      await client.query(bondaAffiliationEvents.up);
      await client.query("INSERT INTO site_backend_migrations(id) VALUES ($1)", [bondaAffiliationEvents.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    return { state: "APPLIED", migration: bondaAffiliationEvents.id, captureEnabled: false };
  } finally { await client.query("SELECT pg_advisory_unlock(72420260714)"); }
}
