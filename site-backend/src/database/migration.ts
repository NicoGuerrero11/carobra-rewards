import type { PoolClient } from "pg";

import { rewardsBaselineConfiguration } from "./migrations/005-rewards-baseline-configuration.ts";

import { rewardsReferralsProductsAdvisors } from "./migrations/004-rewards-referrals-products-advisors.ts";

import { rewardsCatalogRedemptions } from "./migrations/003-rewards-catalog-redemptions.ts";

import { rewardsJobFoundation } from "./migrations/002-rewards-jobs.ts";

import { rewardsLedgerFoundation } from "./migrations/001-rewards-ledger-foundation.ts";

export interface Migration {
  id: string;
  up: string;
  down: string;
}

export const migrations: readonly Migration[] = [
  rewardsBaselineConfiguration,
  rewardsReferralsProductsAdvisors,
  rewardsCatalogRedemptions,
  rewardsJobFoundation,
  rewardsLedgerFoundation,
];

export async function migrate(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_lock(724_202_607_14)");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_backend_migrations (
        id varchar(120) PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set<string>(
      (await client.query<{ id: string }>("SELECT id FROM site_backend_migrations")).rows.map(
        (row) => row.id,
      ),
    );
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.up);
        await client.query("INSERT INTO site_backend_migrations (id) VALUES ($1)", [migration.id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(724_202_607_14)");
  }
}

export async function rollbackLatest(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_lock(724_202_607_14)");
  try {
    const latest = (
      await client.query<{ id: string }>(
        "SELECT id FROM site_backend_migrations ORDER BY applied_at DESC, id DESC LIMIT 1",
      )
    ).rows[0];
    if (!latest) return;
    const migration = migrations.find((candidate) => candidate.id === latest.id);
    if (!migration) throw new Error(`Unknown applied migration: ${latest.id}`);
    await client.query("BEGIN");
    try {
      await client.query(migration.down);
      await client.query("DELETE FROM site_backend_migrations WHERE id = $1", [migration.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(724_202_607_14)");
  }
}
