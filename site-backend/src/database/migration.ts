import type { PoolClient } from "pg";

import { rewardsLedgerFoundation } from "./migrations/001-rewards-ledger-foundation.js";
import { rewardsJobFoundation } from "./migrations/002-rewards-jobs.js";
import { rewardsCatalogRedemptions } from "./migrations/003-rewards-catalog-redemptions.js";
import { rewardsReferralsProductsAdvisors } from "./migrations/004-rewards-referrals-products-advisors.js";
import { rewardsBaselineConfiguration } from "./migrations/005-rewards-baseline-configuration.js";
import { rewardsOnboardingEvidence } from "./migrations/006-rewards-onboarding-evidence.js";
import { rewardsMonthlyInteractions } from "./migrations/007-rewards-monthly-interactions.js";
import { rewardsVerifiedBirthDates } from "./migrations/008-rewards-verified-birth-dates.js";
import { rewardsMvpCatalog } from "./migrations/009-rewards-mvp-catalog.js";
import { rewardsCatalogAdministration } from "./migrations/010-rewards-catalog-administration.js";
import { rewardsEntitlementUse } from "./migrations/011-rewards-entitlement-use.js";
import { redemptionLimitPolicies } from "./migrations/012-redemption-limit-policies.js";
import { referralAttributionPolicies } from "./migrations/013-referral-attribution-policies.js";
import { referralInvitationLinks } from "./migrations/014-referral-invitation-links.js";
import { expirationNotificationDeliveries } from "./migrations/015-expiration-notification-deliveries.js";
import { expectedRedemptionAssumptions } from "./migrations/016-expected-redemption-assumptions.js";
import { rewardsJobManualRetries } from "./migrations/017-rewards-job-manual-retries.js";
import { rewardsV2Foundation } from "./migrations/018-rewards-v2-foundation.js";
import { rewardsV2LiveJourney } from "./migrations/019-rewards-v2-live-journey.js";

export interface Migration {
  id: string;
  up: string;
  down: string;
}

export const migrations: readonly Migration[] = [
  rewardsLedgerFoundation,
  rewardsJobFoundation,
  rewardsCatalogRedemptions,
  rewardsReferralsProductsAdvisors,
  rewardsBaselineConfiguration,
  rewardsOnboardingEvidence,
  rewardsMonthlyInteractions,
  rewardsVerifiedBirthDates,
  rewardsMvpCatalog,
  rewardsCatalogAdministration,
  rewardsEntitlementUse,
  redemptionLimitPolicies,
  referralAttributionPolicies,
  referralInvitationLinks,
  expirationNotificationDeliveries,
  expectedRedemptionAssumptions,
  rewardsJobManualRetries,
  rewardsV2Foundation,
  rewardsV2LiveJourney,
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
