import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import { createDatabase } from "../src/database/connection.js";
import { migrate, migrations, rollbackLatest } from "../src/database/migration.js";
import {
  PostgresRewardsAccountActivation,
  type RewardsActivationResult,
} from "../src/rewards/accounts/activation.js";
import {
  PostgresOnboardingEvidenceStore,
  RecordOnboardingEvidence,
  type OnboardingEvidenceType,
} from "../src/rewards/behaviors/onboarding.js";
import {
  IngestQualifyingSiteAction,
  PostgresMonthlyInteractionStore,
} from "../src/rewards/behaviors/monthly-interaction.js";
import {
  PostgresBirthdayScheduler,
  PostgresVerifiedBirthDateStore,
  RecordVerifiedBirthDate,
} from "../src/rewards/behaviors/birthday.js";
import {
  PostgresAforeAnniversarySchedule,
  PostgresAforeAnniversaryScheduler,
} from "../src/rewards/behaviors/afore-anniversary.js";
import { IngestAveContribution } from "../src/rewards/behaviors/ave.js";
import { PostgresBehaviorRuleLookup } from "../src/rewards/behaviors/rule-lookup.js";
import {
  ManageCatalog,
  PostgresCatalogAdministration,
} from "../src/rewards/catalog/administration.js";
import {
  ManageFreeEntitlements,
  PostgresFreeEntitlements,
} from "../src/rewards/catalog/entitlements.js";
import {
  CreatePointRedemption,
  PostgresPointRedemptions,
} from "../src/rewards/catalog/redemption.js";
import {
  AttributeReferral,
  PostgresReferralAttributions,
} from "../src/rewards/referrals/attribution.js";
import {
  ConfirmReferralRegistration,
  PostgresReferralRegistrationAwards,
} from "../src/rewards/referrals/registration-award.js";
import {
  PostgresReferralPermanenceSchedule,
  PostgresReferralPermanenceScheduler,
  ScheduleReferralPermanence,
} from "../src/rewards/referrals/permanence.js";
import {
  DefaultReferralHttpApplication,
  PostgresReferralCustomerExperience,
} from "../src/rewards/referrals/http-application.js";
import { PostgresPointAllocation } from "../src/rewards/ledger/allocation.js";
import { PostgresPointBalanceStore } from "../src/rewards/ledger/balance.js";
import { PostgresLedgerCompensation } from "../src/rewards/ledger/compensation.js";
import { PostgresPointExpiration } from "../src/rewards/ledger/expiration.js";
import { PostgresPointIssuance } from "../src/rewards/ledger/issuance.js";
import { normalizeRewardEvent } from "../src/rewards/ledger/reward-event.js";
import {
  PostgresExpirationNotificationSchedule,
  PostgresExpirationNotificationScheduler,
  type ExpirationNotificationDeliveryCommand,
} from "../src/rewards/operations/expiration-notifications.js";
import { PostgresFinancialReporting } from "../src/rewards/operations/financial-reporting.js";
import {
  OperateRewardsJobs,
  PostgresRewardsJobOperations,
} from "../src/rewards/operations/job-operations.js";
import { RewardsError } from "../src/rewards/shared/errors.js";
import { FixedClock } from "../src/rewards/shared/clock.js";
import {
  asCustomerId,
  type CorrelationId,
  type RewardsAccountId,
} from "../src/rewards/shared/identifiers.js";

const configuredTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

test(
  "Rewards migrations round-trip with constraints, relationships, and baseline seeds",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    const primaryDatabaseUrl = process.env.DATABASE_URL?.trim();
    if (primaryDatabaseUrl && normalizeDatabaseUrl(primaryDatabaseUrl) === testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL must be different from DATABASE_URL");
    }

    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_test_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");

      await migrate(client);

      const applied = await client.query<{ id: string }>(
        "SELECT id FROM site_backend_migrations ORDER BY id",
      );
      assert.deepEqual(applied.rows.map((row) => row.id), migrations.map((migration) => migration.id));

      const rules = await client.query<{
        code: string;
        version: number;
        enabled: boolean;
        point_value: string | null;
        disabled_reason: string | null;
      }>(`
        SELECT code, version, enabled, point_value, disabled_reason
        FROM behavior_rule_versions
        ORDER BY code, version
      `);
      assert.equal(rules.rows.length, 16);
      assertRule(rules.rows, "REGISTRATION_ACTIVATION", true, "2000");
      assertRule(rules.rows, "AFORE_ANNIVERSARY_18_MONTHS", true, "35000");
      for (const code of [
        "MONTHLY_INTERACTION",
        "BIRTHDAY",
        "AVE_CONFIRMED_CONTRIBUTION",
        "QUALITAS_ACTIVATION",
        "CATALOG_REDEMPTION",
      ]) {
        const rule = rules.rows.find((candidate) => candidate.code === code);
        assert.equal(rule?.enabled, false);
        assert.ok(rule?.disabled_reason);
      }
      const catalogGate = rules.rows.find((candidate) => (
        candidate.code === "CATALOG_REDEMPTION" && candidate.version === 2
      ));
      assert.equal(catalogGate?.enabled, false);
      assert.match(catalogGate?.disabled_reason ?? "", /catalog is loaded/);

      const baselineRedemptionLimit = await client.query<{
        enabled: boolean;
        scope_type: string;
        monthly_limit: number | null;
        business_timezone: string | null;
        disabled_reason: string | null;
        approved_at: Date | null;
      }>(`
        SELECT enabled, scope_type, monthly_limit, business_timezone,
          disabled_reason, approved_at
        FROM redemption_limit_policy_versions
        WHERE code = 'CUSTOMER_MONTHLY_REDEMPTIONS' AND version = 1
      `);
      assert.deepEqual(baselineRedemptionLimit.rows[0], {
        enabled: false,
        scope_type: "GLOBAL",
        monthly_limit: null,
        business_timezone: null,
        disabled_reason:
          "The monthly redemption limit, scope, and business timezone are pending team approval.",
        approved_at: null,
      });

      const expectedRedemption = await client.query<{
        enabled: boolean;
        expected_redemption_basis_points: number;
        approved_by: string;
      }>(`
        SELECT enabled, expected_redemption_basis_points, approved_by
        FROM expected_redemption_assumption_versions
        WHERE code = 'EXPECTED_REDEMPTION' AND version = 1
      `);
      assert.deepEqual(expectedRedemption.rows[0], {
        enabled: true,
        expected_redemption_basis_points: 6000,
        approved_by: "MVP_DESIGN_BASELINE",
      });

      const catalogItems = await client.query<{
        code: string;
        mode: string;
        enabled: boolean;
        point_price: string | null;
        inventory_mode: string;
        partner_dependency: string | null;
        disabled_reason: string | null;
        total_capacity: number | null;
      }>(`
        SELECT
          item.code,
          item.mode,
          item.enabled,
          item.point_price,
          item.inventory_mode,
          item.partner_dependency,
          item.disabled_reason,
          inventory.total_capacity
        FROM catalog_items AS item
        JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = item.id
        ORDER BY item.code
      `);
      assert.equal(catalogItems.rows.length, 12);
      assert.ok(catalogItems.rows.every((item) => !item.enabled && item.disabled_reason));
      const catalogByCode = new Map(catalogItems.rows.map((item) => [item.code, item]));
      assert.deepEqual(catalogByCode.get("CINEPOLIS_ONBOARDING_2_TICKETS"), {
        code: "CINEPOLIS_ONBOARDING_2_TICKETS",
        mode: "FREE_ENTITLEMENT",
        enabled: false,
        point_price: null,
        inventory_mode: "CONTROLLED",
        partner_dependency: "CINEPOLIS",
        disabled_reason: "The Cinepolis agreement and fulfillment process are not approved.",
        total_capacity: 500,
      });
      assert.equal(catalogByCode.get("AMAZON_GIFT_CARD_200_REACTIVATION")?.point_price, null);
      assert.deepEqual(catalogByCode.get("CAROBRA_ANNIVERSARY_PARTY"), {
        code: "CAROBRA_ANNIVERSARY_PARTY",
        mode: "POINTS",
        enabled: false,
        point_price: "100000",
        inventory_mode: "WAITLIST",
        partner_dependency: null,
        disabled_reason:
          "The event date, exact capacity, fulfillment owner, and cancellation policy are not approved.",
        total_capacity: 0,
      });
      assert.equal(catalogByCode.get("PUERTO_VALLARTA_4D3N_COUPLE")?.point_price, "350000");
      assert.equal(catalogByCode.get("QUALITAS_POLICY_DISCOUNT")?.mode, "PRODUCT_BENEFIT");

      const catalogAdministration = new ManageCatalog(
        new PostgresCatalogAdministration(new SchemaTransactionalDatabase(database, schema)),
        new FixedClock(new Date("2026-07-14T16:00:00.000Z")),
      );
      const catalogOperator = {
        id: "catalog-operator-1",
        permissions: ["rewards:catalog:manage"],
      };
      const createCommand = {
        code: "POSTGRES_TEST_REWARD",
        expectedCurrentVersion: null,
        name: "PostgreSQL test reward",
        description: "Catalog administration integration fixture",
        mode: "POINTS" as const,
        enabled: true,
        pointPrice: 500n,
        eligibilityRule: {},
        inventoryMode: "CONTROLLED" as const,
        fulfillmentMode: "INTERNAL",
        partnerDependency: null,
        effectiveFrom: new Date("2026-07-15T00:00:00.000Z"),
        effectiveTo: null,
        disabledReason: null,
        totalCapacity: 3,
        idempotencyKey: "catalog-postgres-create",
        correlationId: "00000000-0000-4000-8000-000000007901" as CorrelationId,
        reasonCode: "INTEGRATION_TEST",
        explanation: "Create a catalog item through the authorized application service",
      };
      assert.throws(
        () => catalogAdministration.createVersion({ id: "viewer", permissions: [] }, createCommand),
        (error: unknown) => error instanceof RewardsError && error.code === "forbidden",
      );
      const createdCatalogItem = await catalogAdministration.createVersion(
        catalogOperator,
        createCommand,
      );
      assert.equal(createdCatalogItem.version, 1);
      assert.equal(createdCatalogItem.replayed, false);
      const replayedCatalogItem = await catalogAdministration.createVersion(
        catalogOperator,
        createCommand,
      );
      assert.equal(replayedCatalogItem.catalogItemId, createdCatalogItem.catalogItemId);
      assert.equal(replayedCatalogItem.replayed, true);

      const versionedCatalogItem = await catalogAdministration.createVersion(catalogOperator, {
        ...createCommand,
        expectedCurrentVersion: 1,
        pointPrice: 750n,
        totalCapacity: 4,
        effectiveFrom: new Date("2026-07-16T00:00:00.000Z"),
        idempotencyKey: "catalog-postgres-version",
        correlationId: "00000000-0000-4000-8000-000000007902" as CorrelationId,
        explanation: "Publish a prospective catalog version",
      });
      assert.equal(versionedCatalogItem.version, 2);

      const capacity = await catalogAdministration.changeCapacity(catalogOperator, {
        catalogItemId: versionedCatalogItem.catalogItemId,
        totalCapacity: 5,
        idempotencyKey: "catalog-postgres-capacity",
        correlationId: "00000000-0000-4000-8000-000000007903" as CorrelationId,
        reasonCode: "INTEGRATION_TEST",
        explanation: "Increase approved capacity",
      });
      assert.equal(capacity.totalCapacity, 5);
      await client.query(`
        UPDATE catalog_inventory SET reserved_quantity = 2, fulfilled_quantity = 1
        WHERE catalog_item_id = $1
      `, [versionedCatalogItem.catalogItemId]);
      await assert.rejects(
        catalogAdministration.changeCapacity(catalogOperator, {
          catalogItemId: versionedCatalogItem.catalogItemId,
          totalCapacity: 2,
          idempotencyKey: "catalog-postgres-invalid-capacity",
          correlationId: "00000000-0000-4000-8000-000000007904" as CorrelationId,
          reasonCode: "INTEGRATION_TEST",
          explanation: "Attempt to break active commitments",
        }),
        /commitments exceed capacity/,
      );
      const closedCatalogItem = await catalogAdministration.closeVersion(catalogOperator, {
        catalogItemId: versionedCatalogItem.catalogItemId,
        closeAt: new Date("2026-07-20T00:00:00.000Z"),
        idempotencyKey: "catalog-postgres-close",
        correlationId: "00000000-0000-4000-8000-000000007905" as CorrelationId,
        reasonCode: "INTEGRATION_TEST",
        explanation: "Close catalog availability prospectively",
      });
      assert.equal(closedCatalogItem.effectiveTo.toISOString(), "2026-07-20T00:00:00.000Z");

      const managedVersions = await client.query<{
        id: string;
        version: number;
        point_price: string;
        effective_to: Date | null;
      }>(`
        SELECT id::text, version, point_price::text, effective_to
        FROM catalog_items WHERE code = 'POSTGRES_TEST_REWARD' ORDER BY version
      `);
      assert.equal(managedVersions.rows.length, 2);
      assert.equal(managedVersions.rows[0]?.effective_to?.toISOString(), "2026-07-16T00:00:00.000Z");
      assert.equal(managedVersions.rows[1]?.point_price, "750");
      assert.equal(managedVersions.rows[1]?.effective_to?.toISOString(), "2026-07-20T00:00:00.000Z");
      const catalogAudits = await client.query<{
        operation: string;
        actor_id: string;
      }>(`
        SELECT operation, actor_id FROM catalog_operation_audit
        WHERE catalog_item_id IN ($1, $2)
        ORDER BY created_at, operation
      `, [createdCatalogItem.catalogItemId, versionedCatalogItem.catalogItemId]);
      assert.equal(catalogAudits.rows.length, 4);
      assert.deepEqual(new Set(catalogAudits.rows.map((audit) => audit.operation)), new Set([
        "CREATE", "VERSION", "CAPACITY_CHANGE", "CLOSE",
      ]));
      assert.ok(catalogAudits.rows.every((audit) => audit.actor_id === catalogOperator.id));

      const freeCatalogItem = await catalogAdministration.createVersion(catalogOperator, {
        ...createCommand,
        code: "POSTGRES_TEST_FREE_ENTITLEMENT",
        mode: "FREE_ENTITLEMENT",
        pointPrice: null,
        totalCapacity: 1,
        effectiveFrom: new Date("2026-07-14T16:30:00.000Z"),
        idempotencyKey: "catalog-postgres-free-entitlement",
        correlationId: "00000000-0000-4000-8000-000000007906" as CorrelationId,
        explanation: "Create a controlled free-entitlement fixture",
      });
      const entitlementCustomerId = "00000000-0000-4000-8000-000000007907";
      const entitlementAccountId = "00000000-0000-4000-8000-000000007908" as RewardsAccountId;
      await client.query("INSERT INTO customers (id) VALUES ($1)", [entitlementCustomerId]);
      await client.query(`
        INSERT INTO rewards_accounts (
          id, customer_id, status, activated_at, created_at, updated_at
        ) VALUES ($1, $2, 'ACTIVE', $3, $3, $3)
      `, [entitlementAccountId, entitlementCustomerId, "2026-07-14T16:00:00.000Z"]);
      const freeEntitlements = new ManageFreeEntitlements(
        new PostgresFreeEntitlements(new SchemaTransactionalDatabase(database, schema)),
        new FixedClock(new Date("2026-07-14T17:00:00.000Z")),
      );
      const grantCommand = {
        accountId: entitlementAccountId,
        catalogItemId: freeCatalogItem.catalogItemId,
        rewardEventId: null,
        idempotencyKey: "entitlement-postgres-grant",
        expiresAt: new Date("2026-08-14T17:00:00.000Z"),
        safeMetadata: { source: "integration-test" },
      };
      const grantedEntitlement = await freeEntitlements.grant(grantCommand);
      assert.equal(grantedEntitlement.status, "AVAILABLE");
      assert.equal((await freeEntitlements.grant(grantCommand)).replayed, true);
      await assert.rejects(
        freeEntitlements.grant({
          ...grantCommand,
          idempotencyKey: "entitlement-postgres-over-capacity",
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "inventory_unavailable",
      );
      const usedEntitlement = await freeEntitlements.use({
        accountId: entitlementAccountId,
        entitlementId: grantedEntitlement.entitlementId,
        idempotencyKey: "entitlement-postgres-use",
      });
      assert.equal(usedEntitlement.status, "USED");
      assert.equal((await freeEntitlements.use({
        accountId: entitlementAccountId,
        entitlementId: grantedEntitlement.entitlementId,
        idempotencyKey: "entitlement-postgres-use",
      })).replayed, true);
      const entitlementState = await client.query<{
        available_points: string;
        reserved_points: string;
        reserved_quantity: number;
        fulfilled_quantity: number;
      }>(`
        SELECT account.available_points::text, account.reserved_points::text,
          inventory.reserved_quantity, inventory.fulfilled_quantity
        FROM rewards_accounts AS account
        CROSS JOIN catalog_inventory AS inventory
        WHERE account.id = $1 AND inventory.catalog_item_id = $2
      `, [entitlementAccountId, freeCatalogItem.catalogItemId]);
      assert.deepEqual(entitlementState.rows[0], {
        available_points: "0",
        reserved_points: "0",
        reserved_quantity: 0,
        fulfilled_quantity: 1,
      });
      const entitlementLedgerEntries = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM ledger_entries WHERE account_id = $1
      `, [entitlementAccountId]);
      assert.equal(entitlementLedgerEntries.rows[0]?.count, "0");

      await client.query(`
        UPDATE behavior_rule_versions SET effective_to = $1, updated_at = $1
        WHERE code = 'CATALOG_REDEMPTION' AND version = 2
      `, ["2026-07-14T18:00:00.000Z"]);
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from,
          created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000000117', 'CATALOG_REDEMPTION', 3,
          true, NULL, 'NORMAL_18_MONTHS', '{}',
          '{}', $1, $1, $1
        )
      `, ["2026-07-14T18:00:00.000Z"]);
      const pointCatalogItem = await catalogAdministration.createVersion(catalogOperator, {
        ...createCommand,
        code: "POSTGRES_POINT_REDEMPTION",
        pointPrice: 1000n,
        totalCapacity: 1,
        effectiveFrom: new Date("2026-07-14T18:00:00.000Z"),
        idempotencyKey: "catalog-postgres-point-redemption",
        correlationId: "00000000-0000-4000-8000-000000007909" as CorrelationId,
        explanation: "Create an enabled point-redemption fixture",
      });
      const redemptionCustomerId = "00000000-0000-4000-8000-000000007910";
      const redemptionAccountId = "00000000-0000-4000-8000-000000007911" as RewardsAccountId;
      const issuanceEntryId = "00000000-0000-4000-8000-000000007912";
      const pointLotId = "00000000-0000-4000-8000-000000007913";
      await client.query("INSERT INTO customers (id) VALUES ($1)", [redemptionCustomerId]);
      await client.query(`
        INSERT INTO rewards_accounts (
          id, customer_id, status, activated_at, available_points, created_at, updated_at
        ) VALUES ($1, $2, 'ACTIVE', $3, 2000, $3, $3)
      `, [redemptionAccountId, redemptionCustomerId, "2026-07-14T18:00:00.000Z"]);
      await client.query(`
        INSERT INTO ledger_entries (
          id, account_id, rule_version_id, entry_type, points_delta, idempotency_key,
          correlation_id, actor_type, created_at
        ) VALUES ($1, $2, '00000000-0000-4000-8000-000000000101', 'ISSUANCE',
          2000, 'redemption-fixture-issuance', $3, 'SYSTEM', $4)
      `, [issuanceEntryId, redemptionAccountId,
        "00000000-0000-4000-8000-000000007914", "2026-07-14T18:00:00.000Z"]);
      await client.query(`
        INSERT INTO point_lots (
          id, account_id, source_ledger_entry_id, issued_points, remaining_points,
          issued_at, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 2000, 2000, $4, $5, $4, $4)
      `, [pointLotId, redemptionAccountId, issuanceEntryId,
        "2026-07-14T18:00:00.000Z", "2028-01-14T18:00:00.000Z"]);
      const pointRedemptions = new CreatePointRedemption(
        new PostgresPointRedemptions(new SchemaTransactionalDatabase(database, schema)),
        new FixedClock(new Date("2026-07-14T19:00:00.000Z")),
      );
      const pointRedemptionCommand = {
        accountId: redemptionAccountId,
        catalogItemId: pointCatalogItem.catalogItemId,
        idempotencyKey: "postgres-point-redemption",
        correlationId: "00000000-0000-4000-8000-000000007915" as CorrelationId,
      };
      await assert.rejects(
        pointRedemptions.create(pointRedemptionCommand),
        (error: unknown) => error instanceof RewardsError
          && error.code === "rule_disabled"
          && error.details?.reason ===
            "The monthly redemption limit, scope, and business timezone are pending team approval.",
      );
      const stateBeforePolicyApproval = await client.query<{
        available_points: string;
        remaining_points: string;
        reserved_quantity: number;
        redemptions: string;
      }>(`
        SELECT account.available_points::text, lot.remaining_points::text,
          inventory.reserved_quantity,
          (SELECT count(*)::text FROM redemptions WHERE account_id = account.id) AS redemptions
        FROM rewards_accounts AS account
        JOIN point_lots AS lot ON lot.account_id = account.id
        JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = $2
        WHERE account.id = $1
      `, [redemptionAccountId, pointCatalogItem.catalogItemId]);
      assert.deepEqual(stateBeforePolicyApproval.rows[0], {
        available_points: "2000",
        remaining_points: "2000",
        reserved_quantity: 0,
        redemptions: "0",
      });
      await client.query(`
        UPDATE redemption_limit_policy_versions
        SET effective_to = $1, updated_at = $1
        WHERE code = 'CUSTOMER_MONTHLY_REDEMPTIONS' AND version = 1
      `, ["2026-07-14T18:30:00.000Z"]);
      await client.query(`
        INSERT INTO redemption_limit_policy_versions (
          id, code, version, enabled, scope_type, scope_key, monthly_limit,
          business_timezone, effective_from, disabled_reason,
          approved_by, approved_at, created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000000502',
          'CUSTOMER_MONTHLY_REDEMPTIONS', 2, true, 'GLOBAL', NULL, 1,
          'UTC', $1, NULL, 'rewards-product-owner', $1, $1, $1
        )
      `, ["2026-07-14T18:30:00.000Z"]);
      const pointRedemption = await pointRedemptions.create(pointRedemptionCommand);
      assert.equal(pointRedemption.pointsCost, 1000n);
      assert.equal(pointRedemption.availablePoints, 1000n);
      assert.equal((await pointRedemptions.create(pointRedemptionCommand)).replayed, true);
      await assert.rejects(
        pointRedemptions.create({
          ...pointRedemptionCommand,
          idempotencyKey: "postgres-point-redemption-monthly-excess",
          correlationId: "00000000-0000-4000-8000-000000007916" as CorrelationId,
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "monthly_limit_reached",
      );
      const pointRedemptionState = await client.query<{
        available_points: string;
        remaining_points: string;
        reserved_quantity: number;
        redemptions: string;
        allocations: string;
        limit_policy_version_id: string;
      }>(`
        SELECT account.available_points::text, lot.remaining_points::text,
          inventory.reserved_quantity,
          (SELECT count(*)::text FROM redemptions WHERE account_id = account.id) AS redemptions,
          (SELECT count(*)::text FROM redemption_allocations ra
            JOIN redemptions r ON r.id = ra.redemption_id WHERE r.account_id = account.id) AS allocations,
          (SELECT limit_policy_version_id::text FROM redemptions
            WHERE account_id = account.id LIMIT 1) AS limit_policy_version_id
        FROM rewards_accounts AS account
        JOIN point_lots AS lot ON lot.account_id = account.id
        JOIN catalog_inventory AS inventory ON inventory.catalog_item_id = $2
        WHERE account.id = $1
      `, [redemptionAccountId, pointCatalogItem.catalogItemId]);
      assert.deepEqual(pointRedemptionState.rows[0], {
        available_points: "1000",
        remaining_points: "1000",
        reserved_quantity: 1,
        redemptions: "1",
        allocations: "1",
        limit_policy_version_id: "00000000-0000-4000-8000-000000000502",
      });

      const compensationPolicy = await client.query<{
        enabled: boolean;
        advisor_share_rate: string;
        customer_benefit_share_rate: string;
        disabled_reason: string | null;
      }>(`
        SELECT enabled, advisor_share_rate, customer_benefit_share_rate, disabled_reason
        FROM compensation_policy_versions
        WHERE code = 'PLATFORM_CROSS_SELL_80_20'
      `);
      assert.deepEqual(compensationPolicy.rows[0], {
        enabled: false,
        advisor_share_rate: "0.800000",
        customer_benefit_share_rate: "0.200000",
        disabled_reason:
          "The final advisor matrix and active-platform evidence definition are not approved.",
      });

      await client.query(`
        DELETE FROM redemption_allocations WHERE redemption_id IN (
          SELECT id FROM redemptions WHERE account_id = $1
        )
      `, [redemptionAccountId]);
      await client.query(`DELETE FROM redemptions WHERE account_id = $1`, [redemptionAccountId]);
      await client.query(`
        DELETE FROM point_allocations WHERE ledger_entry_id IN (
          SELECT id FROM ledger_entries WHERE account_id = $1
        )
      `, [redemptionAccountId]);
      await client.query(`DELETE FROM entitlements WHERE account_id = $1`, [entitlementAccountId]);
      await client.query(`DELETE FROM point_lots WHERE account_id = $1`, [redemptionAccountId]);
      await client.query(`DELETE FROM ledger_entries WHERE account_id = $1`, [redemptionAccountId]);
      await client.query(`
        DELETE FROM catalog_operation_audit WHERE catalog_item_id IN (
          SELECT id FROM catalog_items WHERE code LIKE 'POSTGRES_%'
        )
      `);
      await client.query(`
        DELETE FROM catalog_inventory WHERE catalog_item_id IN (
          SELECT id FROM catalog_items WHERE code LIKE 'POSTGRES_%'
        )
      `);
      await client.query(`DELETE FROM catalog_items WHERE code LIKE 'POSTGRES_%'`);
      await client.query(`DELETE FROM rewards_accounts WHERE id IN ($1, $2)`, [
        entitlementAccountId,
        redemptionAccountId,
      ]);
      await client.query(`DELETE FROM customers WHERE id IN ($1, $2)`, [
        entitlementCustomerId,
        redemptionCustomerId,
      ]);
      await client.query(`
        DELETE FROM behavior_rule_versions
        WHERE id = '00000000-0000-4000-8000-000000000117'
      `);
      await client.query(`
        DELETE FROM redemption_limit_policy_versions
        WHERE id = '00000000-0000-4000-8000-000000000502'
      `);
      await client.query(`
        UPDATE redemption_limit_policy_versions
        SET effective_to = NULL, updated_at = '2026-07-14T12:00:00.000Z'
        WHERE id = '00000000-0000-4000-8000-000000000501'
      `);

      const foreignKeys = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM information_schema.table_constraints
        WHERE table_schema = $1 AND constraint_type = 'FOREIGN KEY'
      `, [schema]);
      assert.ok(Number(foreignKeys.rows[0]?.count) >= 25);

      await verifyBusinessConstraints(client);

      for (let remaining = migrations.length; remaining > 0; remaining -= 1) {
        await rollbackLatest(client);
      }
      const remainingMigrations = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM site_backend_migrations",
      );
      assert.equal(remainingMigrations.rows[0]?.count, "0");
      const rewardsAccountTable = await client.query<{ table_name: string | null }>(
        "SELECT to_regclass($1)::text AS table_name",
        [`${schema}.rewards_accounts`],
      );
      assert.equal(rewardsAccountTable.rows[0]?.table_name, null);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

test(
  "PostgreSQL referral attribution is replay-safe, conflict-aware, and monthly-policy controlled",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    assertDedicatedTestDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_referrals_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");
      await migrate(client);

      const referringCustomerId = asCustomerId("00000000-0000-4000-8000-000000006201");
      const competingCustomerId = asCustomerId("00000000-0000-4000-8000-000000006202");
      const referredCustomerId = asCustomerId("00000000-0000-4000-8000-000000006203");
      const lostServiceCustomerId = asCustomerId("00000000-0000-4000-8000-000000006211");
      const linkedCustomerId = asCustomerId("00000000-0000-4000-8000-000000006212");
      const referringAccountId = "00000000-0000-4000-8000-000000006204" as RewardsAccountId;
      const competingAccountId = "00000000-0000-4000-8000-000000006205" as RewardsAccountId;
      const attributedAt = new Date("2026-07-14T19:00:00.000Z");
      await client.query(
        "INSERT INTO customers (id) SELECT unnest($1::uuid[])",
        [[referringCustomerId, competingCustomerId, referredCustomerId,
          lostServiceCustomerId, linkedCustomerId]],
      );
      await client.query(`
        INSERT INTO rewards_accounts (
          id, customer_id, status, activated_at, created_at, updated_at
        ) VALUES
          ($1, $2, 'ACTIVE', $5, $5, $5),
          ($3, $4, 'ACTIVE', $5, $5, $5)
      `, [referringAccountId, referringCustomerId, competingAccountId,
        competingCustomerId, attributedAt]);
      await client.query(`
        INSERT INTO advisors (
          id, external_advisor_id, status, display_name, created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000006213', 'advisor-referrer-origin',
          'ACTIVE', 'Advisor origin', $1, $1
        )
      `, [attributedAt]);
      await client.query(`
        INSERT INTO advisor_attributions (
          id, advisor_id, customer_id, origin, source_id,
          attributed_at, created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000006214',
          '00000000-0000-4000-8000-000000006213', $2, 'ADVISOR',
          'advisor-origin-before-customer-referral', $1, $1, $1
        )
      `, [attributedAt, referringCustomerId]);

      const referrals = new AttributeReferral(
        new PostgresReferralAttributions(new SchemaTransactionalDatabase(database, schema)),
        new FixedClock(attributedAt),
      );
      const firstCommand = {
        referringAccountId,
        referredCustomerId,
        referringIdentityHash: "a".repeat(64),
        referredIdentityHash: "b".repeat(64),
        source: "BROWSER",
        sourceId: "postgres-referral-first",
        correlationId: "00000000-0000-4000-8000-000000006206" as CorrelationId,
      };
      await assert.rejects(
        referrals.attribute(firstCommand),
        (error: unknown) => error instanceof RewardsError
          && error.code === "rule_disabled"
          && error.details?.reason ===
            "The monthly referral limit, business timezone, and excess outcome are pending team approval.",
      );
      await client.query(`
        UPDATE referral_limit_policy_versions
        SET effective_to = $1, updated_at = $1
        WHERE code = 'CUSTOMER_MONTHLY_REFERRALS' AND version = 1
      `, ["2026-07-14T18:00:00.000Z"]);
      await client.query(`
        INSERT INTO referral_limit_policy_versions (
          id, code, version, enabled, monthly_limit, business_timezone,
          excess_outcome, effective_from, disabled_reason,
          approved_by, approved_at, created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000000602',
          'CUSTOMER_MONTHLY_REFERRALS', 2, true, 1, 'UTC', 'REJECT',
          $1, NULL, 'rewards-product-owner', $1, $1, $1
        )
      `, ["2026-07-14T18:00:00.000Z"]);

      const first = await referrals.attribute(firstCommand);
      assert.equal(first.status, "ATTRIBUTED");
      assert.equal((await referrals.attribute(firstCommand)).replayed, true);
      const duplicateIdentity = await referrals.attribute({
        ...firstCommand,
        sourceId: "postgres-referral-same-attribution-new-source",
        correlationId: "00000000-0000-4000-8000-000000006207" as CorrelationId,
      });
      assert.equal(duplicateIdentity.referralId, first.referralId);
      assert.equal(duplicateIdentity.replayed, true);

      const registrationAwards = new ConfirmReferralRegistration(
        new PostgresReferralRegistrationAwards(
          new SchemaTransactionalDatabase(database, schema),
          new PostgresPointIssuance(new SchemaTransactionalDatabase(database, schema)),
        ),
        new FixedClock(attributedAt),
      );
      const registrationCommand = {
        referralId: first.referralId,
        referredCustomerId,
        registrationEvidenceId: "postgres-registration-evidence",
        registeredAt: new Date("2026-07-14T18:55:00.000Z"),
      };
      const registrationAward = await registrationAwards.confirm(registrationCommand);
      assert.equal(registrationAward.award.points, 3000n);
      assert.equal(registrationAward.award.availablePoints, 3000n);
      assert.equal((await registrationAwards.confirm(registrationCommand)).award.replayed, true);

      const permanenceSchedule = new ScheduleReferralPermanence(
        new PostgresReferralPermanenceSchedule(
          new SchemaTransactionalDatabase(database, schema),
        ),
        new FixedClock(attributedAt),
      );
      const activeServiceStartedAt = new Date("2026-07-14T18:55:00.000Z");
      assert.deepEqual(await permanenceSchedule.schedule({
        referralId: first.referralId,
        activeServiceStartedAt,
      }), { scheduledJobs: 2, existingJobs: 0 });
      assert.deepEqual(await permanenceSchedule.schedule({
        referralId: first.referralId,
        activeServiceStartedAt,
      }), { scheduledJobs: 0, existingJobs: 2 });
      const permanenceScheduler = new PostgresReferralPermanenceScheduler(
        new SchemaTransactionalDatabase(database, schema),
        new PostgresPointIssuance(new SchemaTransactionalDatabase(database, schema)),
        { isEligible: async () => true },
      );
      assert.deepEqual(
        await permanenceScheduler.processDue(
          new Date("2027-07-15T00:00:00.000Z"), 10, "referral-worker-1",
        ),
        { processedJobs: 2, awardedJobs: 2, ineligibleJobs: 0, failedJobs: 0 },
      );
      assert.deepEqual(
        await permanenceScheduler.processDue(
          new Date("2027-07-15T00:00:00.000Z"), 10, "referral-worker-1",
        ),
        { processedJobs: 0, awardedJobs: 0, ineligibleJobs: 0, failedJobs: 0 },
      );

      const augustReferrals = new AttributeReferral(
        new PostgresReferralAttributions(new SchemaTransactionalDatabase(database, schema)),
        new FixedClock(new Date("2026-08-14T19:00:00.000Z")),
      );
      const lostService = await augustReferrals.attribute({
        ...firstCommand,
        referredCustomerId: lostServiceCustomerId,
        referredIdentityHash: "f".repeat(64),
        sourceId: "postgres-referral-lost-service",
        correlationId: "00000000-0000-4000-8000-000000006215" as CorrelationId,
      });
      await new ConfirmReferralRegistration(
        new PostgresReferralRegistrationAwards(
          new SchemaTransactionalDatabase(database, schema),
          new PostgresPointIssuance(new SchemaTransactionalDatabase(database, schema)),
        ),
        new FixedClock(new Date("2026-08-14T19:00:00.000Z")),
      ).confirm({
        referralId: lostService.referralId,
        referredCustomerId: lostServiceCustomerId,
        registrationEvidenceId: "postgres-registration-lost-service",
        registeredAt: new Date("2026-08-14T18:55:00.000Z"),
      });
      await new ScheduleReferralPermanence(
        new PostgresReferralPermanenceSchedule(
          new SchemaTransactionalDatabase(database, schema),
        ),
        new FixedClock(new Date("2026-08-14T19:00:00.000Z")),
      ).schedule({
        referralId: lostService.referralId,
        activeServiceStartedAt: new Date("2026-08-14T18:55:00.000Z"),
      });
      const ineligibleScheduler = new PostgresReferralPermanenceScheduler(
        new SchemaTransactionalDatabase(database, schema),
        new PostgresPointIssuance(new SchemaTransactionalDatabase(database, schema)),
        { isEligible: async () => false },
      );
      assert.deepEqual(
        await ineligibleScheduler.processDue(
          new Date("2027-08-15T00:00:00.000Z"), 10, "referral-worker-ineligible",
        ),
        { processedJobs: 2, awardedJobs: 0, ineligibleJobs: 2, failedJobs: 0 },
      );
      assert.deepEqual(
        await ineligibleScheduler.processDue(
          new Date("2027-08-15T00:00:00.000Z"), 10, "referral-worker-ineligible",
        ),
        { processedJobs: 0, awardedJobs: 0, ineligibleJobs: 0, failedJobs: 0 },
      );

      await assert.rejects(
        referrals.attribute({
          ...firstCommand,
          referredCustomerId: referringCustomerId,
          referredIdentityHash: "c".repeat(64),
          sourceId: "postgres-referral-self",
          correlationId: "00000000-0000-4000-8000-000000006208" as CorrelationId,
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "self_referral",
      );
      await assert.rejects(
        referrals.attribute({
          ...firstCommand,
          referredCustomerId: null,
          referredIdentityHash: "d".repeat(64),
          sourceId: "postgres-referral-limit",
          correlationId: "00000000-0000-4000-8000-000000006209" as CorrelationId,
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "monthly_limit_reached",
      );

      const conflict = await referrals.attribute({
        ...firstCommand,
        referringAccountId: competingAccountId,
        referringIdentityHash: "e".repeat(64),
        sourceId: "postgres-referral-conflict",
        correlationId: "00000000-0000-4000-8000-000000006210" as CorrelationId,
      });
      assert.equal(conflict.status, "HELD_FOR_REVIEW");
      assert.equal(conflict.reviewReason, "ATTRIBUTION_CONFLICT");

      const linkClock = new FixedClock(new Date("2026-09-14T19:00:00.000Z"));
      const linkExperience = new PostgresReferralCustomerExperience(
        new SchemaTransactionalDatabase(database, schema),
        () => "00000000-0000-4000-8000-000000006216",
        () => "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
      );
      const linkApplication = new DefaultReferralHttpApplication(
        linkExperience,
        new AttributeReferral(
          new PostgresReferralAttributions(new SchemaTransactionalDatabase(database, schema)),
          linkClock,
        ),
        new ConfirmReferralRegistration(
          new PostgresReferralRegistrationAwards(
            new SchemaTransactionalDatabase(database, schema),
            new PostgresPointIssuance(new SchemaTransactionalDatabase(database, schema)),
          ),
          linkClock,
        ),
        linkClock,
        "0123456789abcdef0123456789abcdef",
        () => "00000000-0000-4000-8000-000000006217",
      );
      const linkBeforeCapture = await linkApplication.getDashboard(referringCustomerId);
      assert.equal(linkBeforeCapture.accepting_referrals, true);
      assert.equal(
        linkBeforeCapture.invite_path,
        "/registro?ref=abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
      );
      assert.deepEqual(await linkApplication.captureRegistration({
        token: "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
        referredCustomerId: linkedCustomerId,
        registeredAt: new Date("2026-09-14T18:55:00.000Z"),
      }), { status: "REGISTERED" });
      assert.deepEqual(await linkApplication.captureRegistration({
        token: "abcdefghijklmnopqrstuvwxyzABCDEFG_123456789",
        referredCustomerId: linkedCustomerId,
        registeredAt: new Date("2026-09-14T18:55:00.000Z"),
      }), { status: "REGISTERED" });
      const linkAfterCapture = await linkApplication.getDashboard(referringCustomerId);
      assert.deepEqual(linkAfterCapture.totals, {
        invited: 3,
        registered: 3,
        active: 2,
        earned_points: "17000",
      });
      assert.equal(linkAfterCapture.referrals.length, 3);
      assert.doesNotMatch(JSON.stringify(linkAfterCapture),
        new RegExp(`${referredCustomerId}|${linkedCustomerId}`));

      const state = await client.query<{
        accepted: string;
        held: string;
        flags: string;
        applied_policy: string;
        registration_awards: string;
        permanence_awards: string;
        permanence_jobs: string;
        available_points: string;
        advisor_compensation: string;
        advisor_owned_referrals: string;
      }>(`
        SELECT
          count(*) FILTER (WHERE status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE'))::text AS accepted,
          count(*) FILTER (WHERE status = 'HELD_FOR_REVIEW')::text AS held,
          (SELECT count(*)::text FROM rewards_review_flags) AS flags,
          max(limit_policy_version_id::text)
            FILTER (WHERE status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE')) AS applied_policy,
          (SELECT count(*)::text FROM reward_events
            WHERE event_type = 'REFERRAL_REGISTRATION') AS registration_awards,
          (SELECT count(*)::text FROM reward_events
            WHERE event_type IN (
              'REFERRAL_PERMANENCE_6_MONTHS', 'REFERRAL_PERMANENCE_12_MONTHS'
            )) AS permanence_awards,
          (SELECT count(*)::text FROM scheduled_rewards_jobs
            WHERE job_type = 'REFERRAL_PERMANENCE' AND status = 'SUCCEEDED') AS permanence_jobs,
          (SELECT available_points::text FROM rewards_accounts
            WHERE id = $1) AS available_points,
          (SELECT count(*)::text FROM compensation_records) AS advisor_compensation,
          (SELECT count(*)::text FROM referrals referral
            JOIN advisor_attributions attribution
              ON attribution.customer_id = referral.referring_customer_id
            WHERE referral.id = $2 AND attribution.origin = 'ADVISOR') AS advisor_owned_referrals
        FROM referrals
      `, [referringAccountId, first.referralId]);
      assert.deepEqual(state.rows[0], {
        accepted: "3",
        held: "1",
        flags: "1",
        applied_policy: "00000000-0000-4000-8000-000000000602",
        registration_awards: "3",
        permanence_awards: "2",
        permanence_jobs: "4",
        available_points: "17000",
        advisor_compensation: "0",
        advisor_owned_referrals: "1",
      });
      const safeEvidence = await client.query<{ safe_evidence: Record<string, unknown> }>(`
        SELECT safe_evidence FROM rewards_review_flags WHERE subject_id = $1
      `, [conflict.referralId]);
      assert.deepEqual(safeEvidence.rows[0]?.safe_evidence, { policyVersionId: null });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

test(
  "PostgreSQL financial reports reconcile period totals and relevant dimensions",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    assertDedicatedTestDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_finance_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");
      await migrate(client);

      const customerId = "00000000-0000-4000-8000-000000008201";
      const accountId = "00000000-0000-4000-8000-000000008202";
      const catalogItemId = "00000000-0000-4000-8000-000000008230";
      const redemptionId = "00000000-0000-4000-8000-000000008231";
      const redemptionCorrelationId = "00000000-0000-4000-8000-000000008260";
      await client.query("INSERT INTO customers (id) VALUES ($1)", [customerId]);
      await client.query(`
        INSERT INTO rewards_accounts (
          id, customer_id, status, activated_at, available_points, reserved_points,
          created_at, updated_at
        ) VALUES ($1, $2, 'ACTIVE', '2026-01-01T00:00:00Z', 630, 200,
          '2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z')
      `, [accountId, customerId]);
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, created_at, updated_at
        ) VALUES
          ('00000000-0000-4000-8000-000000008203', 'BASE_AWARD', 1, true, 1000,
            'NORMAL_18_MONTHS', '{}'::jsonb, '{}'::jsonb,
            '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008204', 'SPRING_AWARD', 1, true, 500,
            'CAMPAIGN_90_DAYS', '{}'::jsonb, '{"campaign":"SPRING"}'::jsonb,
            '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')
      `);
      await client.query(`
        INSERT INTO reward_events (
          id, account_id, customer_id, rule_version_id, source, source_id, event_type,
          occurred_at, received_at, safe_metadata, created_at, updated_at
        ) VALUES
          ('00000000-0000-4000-8000-000000008205', $1, $2,
            '00000000-0000-4000-8000-000000008203', 'INTERNAL', 'finance:base',
            'BASE_AWARD', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', '{}'::jsonb,
            '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008206', $1, $2,
            '00000000-0000-4000-8000-000000008204', 'INTERNAL', 'finance:spring',
            'SPRING_AWARD', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z', '{}'::jsonb,
            '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z')
      `, [accountId, customerId]);
      await client.query(`
        INSERT INTO ledger_entries (
          id, account_id, reward_event_id, rule_version_id, entry_type, points_delta,
          idempotency_key, correlation_id, actor_type, created_at
        ) VALUES
          ('00000000-0000-4000-8000-000000008210', $1,
            '00000000-0000-4000-8000-000000008205',
            '00000000-0000-4000-8000-000000008203', 'ISSUANCE', 1000,
            'finance:issue:base', '00000000-0000-4000-8000-000000008261', 'SYSTEM',
            '2026-01-02T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008211', $1,
            '00000000-0000-4000-8000-000000008206',
            '00000000-0000-4000-8000-000000008204', 'ISSUANCE', 500,
            'finance:issue:spring', '00000000-0000-4000-8000-000000008262', 'SYSTEM',
            '2026-01-03T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008212', $1, NULL, NULL, 'RESERVATION', -100,
            'finance:reservation:released', '00000000-0000-4000-8000-000000008263',
            'SYSTEM', '2026-01-04T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008213', $1, NULL, NULL, 'RELEASE', 100,
            'finance:release', '00000000-0000-4000-8000-000000008264', 'SYSTEM',
            '2026-01-05T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008214', $1, NULL, NULL, 'CONSUMPTION', -300,
            'finance:catalog:consume', $2, 'CUSTOMER', '2026-01-05T12:00:00Z'),
          ('00000000-0000-4000-8000-000000008215', $1, NULL, NULL, 'EXPIRATION', -500,
            'finance:expire', '00000000-0000-4000-8000-000000008265', 'SYSTEM',
            '2026-01-06T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008216', $1, NULL, NULL, 'ADJUSTMENT', 50,
            'finance:adjust:credit', '00000000-0000-4000-8000-000000008266', 'OPERATOR',
            '2026-01-07T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008217', $1, NULL, NULL, 'ADJUSTMENT', -20,
            'finance:adjust:debit', '00000000-0000-4000-8000-000000008267', 'OPERATOR',
            '2026-01-08T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008218', $1, NULL, NULL, 'REFUND', 100,
            'finance:refund', $2, 'OPERATOR', '2026-01-09T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008219', $1, NULL, NULL, 'RESERVATION', -200,
            'finance:reservation:active', '00000000-0000-4000-8000-000000008268',
            'SYSTEM', '2026-01-10T00:00:00Z')
      `, [accountId, redemptionCorrelationId]);
      await client.query(`
        INSERT INTO point_lots (
          id, account_id, source_ledger_entry_id, issued_points, remaining_points,
          issued_at, expires_at, expired_at, created_at, updated_at
        ) VALUES
          ('00000000-0000-4000-8000-000000008220', $1,
            '00000000-0000-4000-8000-000000008210', 1000, 700,
            '2026-01-02T00:00:00Z', '2027-07-02T00:00:00Z', NULL,
            '2026-01-02T00:00:00Z', '2026-01-10T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008221', $1,
            '00000000-0000-4000-8000-000000008211', 500, 0,
            '2026-01-03T00:00:00Z', '2026-04-03T00:00:00Z', '2026-01-06T00:00:00Z',
            '2026-01-03T00:00:00Z', '2026-01-06T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008222', $1,
            '00000000-0000-4000-8000-000000008216', 50, 30,
            '2026-01-07T00:00:00Z', '2027-07-07T00:00:00Z', NULL,
            '2026-01-07T00:00:00Z', '2026-01-08T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008223', $1,
            '00000000-0000-4000-8000-000000008218', 100, 100,
            '2026-01-09T00:00:00Z', '2027-07-09T00:00:00Z', NULL,
            '2026-01-09T00:00:00Z', '2026-01-09T00:00:00Z')
      `, [accountId]);
      await client.query(`
        INSERT INTO catalog_items (
          id, code, version, name, description, mode, enabled, point_price,
          eligibility_rule, inventory_mode, fulfillment_mode, effective_from,
          created_at, updated_at
        ) VALUES ($1, 'REPORT_REWARD', 1, 'Report reward', 'Finance fixture', 'POINTS',
          true, 300, '{}'::jsonb, 'UNLIMITED', 'INTERNAL', '2025-01-01T00:00:00Z',
          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')
      `, [catalogItemId]);
      await client.query(`
        INSERT INTO redemptions (
          id, account_id, catalog_item_id, status, points_cost, quantity,
          idempotency_key, correlation_id, requested_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'REFUNDED', 300, 1, 'finance:redemption', $4,
          '2026-01-05T12:00:00Z', '2026-01-05T12:00:00Z', '2026-01-09T00:00:00Z')
      `, [redemptionId, accountId, catalogItemId, redemptionCorrelationId]);
      await client.query(`
        INSERT INTO point_allocations (
          id, ledger_entry_id, lot_id, points, status, created_at, updated_at
        ) VALUES
          ('00000000-0000-4000-8000-000000008240',
            '00000000-0000-4000-8000-000000008212',
            '00000000-0000-4000-8000-000000008220', 100, 'RELEASED',
            '2026-01-04T00:00:00Z', '2026-01-05T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008241',
            '00000000-0000-4000-8000-000000008213',
            '00000000-0000-4000-8000-000000008220', 100, 'RELEASED',
            '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008242',
            '00000000-0000-4000-8000-000000008214',
            '00000000-0000-4000-8000-000000008220', 300, 'CONSUMED',
            '2026-01-05T12:00:00Z', '2026-01-05T12:00:00Z'),
          ('00000000-0000-4000-8000-000000008243',
            '00000000-0000-4000-8000-000000008215',
            '00000000-0000-4000-8000-000000008221', 500, 'EXPIRED',
            '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008244',
            '00000000-0000-4000-8000-000000008217',
            '00000000-0000-4000-8000-000000008222', 20, 'CONSUMED',
            '2026-01-08T00:00:00Z', '2026-01-08T00:00:00Z'),
          ('00000000-0000-4000-8000-000000008245',
            '00000000-0000-4000-8000-000000008219',
            '00000000-0000-4000-8000-000000008220', 200, 'RESERVED',
            '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z')
      `);
      await client.query(`
        INSERT INTO redemption_allocations (
          id, redemption_id, point_allocation_id, points, created_at
        ) VALUES ('00000000-0000-4000-8000-000000008250', $1,
          '00000000-0000-4000-8000-000000008242', 300, '2026-01-05T12:00:00Z')
      `, [redemptionId]);

      const report = await new PostgresFinancialReporting(
        new SchemaTransactionalDatabase(database, schema),
      ).reportPeriod({
        fromInclusive: new Date("2026-01-01T00:00:00.000Z"),
        toExclusive: new Date("2026-02-01T00:00:00.000Z"),
      });
      assert.deepEqual(report.totals, {
        issuedPoints: 1500n,
        availablePoints: 630n,
        reservedPoints: 200n,
        consumedPoints: 300n,
        expiredPoints: 500n,
        adjustedPoints: 30n,
        refundedPoints: 100n,
      });
      assert.deepEqual(report.rules, [
        { ruleCode: "BASE_AWARD", ruleVersion: 1, issuedPoints: 1000n },
        { ruleCode: "SPRING_AWARD", ruleVersion: 1, issuedPoints: 500n },
      ]);
      assert.deepEqual(report.campaigns, [
        { campaignCode: "SPRING", issuedPoints: 500n },
      ]);
      assert.deepEqual(report.catalog, [{
        catalogCode: "REPORT_REWARD",
        catalogVersion: 1,
        consumedPoints: 300n,
        refundedPoints: 100n,
      }]);
      assert.deepEqual(report.liability, {
        assumptionId: "00000000-0000-4000-8000-000000000701",
        assumptionCode: "EXPECTED_REDEMPTION",
        assumptionVersion: 1,
        expectedRedemptionBasisPoints: 6000,
        estimatedLiabilityPoints: "378",
      });
      const unchangedBalance = await client.query<{
        available_points: string;
        reserved_points: string;
      }>(`
        SELECT available_points::text, reserved_points::text
        FROM rewards_accounts WHERE id = $1
      `, [accountId]);
      assert.deepEqual(unchangedBalance.rows[0], {
        available_points: "630",
        reserved_points: "200",
      });
      assert.doesNotMatch(JSON.stringify(report, (_key, value) => (
        typeof value === "bigint" ? value.toString() : value
      )), new RegExp(`${customerId}|${accountId}`));
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

test(
  "PostgreSQL expiration notifications are cohort-idempotent and replay-safe",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    assertDedicatedTestDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_notifications_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");
      await migrate(client);

      const customerId = asCustomerId("00000000-0000-4000-8000-000000008101");
      await client.query("INSERT INTO customers (id) VALUES ($1)", [customerId]);
      const transactionalDatabase = new SchemaTransactionalDatabase(database, schema);
      const issuedAt = new Date("2026-07-14T12:00:00.000Z");
      const activation = await new PostgresRewardsAccountActivation(
        transactionalDatabase,
      ).activateValidatedCustomer({
        customerId,
        validatedAt: new Date("2026-07-14T11:00:00.000Z"),
        activatedAt: issuedAt,
      });
      const issuance = new PostgresPointIssuance(transactionalDatabase);
      await issuance.issue({
        accountId: activation.accountId,
        ruleCode: "REGISTRATION_ACTIVATION",
        event: normalizeRewardEvent({
          source: "INTERNAL",
          sourceId: "expiration-notification:same-cohort",
          eventType: "REGISTRATION_ACTIVATION",
          customerId,
          occurredAt: issuedAt,
          receivedAt: issuedAt,
        }),
        issuedAt,
      });

      const automaticallyScheduled = await client.query<{
        jobs: string;
        cohorts: string;
        payloads_are_safe: boolean;
      }>(`
        SELECT
          count(*)::text AS jobs,
          count(DISTINCT (safe_payload->>'accountId', safe_payload->>'expiresAt'))::text AS cohorts,
          bool_and(
            safe_payload ?& ARRAY['accountId', 'expiresAt', 'windowDays']
            AND NOT safe_payload ?| ARRAY['customerId', 'points', 'email', 'phone', 'curp']
          ) AS payloads_are_safe
        FROM scheduled_rewards_jobs
        WHERE job_type = 'POINT_EXPIRATION_NOTIFICATION'
      `);
      assert.deepEqual(automaticallyScheduled.rows[0], {
        jobs: "2",
        cohorts: "1",
        payloads_are_safe: true,
      });

      await client.query(`
        DELETE FROM scheduled_rewards_jobs
        WHERE job_type = 'POINT_EXPIRATION_NOTIFICATION'
      `);
      const schedule = new PostgresExpirationNotificationSchedule(transactionalDatabase);
      assert.deepEqual(await schedule.scheduleExisting(issuedAt, 10), {
        scheduledJobs: 2,
        existingJobs: 0,
      });
      assert.deepEqual(await schedule.scheduleExisting(issuedAt, 10), {
        scheduledJobs: 0,
        existingJobs: 0,
      });

      const deliveries: ExpirationNotificationDeliveryCommand[] = [];
      const scheduler = new PostgresExpirationNotificationScheduler(
        transactionalDatabase,
        {
          deliver: async (command) => {
            deliveries.push(command);
            return { safeOutcomeCode: "ACCEPTED" };
          },
        },
      );
      const sixtyDayRuns = await Promise.all([
        scheduler.processDue(new Date("2027-11-15T12:00:00.000Z"), 10, "notice-a"),
        scheduler.processDue(new Date("2027-11-15T12:00:00.000Z"), 10, "notice-b"),
      ]);
      assert.equal(sixtyDayRuns.reduce((sum, run) => sum + run.processedJobs, 0), 1);
      assert.equal(sixtyDayRuns.reduce((sum, run) => sum + run.deliveredJobs, 0), 1);
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0]?.windowDays, 60);
      assert.equal(deliveries[0]?.cohortExpiresAt.toISOString(), "2028-01-14T12:00:00.000Z");

      await client.query(`
        UPDATE scheduled_rewards_jobs
        SET status = 'FAILED', completed_at = NULL, updated_at = $1
        WHERE job_type = 'POINT_EXPIRATION_NOTIFICATION'
          AND safe_payload->>'windowDays' = '60'
      `, [new Date("2027-11-15T12:01:00.000Z")]);
      assert.deepEqual(await scheduler.processDue(
        new Date("2027-11-15T12:01:00.000Z"), 10, "notice-replay",
      ), {
        processedJobs: 1,
        deliveredJobs: 0,
        skippedJobs: 0,
        replayedJobs: 1,
        failedJobs: 0,
      });
      assert.equal(deliveries.length, 1);

      await client.query(`
        UPDATE point_lots
        SET remaining_points = 0, updated_at = $2
        WHERE account_id = $1
      `, [activation.accountId, new Date("2027-12-15T12:00:00.000Z")]);
      assert.deepEqual(await scheduler.processDue(
        new Date("2027-12-15T12:00:00.000Z"), 10, "notice-empty-cohort",
      ), {
        processedJobs: 1,
        deliveredJobs: 0,
        skippedJobs: 1,
        replayedJobs: 0,
        failedJobs: 0,
      });
      assert.equal(deliveries.length, 1);

      const history = await client.query<{
        window_days: number;
        status: string;
        safe_outcome_code: string;
        attempt_count: number;
      }>(`
        SELECT window_days, status, safe_outcome_code, attempt_count
        FROM expiration_notification_deliveries
        ORDER BY window_days DESC
      `);
      assert.deepEqual(history.rows, [
        { window_days: 60, status: "DELIVERED", safe_outcome_code: "ACCEPTED", attempt_count: 2 },
        {
          window_days: 30,
          status: "SKIPPED",
          safe_outcome_code: "NO_UNUSED_POINTS",
          attempt_count: 1,
        },
      ]);

      const failedJobId = "00000000-0000-4000-8000-000000008290";
      await client.query(`
        INSERT INTO scheduled_rewards_jobs (
          id, job_type, business_key, due_at, status, attempt_count, safe_payload,
          created_at, updated_at
        ) VALUES ($1, 'REPORTING_REFRESH', 'finance:monthly:2027-11',
          '2027-12-15T12:00:00Z', 'FAILED', 1,
          '{"accountId":"must-not-be-returned"}'::jsonb,
          '2027-12-15T12:00:00Z', '2027-12-15T13:00:00Z')
      `, [failedJobId]);
      await client.query(`
        INSERT INTO rewards_job_executions (
          id, job_id, attempt_number, status, worker_id, started_at,
          finished_at, safe_error_code
        ) VALUES ('00000000-0000-4000-8000-000000008291', $1, 1, 'FAILED',
          'reporting-worker', '2027-12-15T12:59:00Z', '2027-12-15T13:00:00Z',
          'DEPENDENCY_UNAVAILABLE')
      `, [failedJobId]);
      const jobOperations = new OperateRewardsJobs(
        new PostgresRewardsJobOperations(transactionalDatabase),
        new FixedClock(new Date("2027-12-15T13:01:00.000Z")),
      );
      const failedJobs = await jobOperations.listFailed({
        id: "operations-viewer",
        permissions: ["rewards:jobs:view"],
      }, 10);
      assert.deepEqual(failedJobs, [{
        jobId: failedJobId,
        jobType: "REPORTING_REFRESH",
        dueAt: new Date("2027-12-15T12:00:00.000Z"),
        attemptCount: 1,
        failedAt: new Date("2027-12-15T13:00:00.000Z"),
        safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      }]);
      assert.doesNotMatch(JSON.stringify(failedJobs), /accountId|must-not-be-returned/);
      const retryCommand = {
        jobId: failedJobId,
        idempotencyKey: "manual-retry:reporting-refresh:2027-11",
        reasonCode: "DEPENDENCY_RECOVERED",
        explanation: "The reporting dependency is healthy again.",
      };
      assert.deepEqual(await jobOperations.retry({
        id: "operations-retry",
        permissions: ["rewards:jobs:retry"],
      }, retryCommand), { jobId: failedJobId, status: "PENDING", replayed: false });
      assert.deepEqual(await jobOperations.retry({
        id: "operations-retry",
        permissions: ["rewards:jobs:retry"],
      }, retryCommand), { jobId: failedJobId, status: "PENDING", replayed: true });
      const retryAudit = await client.query<{
        status: string;
        actor_id: string;
        reason_code: string;
        status_before: string;
        status_after: string;
        retries: string;
      }>(`
        SELECT job.status, retry.actor_id, retry.reason_code,
          retry.status_before, retry.status_after,
          count(*) OVER ()::text AS retries
        FROM scheduled_rewards_jobs job
        JOIN rewards_job_manual_retries retry ON retry.job_id = job.id
        WHERE job.id = $1
      `, [failedJobId]);
      assert.deepEqual(retryAudit.rows[0], {
        status: "PENDING",
        actor_id: "operations-retry",
        reason_code: "DEPENDENCY_RECOVERED",
        status_before: "FAILED",
        status_after: "PENDING",
        retries: "1",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

test(
  "PostgreSQL activation is atomic, replay-safe, and concurrency-safe",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    assertDedicatedTestDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_activation_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");
      await migrate(client);

      const customerIds = [
        asCustomerId("00000000-0000-4000-8000-000000008001"),
        asCustomerId("00000000-0000-4000-8000-000000008002"),
        asCustomerId("00000000-0000-4000-8000-000000008003"),
      ];
      await client.query(
        "INSERT INTO customers (id) SELECT unnest($1::uuid[])",
        [customerIds],
      );
      const activation = new PostgresRewardsAccountActivation(
        new SchemaTransactionalDatabase(database, schema),
      );
      const activatedAt = new Date("2026-07-14T12:00:00.000Z");
      const validatedAt = new Date("2026-07-14T10:00:00.000Z");

      const first = await activation.activateValidatedCustomer({
        customerId: customerIds[0]!,
        validatedAt,
        activatedAt,
      });
      assert.equal(first.accountCreated, true);
      assert.equal(first.registrationAwardIssued, true);
      assert.equal(first.availablePoints, 2000n);

      const replay = await activation.activateValidatedCustomer({
        customerId: customerIds[0]!,
        validatedAt,
        activatedAt,
      });
      assert.equal(replay.accountId, first.accountId);
      assert.equal(replay.rewardEventId, first.rewardEventId);
      assert.equal(replay.accountCreated, false);
      assert.equal(replay.registrationAwardIssued, false);
      assert.equal(replay.availablePoints, 2000n);

      const concurrent = await Promise.all([
        activation.activateValidatedCustomer({
          customerId: customerIds[1]!,
          validatedAt,
          activatedAt,
        }),
        activation.activateValidatedCustomer({
          customerId: customerIds[1]!,
          validatedAt,
          activatedAt,
        }),
      ]);
      assert.equal(concurrent.filter((result) => result.accountCreated).length, 1);
      assert.equal(concurrent.filter((result) => result.registrationAwardIssued).length, 1);
      assert.ok(concurrent.every((result) => result.availablePoints === 2000n));
      assert.equal(concurrent[0]?.accountId, concurrent[1]?.accountId);

      await client.query(`
        CREATE FUNCTION fail_activation_point_lot() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected point lot failure';
        END;
        $$ LANGUAGE plpgsql
      `);
      await client.query(`
        CREATE TRIGGER fail_activation_point_lot
        BEFORE INSERT ON point_lots
        FOR EACH ROW EXECUTE FUNCTION fail_activation_point_lot()
      `);
      await assert.rejects(
        activation.activateValidatedCustomer({
          customerId: customerIds[2]!,
          validatedAt,
          activatedAt,
        }),
        /injected point lot failure/,
      );
      const rolledBack = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM rewards_accounts
        WHERE customer_id = $1
      `, [customerIds[2]]);
      assert.equal(rolledBack.rows[0]?.count, "0");

      const persisted = await client.query<{
        accounts: string;
        events: string;
        entries: string;
        lots: string;
        available_points: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM rewards_accounts) AS accounts,
          (SELECT count(*)::text FROM reward_events) AS events,
          (SELECT count(*)::text FROM ledger_entries) AS entries,
          (SELECT count(*)::text FROM point_lots) AS lots,
          (SELECT sum(available_points)::text FROM rewards_accounts) AS available_points
      `);
      assert.deepEqual(persisted.rows[0], {
        accounts: "2",
        events: "2",
        entries: "2",
        lots: "2",
        available_points: "4000",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

test(
  "PostgreSQL ledger is replay-safe, concurrency-safe, FIFO, compensating, and reconcilable",
  { skip: configuredTestDatabaseUrl ? false : "TEST_DATABASE_URL is not configured" },
  async () => {
    const testDatabaseUrl = normalizeDatabaseUrl(configuredTestDatabaseUrl!);
    assertDedicatedTestDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const client = await database.connect();
    const schema = `rewards_ledger_${randomUUID().replaceAll("-", "_")}`;
    const quotedSchema = `"${schema}"`;

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}`);
      await client.query("CREATE TABLE customers (id uuid PRIMARY KEY)");
      await migrate(client);

      const customerIds = [
        asCustomerId("00000000-0000-4000-8000-000000007001"),
        asCustomerId("00000000-0000-4000-8000-000000007002"),
        asCustomerId("00000000-0000-4000-8000-000000007003"),
        asCustomerId("00000000-0000-4000-8000-000000007004"),
        asCustomerId("00000000-0000-4000-8000-000000007005"),
      ];
      await client.query("INSERT INTO customers (id) SELECT unnest($1::uuid[])", [customerIds]);

      const transactionalDatabase = new SchemaTransactionalDatabase(database, schema);
      const activation = new PostgresRewardsAccountActivation(transactionalDatabase);
      const activatedAt = new Date("2026-07-14T12:00:00.000Z");
      const validatedAt = new Date("2026-07-14T10:00:00.000Z");
      const accounts: RewardsActivationResult[] = [];
      for (const customerId of customerIds) {
        accounts.push(await activation.activateValidatedCustomer({
          customerId,
          validatedAt,
          activatedAt,
        }));
      }

      const issuance = new PostgresPointIssuance(transactionalDatabase);
      const duplicateEvent = normalizeRewardEvent({
        source: "PARTNER",
        sourceId: "skandia-contract:duplicate-concurrency",
        eventType: "SKANDIA_CONTRACTING",
        customerId: customerIds[0]!,
        occurredAt: new Date("2026-07-14T12:05:00.000Z"),
        receivedAt: new Date("2026-07-14T12:06:00.000Z"),
        safeMetadata: { evidenceVersion: 1 },
      });
      const duplicateResults = await Promise.all([
        issuance.issue({
          accountId: accounts[0]!.accountId,
          ruleCode: "SKANDIA_CONTRACTING",
          event: duplicateEvent,
          issuedAt: new Date("2026-07-14T12:07:00.000Z"),
        }),
        issuance.issue({
          accountId: accounts[0]!.accountId,
          ruleCode: "SKANDIA_CONTRACTING",
          event: duplicateEvent,
          issuedAt: new Date("2026-07-14T12:07:00.000Z"),
        }),
      ]);
      assert.equal(duplicateResults.filter((result) => result.replayed).length, 1);
      assert.equal(duplicateResults[0]!.eventId, duplicateResults[1]!.eventId);
      assert.equal(duplicateResults[0]!.ledgerEntryId, duplicateResults[1]!.ledgerEntryId);
      assert.ok(duplicateResults.every((result) => result.availablePoints === 7000n));
      const duplicateCounts = await client.query<{ events: string; entries: string }>(`
        SELECT
          (SELECT count(*)::text FROM reward_events
            WHERE source = 'PARTNER' AND source_id = $1) AS events,
          (SELECT count(*)::text FROM ledger_entries
            WHERE reward_event_id = $2) AS entries
      `, [duplicateEvent.sourceId, duplicateResults[0]!.eventId]);
      assert.deepEqual(duplicateCounts.rows[0], { events: "1", entries: "1" });

      const secondRuleVersionId = "00000000-0000-4000-8000-000000007112";
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          $1, 'SKANDIA_CONTRACTING', 2, true, 6000, 'NORMAL_18_MONTHS',
          '{"confirmation":true}'::jsonb, '{}'::jsonb, $2, NULL, $2, $2
        )
      `, [secondRuleVersionId, new Date("2026-08-01T00:00:00.000Z")]);
      const firstVersionAward = await issuance.issue({
        accountId: accounts[0]!.accountId,
        ruleCode: "SKANDIA_CONTRACTING",
        event: normalizeRewardEvent({
          source: "PARTNER",
          sourceId: "skandia-contract:version-one",
          eventType: "SKANDIA_CONTRACTING",
          customerId: customerIds[0]!,
          occurredAt: new Date("2026-07-31T23:59:59.000Z"),
          receivedAt: new Date("2026-08-02T10:00:00.000Z"),
        }),
        issuedAt: new Date("2026-08-02T10:01:00.000Z"),
      });
      const secondVersionAward = await issuance.issue({
        accountId: accounts[0]!.accountId,
        ruleCode: "SKANDIA_CONTRACTING",
        event: normalizeRewardEvent({
          source: "PARTNER",
          sourceId: "skandia-contract:version-two",
          eventType: "SKANDIA_CONTRACTING",
          customerId: customerIds[0]!,
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          receivedAt: new Date("2026-08-02T10:02:00.000Z"),
        }),
        issuedAt: new Date("2026-08-02T10:03:00.000Z"),
      });
      assert.equal(firstVersionAward.points, 5000n);
      assert.equal(secondVersionAward.points, 6000n);
      const appliedVersions = await client.query<{ id: string; rule_version_id: string }>(`
        SELECT id::text, rule_version_id::text
        FROM ledger_entries WHERE id = ANY($1::uuid[])
        ORDER BY id
      `, [[firstVersionAward.ledgerEntryId, secondVersionAward.ledgerEntryId]]);
      assert.deepEqual(
        new Map(appliedVersions.rows.map((row) => [row.id, row.rule_version_id])),
        new Map([
          [firstVersionAward.ledgerEntryId, "00000000-0000-4000-8000-000000000112"],
          [secondVersionAward.ledgerEntryId, secondRuleVersionId],
        ]),
      );

      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000007113',
          'SKANDIA_CONTRACTING', 3, false, NULL, 'NORMAL_18_MONTHS',
          '{}'::jsonb, '{}'::jsonb, $1, 'Partner evidence paused for review.', $1, $1
        )
      `, [new Date("2026-09-01T00:00:00.000Z")]);
      await assert.rejects(
        issuance.issue({
          accountId: accounts[0]!.accountId,
          ruleCode: "SKANDIA_CONTRACTING",
          event: normalizeRewardEvent({
            source: "PARTNER",
            sourceId: "skandia-contract:disabled-version",
            eventType: "SKANDIA_CONTRACTING",
            customerId: customerIds[0]!,
            occurredAt: new Date("2026-09-01T00:00:00.000Z"),
            receivedAt: new Date("2026-09-01T00:01:00.000Z"),
          }),
          issuedAt: new Date("2026-09-01T00:02:00.000Z"),
        }),
        (error: unknown) => error instanceof RewardsError
          && error.code === "rule_disabled"
          && error.details?.reason === "Partner evidence paused for review.",
      );
      const disabledEvent = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM reward_events
        WHERE source = 'PARTNER' AND source_id = 'skandia-contract:disabled-version'
      `);
      assert.equal(disabledEvent.rows[0]?.count, "0");

      const onboarding = new RecordOnboardingEvidence(
        new PostgresOnboardingEvidenceStore(transactionalDatabase),
        issuance,
        new FixedClock(new Date("2026-07-14T15:00:00.000Z")),
      );
      const onboardingEvidence = async (
        evidenceType: OnboardingEvidenceType,
        minute: number,
      ) => onboarding.execute({
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
        onboardingInstanceId: "intro-2026",
        evidenceType,
        evidenceVersion: "onboarding-v1",
        source: "BROWSER",
        sourceId: `onboarding:intro-2026:${evidenceType.toLowerCase()}`,
        occurredAt: new Date(`2026-07-14T12:${minute.toString().padStart(2, "0")}:00.000Z`),
        receivedAt: new Date(`2026-07-14T12:${minute.toString().padStart(2, "0")}:01.000Z`),
      });
      assert.equal((await onboardingEvidence("CONFIRMATION", 20)).awardStatus, "PENDING_EVIDENCE");
      assert.equal((await onboardingEvidence("VIDEO", 21)).awardStatus, "PENDING_EVIDENCE");
      const disabledOnboarding = await onboardingEvidence("SURVEY", 22);
      assert.equal(disabledOnboarding.complete, true);
      assert.equal(disabledOnboarding.awardStatus, "RULE_DISABLED");
      assert.equal(
        disabledOnboarding.disabledReason,
        "Onboarding evidence owners and Cinepolis fulfillment are not approved.",
      );
      assert.equal(disabledOnboarding.award, null);

      const enabledOnboardingRuleId = "00000000-0000-4000-8000-000000007102";
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          $1, 'ONBOARDING_COMPLETION', 2, true, 5000, 'NORMAL_18_MONTHS',
          '{"requiredEvidence":["confirmation","video","survey"]}'::jsonb,
          '{"fulfillment":"approved-test-fixture"}'::jsonb, $2, NULL, $2, $2
        )
      `, [enabledOnboardingRuleId, new Date("2026-07-14T00:00:00.000Z")]);
      const awardedOnboarding = await onboardingEvidence("SURVEY", 22);
      assert.equal(awardedOnboarding.replayedEvidence, true);
      assert.equal(awardedOnboarding.awardStatus, "AWARDED");
      assert.equal(awardedOnboarding.award?.points, 5000n);
      assert.equal(awardedOnboarding.award?.replayed, false);
      const replayedOnboarding = await onboardingEvidence("SURVEY", 22);
      assert.equal(replayedOnboarding.awardStatus, "AWARDED");
      assert.equal(replayedOnboarding.award?.replayed, true);
      assert.equal(replayedOnboarding.award?.ledgerEntryId, awardedOnboarding.award?.ledgerEntryId);
      const onboardingPersistence = await client.query<{
        evidence: string;
        events: string;
        entries: string;
        rule_version_id: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM onboarding_evidence
            WHERE account_id = $1 AND onboarding_instance_id = 'intro-2026') AS evidence,
          (SELECT count(*)::text FROM reward_events
            WHERE source = 'INTERNAL' AND source_id = $2) AS events,
          (SELECT count(*)::text FROM ledger_entries
            WHERE reward_event_id = $3) AS entries,
          (SELECT rule_version_id::text FROM ledger_entries
            WHERE reward_event_id = $3) AS rule_version_id
      `, [
        accounts[0]!.accountId,
        `onboarding-completion:${accounts[0]!.accountId}:intro-2026`,
        awardedOnboarding.award!.eventId,
      ]);
      assert.deepEqual(onboardingPersistence.rows[0], {
        evidence: "3",
        events: "1",
        entries: "1",
        rule_version_id: enabledOnboardingRuleId,
      });

      const monthlyInteraction = new IngestQualifyingSiteAction(
        new PostgresBehaviorRuleLookup(transactionalDatabase),
        new PostgresMonthlyInteractionStore(transactionalDatabase),
        issuance,
        new FixedClock(new Date("2026-08-01T06:05:00.000Z")),
      );
      const monthlyActor = {
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
      };
      await assert.rejects(
        monthlyInteraction.execute(monthlyActor, {
          actionCode: "BENEFIT_VIEW",
          source: "BROWSER",
          sourceId: "monthly:disabled",
          occurredAt: new Date("2026-07-14T12:30:00.000Z"),
          receivedAt: new Date("2026-07-14T12:30:01.000Z"),
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
      );
      const enabledMonthlyRuleId = "00000000-0000-4000-8000-000000007103";
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          $1, 'MONTHLY_INTERACTION', 2, true, 1000, 'NORMAL_18_MONTHS',
          '{"requiresAuthenticatedSession":true,"requiresQualifyingAction":true}'::jsonb,
          '{"businessTimezone":"America/Mexico_City","qualifyingActions":["BENEFIT_VIEW","PROFILE_VIEW"]}'::jsonb,
          $2, NULL, $2, $2
        )
      `, [enabledMonthlyRuleId, new Date("2026-07-14T00:00:00.000Z")]);
      const loginOnly = await monthlyInteraction.execute(monthlyActor, {
        actionCode: "LOGIN",
        source: "BROWSER",
        sourceId: "monthly:login-only",
        occurredAt: new Date("2026-08-01T05:20:00.000Z"),
        receivedAt: new Date("2026-08-01T05:20:01.000Z"),
      });
      assert.deepEqual(loginOnly, { status: "NOT_QUALIFYING", businessMonth: "2026-07", award: null });
      const julyInteraction = await monthlyInteraction.execute(monthlyActor, {
        actionCode: "BENEFIT_VIEW",
        source: "BROWSER",
        sourceId: "monthly:july:first",
        occurredAt: new Date("2026-08-01T05:30:00.000Z"),
        receivedAt: new Date("2026-08-01T05:30:01.000Z"),
      });
      assert.equal(julyInteraction.status, "AWARDED");
      assert.equal(julyInteraction.businessMonth, "2026-07");
      assert.equal(julyInteraction.award.points, 1000n);
      assert.equal(julyInteraction.award.replayed, false);
      const julyReplay = await monthlyInteraction.execute(monthlyActor, {
        actionCode: "PROFILE_VIEW",
        source: "BROWSER",
        sourceId: "monthly:july:repeat",
        occurredAt: new Date("2026-08-01T05:40:00.000Z"),
        receivedAt: new Date("2026-08-01T05:40:01.000Z"),
      });
      assert.equal(julyReplay.status, "AWARDED");
      assert.equal(julyReplay.award.replayed, true);
      assert.equal(julyReplay.award.ledgerEntryId, julyInteraction.award.ledgerEntryId);
      const augustInteraction = await monthlyInteraction.execute(monthlyActor, {
        actionCode: "BENEFIT_VIEW",
        source: "BROWSER",
        sourceId: "monthly:august:first",
        occurredAt: new Date("2026-08-01T06:00:00.000Z"),
        receivedAt: new Date("2026-08-01T06:00:01.000Z"),
      });
      assert.equal(augustInteraction.status, "AWARDED");
      assert.equal(augustInteraction.businessMonth, "2026-08");
      assert.equal(augustInteraction.award.replayed, false);
      const monthlyRows = await client.query<{ interactions: string; awards: string }>(`
        SELECT
          (SELECT count(*)::text FROM monthly_interactions
            WHERE account_id = $1 AND rule_version_id = $2) AS interactions,
          (SELECT count(*)::text FROM ledger_entries
            WHERE account_id = $1 AND rule_version_id = $2) AS awards
      `, [monthlyActor.accountId, enabledMonthlyRuleId]);
      assert.deepEqual(monthlyRows.rows[0], { interactions: "2", awards: "2" });

      const birthdayRuleId = "00000000-0000-4000-8000-000000007104";
      const disabledBirthday = new RecordVerifiedBirthDate(
        new PostgresBehaviorRuleLookup(transactionalDatabase),
        new PostgresVerifiedBirthDateStore(transactionalDatabase),
        new FixedClock(new Date("2026-07-14T15:00:00.000Z")),
      );
      await assert.rejects(
        disabledBirthday.execute({
          accountId: accounts[0]!.accountId,
          customerId: customerIds[0]!,
        }, {
          birthDate: "1990-07-15",
          source: "API_PROFILE",
          sourceId: "birth-date:disabled",
          sourceVersion: "v1",
        }),
        (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
      );
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          $1, 'BIRTHDAY', 2, true, 5000, 'NORMAL_18_MONTHS',
          '{"requiresVerifiedBirthDate":true}'::jsonb,
          '{"verifiedSources":["API_PROFILE"],"businessTimezone":"America/Mexico_City","leapDayPolicy":"FEBRUARY_28"}'::jsonb,
          $2, NULL, $2, $2
        )
      `, [birthdayRuleId, new Date("2026-07-14T00:00:00.000Z")]);
      await assert.rejects(
        disabledBirthday.execute({
          accountId: accounts[0]!.accountId,
          customerId: customerIds[0]!,
        }, {
          birthDate: "1990-07-15",
          source: "SELF_REPORTED",
          sourceId: "birth-date:unapproved",
          sourceVersion: "v1",
        }),
        (error: unknown) => error instanceof RewardsError
          && error.code === "rule_disabled"
          && error.details?.reason === "The supplied birth-date source is not approved.",
      );
      const firstBirthDate = await disabledBirthday.execute({
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
      }, {
        birthDate: "1990-07-15",
        source: "API_PROFILE",
        sourceId: "birth-date:customer-7001",
        sourceVersion: "profile-v1",
      });
      assert.equal(firstBirthDate.nextAwardYear, 2026);
      assert.equal(firstBirthDate.nextAwardAt.toISOString(), "2026-07-15T06:00:00.000Z");
      assert.equal(firstBirthDate.replayed, false);
      assert.equal((await disabledBirthday.execute({
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
      }, {
        birthDate: "1990-07-15",
        source: "API_PROFILE",
        sourceId: "birth-date:customer-7001",
        sourceVersion: "profile-v1",
      })).replayed, true);
      await disabledBirthday.execute({
        accountId: accounts[1]!.accountId,
        customerId: customerIds[1]!,
      }, {
        birthDate: "1985-07-15",
        source: "API_PROFILE",
        sourceId: "birth-date:customer-7002",
        sourceVersion: "profile-v1",
      });

      const birthdayScheduler = () => new PostgresBirthdayScheduler(
        transactionalDatabase,
        issuance,
        {
          isEligible: async (actor) => actor.accountId === accounts[0]!.accountId,
        },
      );
      const birthdayRuns = await Promise.all([
        birthdayScheduler().processDue(new Date("2026-07-15T07:00:00.000Z"), 10, "birthday-a"),
        birthdayScheduler().processDue(new Date("2026-07-15T07:00:00.000Z"), 10, "birthday-b"),
      ]);
      assert.equal(birthdayRuns.reduce((sum, run) => sum + run.processedJobs, 0), 2);
      assert.equal(birthdayRuns.reduce((sum, run) => sum + run.awardedJobs, 0), 1);
      assert.equal(birthdayRuns.reduce((sum, run) => sum + run.ineligibleJobs, 0), 1);
      assert.equal(birthdayRuns.reduce((sum, run) => sum + run.failedJobs, 0), 0);
      assert.deepEqual(
        await birthdayScheduler().processDue(
          new Date("2026-07-15T07:01:00.000Z"),
          10,
          "birthday-replay",
        ),
        { processedJobs: 0, awardedJobs: 0, ineligibleJobs: 0, failedJobs: 0 },
      );
      const birthdayPersistence = await client.query<{
        dates: string;
        awards: string;
        next_jobs: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM verified_birth_dates) AS dates,
          (SELECT count(*)::text FROM ledger_entries
            WHERE rule_version_id = $1) AS awards,
          (SELECT count(*)::text FROM scheduled_rewards_jobs
            WHERE job_type = 'BIRTHDAY_AWARD' AND status = 'PENDING'
              AND (safe_payload->>'awardYear')::integer = 2027) AS next_jobs
      `, [birthdayRuleId]);
      assert.deepEqual(birthdayPersistence.rows[0], {
        dates: "2",
        awards: "1",
        next_jobs: "2",
      });

      const anniversarySchedule = new PostgresAforeAnniversarySchedule(transactionalDatabase);
      const eligibleRelationId = "00000000-0000-4000-8000-000000007201";
      const inactiveRelationId = "00000000-0000-4000-8000-000000007202";
      const eligibleSchedule = await anniversarySchedule.schedule({
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
        relationId: eligibleRelationId,
        startedAt: new Date("2026-01-14T12:00:00.000Z"),
      }, new Date("2027-01-14T12:30:00.000Z"));
      assert.deepEqual(eligibleSchedule, { scheduledJobs: 3, existingJobs: 0 });
      assert.deepEqual(await anniversarySchedule.schedule({
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
        relationId: eligibleRelationId,
        startedAt: new Date("2026-01-14T12:00:00.000Z"),
      }, new Date("2027-01-14T12:31:00.000Z")), { scheduledJobs: 0, existingJobs: 3 });
      await anniversarySchedule.schedule({
        accountId: accounts[3]!.accountId,
        customerId: customerIds[3]!,
        relationId: inactiveRelationId,
        startedAt: new Date("2026-01-14T12:00:00.000Z"),
      }, new Date("2027-01-14T12:30:00.000Z"));
      const anniversaryScheduler = () => new PostgresAforeAnniversaryScheduler(
        transactionalDatabase,
        issuance,
        {
          isActive: async (evidence) => evidence.relationId === eligibleRelationId,
        },
      );
      const anniversaryRuns = await Promise.all([
        anniversaryScheduler().processDue(
          new Date("2027-01-14T13:00:00.000Z"), 10, "anniversary-a",
        ),
        anniversaryScheduler().processDue(
          new Date("2027-01-14T13:00:00.000Z"), 10, "anniversary-b",
        ),
      ]);
      assert.equal(anniversaryRuns.reduce((sum, run) => sum + run.processedJobs, 0), 4);
      assert.equal(anniversaryRuns.reduce((sum, run) => sum + run.awardedJobs, 0), 2);
      assert.equal(anniversaryRuns.reduce((sum, run) => sum + run.ineligibleJobs, 0), 2);
      assert.equal(anniversaryRuns.reduce((sum, run) => sum + run.failedJobs, 0), 0);
      const eighteenMonthRun = await anniversaryScheduler().processDue(
        new Date("2027-07-14T13:00:00.000Z"), 10, "anniversary-18m",
      );
      assert.deepEqual(eighteenMonthRun, {
        processedJobs: 2, awardedJobs: 1, ineligibleJobs: 1, failedJobs: 0,
      });
      const anniversaryPersistence = await client.query<{
        awards: string;
        points: string;
        completed_jobs: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM ledger_entries entry
            JOIN behavior_rule_versions rule ON rule.id = entry.rule_version_id
            WHERE entry.account_id = $1 AND rule.code LIKE 'AFORE_ANNIVERSARY_%') AS awards,
          (SELECT sum(entry.points_delta)::text FROM ledger_entries entry
            JOIN behavior_rule_versions rule ON rule.id = entry.rule_version_id
            WHERE entry.account_id = $1 AND rule.code LIKE 'AFORE_ANNIVERSARY_%') AS points,
          (SELECT count(*)::text FROM scheduled_rewards_jobs
            WHERE job_type = 'AFORE_ANNIVERSARY' AND status = 'SUCCEEDED') AS completed_jobs
      `, [accounts[0]!.accountId]);
      assert.deepEqual(anniversaryPersistence.rows[0], {
        awards: "3",
        points: "55000",
        completed_jobs: "6",
      });

      const ave = new IngestAveContribution({ isEligible: async () => true }, issuance);
      const avePrincipal = {
        id: "ave-adapter-1",
        adapter: "AVE" as const,
        permissions: ["rewards:ingest:ave"],
      };
      const aveCommand = {
        accountId: accounts[0]!.accountId,
        customerId: customerIds[0]!,
        externalContributionId: "ave-7001-001",
        status: "CONFIRMED" as const,
        occurredAt: new Date("2026-07-14T15:00:00.000Z"),
        receivedAt: new Date("2026-07-14T15:01:00.000Z"),
        evidenceVersion: "ave-v1",
      };
      await assert.rejects(
        ave.execute(avePrincipal, aveCommand),
        (error: unknown) => error instanceof RewardsError && error.code === "rule_disabled",
      );
      const aveRuleId = "00000000-0000-4000-8000-000000007108";
      await client.query(`
        INSERT INTO behavior_rule_versions (
          id, code, version, enabled, point_value, validity_policy,
          evidence_requirements, configuration, effective_from, disabled_reason,
          created_at, updated_at
        ) VALUES (
          $1, 'AVE_CONFIRMED_CONTRIBUTION', 2, true, 500, 'NORMAL_18_MONTHS',
          '{"requiresConfirmedExternalContribution":true}'::jsonb,
          '{"adapterContract":"ave-v1"}'::jsonb, $2, NULL, $2, $2
        )
      `, [aveRuleId, new Date("2026-07-14T00:00:00.000Z")]);
      const aveAward = await ave.execute(avePrincipal, aveCommand);
      const aveReplay = await ave.execute(avePrincipal, aveCommand);
      assert.equal(aveAward.status, "AWARDED");
      assert.equal(aveAward.award.points, 500n);
      assert.equal(aveAward.award.replayed, false);
      assert.equal(aveReplay.status, "AWARDED");
      assert.equal(aveReplay.award.replayed, true);
      assert.equal(aveReplay.award.ledgerEntryId, aveAward.award.ledgerEntryId);

      const allocation = new PostgresPointAllocation(transactionalDatabase);
      const competing = await Promise.allSettled([
        allocation.reserve({
          accountId: accounts[1]!.accountId,
          points: 1500n,
          idempotencyKey: "competing-spend:a",
          correlationId: randomUUID() as CorrelationId,
          createdAt: new Date("2026-07-14T12:10:00.000Z"),
        }),
        allocation.reserve({
          accountId: accounts[1]!.accountId,
          points: 1500n,
          idempotencyKey: "competing-spend:b",
          correlationId: randomUUID() as CorrelationId,
          createdAt: new Date("2026-07-14T12:10:00.000Z"),
        }),
      ]);
      assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
      const rejectedSpend = competing.find((result) => result.status === "rejected");
      assert.ok(rejectedSpend?.status === "rejected");
      assert.ok(rejectedSpend.reason instanceof RewardsError);
      assert.equal(rejectedSpend.reason.code, "insufficient_points");
      const competingBalance = await client.query<{
        available_points: string;
        reserved_points: string;
      }>(`
        SELECT available_points::text, reserved_points::text
        FROM rewards_accounts WHERE id = $1
      `, [accounts[1]!.accountId]);
      assert.deepEqual(competingBalance.rows[0], {
        available_points: "500",
        reserved_points: "1500",
      });

      const fifoIssue = await issuance.issue({
        accountId: accounts[2]!.accountId,
        ruleCode: "SKANDIA_CONTRACTING",
        event: normalizeRewardEvent({
          source: "PARTNER",
          sourceId: "skandia-contract:fifo",
          eventType: "SKANDIA_CONTRACTING",
          customerId: customerIds[2]!,
          occurredAt: new Date("2026-07-14T12:15:00.000Z"),
          receivedAt: new Date("2026-07-14T12:16:00.000Z"),
        }),
        issuedAt: new Date("2026-07-14T13:00:00.000Z"),
      });
      const fifoLots = await client.query<{ id: string }>(`
        SELECT id::text FROM point_lots
        WHERE account_id = $1
        ORDER BY expires_at, issued_at, id
      `, [accounts[2]!.accountId]);
      assert.equal(fifoLots.rows.length, 2);
      assert.equal(fifoLots.rows[1]!.id, fifoIssue.lotId);
      const fifoReservation = await allocation.reserve({
        accountId: accounts[2]!.accountId,
        points: 3000n,
        idempotencyKey: "fifo:reserve",
        correlationId: randomUUID() as CorrelationId,
        createdAt: new Date("2026-07-14T13:10:00.000Z"),
      });
      assert.deepEqual(
        fifoReservation.allocations.map((item) => ({ lotId: item.lotId, points: item.points })),
        [
          { lotId: fifoLots.rows[0]!.id, points: 2000n },
          { lotId: fifoLots.rows[1]!.id, points: 1000n },
        ],
      );
      const fifoConsumption = await allocation.consume({
        reservationLedgerEntryId: fifoReservation.ledgerEntryId,
        idempotencyKey: "fifo:consume",
        correlationId: randomUUID() as CorrelationId,
        createdAt: new Date("2026-07-14T13:11:00.000Z"),
      });
      assert.equal(fifoConsumption.availablePoints, 4000n);
      assert.equal(fifoConsumption.reservedPoints, 0n);
      const fifoRemaining = await client.query<{ remaining_points: string }>(`
        SELECT remaining_points::text FROM point_lots
        WHERE account_id = $1 ORDER BY expires_at, issued_at, id
      `, [accounts[2]!.accountId]);
      assert.deepEqual(fifoRemaining.rows.map((row) => row.remaining_points), ["0", "4000"]);

      const expiringLot = await client.query<{ id: string }>(`
        SELECT id::text FROM point_lots WHERE account_id = $1
      `, [accounts[3]!.accountId]);
      const expirationAt = new Date("2026-07-14T13:30:00.000Z");
      await client.query(`
        UPDATE point_lots SET expires_at = $2, updated_at = $2 WHERE id = $1
      `, [expiringLot.rows[0]!.id, expirationAt]);
      await client.query(`
        UPDATE scheduled_rewards_jobs SET due_at = $2, updated_at = $2
        WHERE job_type = 'POINT_EXPIRATION' AND business_key = $1
      `, [expiringLot.rows[0]!.id, expirationAt]);
      const expiration = new PostgresPointExpiration(transactionalDatabase);
      const expirationResults = await Promise.all([
        expiration.processDue(new Date("2026-07-14T14:00:00.000Z"), 10, "worker-a"),
        expiration.processDue(new Date("2026-07-14T14:00:00.000Z"), 10, "worker-b"),
      ]);
      assert.equal(expirationResults.reduce((sum, result) => sum + result.processedJobs, 0), 1);
      assert.equal(expirationResults.reduce((sum, result) => sum + result.expiredLots, 0), 1);
      assert.equal(expirationResults.reduce((sum, result) => sum + result.expiredPoints, 0n), 2000n);
      const expirationReplay = await expiration.processDue(
        new Date("2026-07-14T14:01:00.000Z"),
        10,
        "worker-replay",
      );
      assert.deepEqual(expirationReplay, { processedJobs: 0, expiredLots: 0, expiredPoints: 0n });

      const compensation = new PostgresLedgerCompensation(transactionalDatabase);
      const positiveAdjustment = await compensation.adjust({
        accountId: accounts[4]!.accountId,
        pointsDelta: 250n,
        idempotencyKey: "adjustment:positive",
        correlationId: randomUUID() as CorrelationId,
        reasonCode: "CUSTOMER_CARE",
        explanation: "Verified missing award",
        actorId: "operator-42",
        createdAt: new Date("2026-07-14T14:10:00.000Z"),
      });
      const adjustmentReplay = await compensation.adjust({
        accountId: accounts[4]!.accountId,
        pointsDelta: 250n,
        idempotencyKey: "adjustment:positive",
        correlationId: randomUUID() as CorrelationId,
        reasonCode: "CUSTOMER_CARE",
        explanation: "Verified missing award",
        actorId: "operator-42",
        createdAt: new Date("2026-07-14T14:10:30.000Z"),
      });
      assert.equal(adjustmentReplay.ledgerEntryId, positiveAdjustment.ledgerEntryId);
      assert.equal(adjustmentReplay.replayed, true);
      await compensation.adjust({
        accountId: accounts[4]!.accountId,
        pointsDelta: -100n,
        idempotencyKey: "adjustment:negative",
        correlationId: randomUUID() as CorrelationId,
        reasonCode: "CORRECTION",
        explanation: "Compensating correction",
        actorId: "operator-42",
        createdAt: new Date("2026-07-14T14:11:00.000Z"),
      });
      const refundableReservation = await allocation.reserve({
        accountId: accounts[4]!.accountId,
        points: 500n,
        idempotencyKey: "refund:reserve",
        correlationId: randomUUID() as CorrelationId,
        createdAt: new Date("2026-07-14T14:12:00.000Z"),
      });
      const consumption = await allocation.consume({
        reservationLedgerEntryId: refundableReservation.ledgerEntryId,
        idempotencyKey: "refund:consume",
        correlationId: randomUUID() as CorrelationId,
        createdAt: new Date("2026-07-14T14:13:00.000Z"),
      });
      const refund = await compensation.refund({
        originalConsumptionEntryId: consumption.ledgerEntryId,
        points: null,
        idempotencyKey: "refund:full",
        reasonCode: "REDEMPTION_CANCELLED",
        explanation: "Cancelled before fulfillment",
        actorId: "operator-42",
        createdAt: new Date("2026-07-14T14:14:00.000Z"),
      });
      assert.equal(refund.pointsDelta, 500n);
      assert.equal(refund.availablePoints, 2150n);
      const immutableHistory = await client.query<{
        entry_type: string;
        points_delta: string;
        actor_id: string | null;
      }>(`
        SELECT entry_type, points_delta::text, actor_id
        FROM ledger_entries
        WHERE id = ANY($1::uuid[])
        ORDER BY created_at
      `, [[positiveAdjustment.ledgerEntryId, consumption.ledgerEntryId, refund.ledgerEntryId]]);
      assert.deepEqual(immutableHistory.rows, [
        { entry_type: "ADJUSTMENT", points_delta: "250", actor_id: "operator-42" },
        { entry_type: "CONSUMPTION", points_delta: "-500", actor_id: null },
        { entry_type: "REFUND", points_delta: "500", actor_id: "operator-42" },
      ]);

      await client.query(`
        UPDATE rewards_accounts SET available_points = 7, reserved_points = 3
        WHERE id = $1
      `, [accounts[4]!.accountId]);
      const balances = new PostgresPointBalanceStore(transactionalDatabase);
      const reconciliation = await balances.reconcile(
        accounts[4]!.accountId,
        new Date("2026-07-14T14:15:00.000Z"),
      );
      assert.equal(reconciliation.repaired, true);
      assert.equal(reconciliation.previousAvailablePoints, 7n);
      assert.equal(reconciliation.previousReservedPoints, 3n);
      assert.equal(reconciliation.balance.availablePoints, 2150n);
      assert.equal(reconciliation.balance.reservedPoints, 0n);
      const repaired = await balances.reconcile(
        accounts[4]!.accountId,
        new Date("2026-07-14T14:16:00.000Z"),
      );
      assert.equal(repaired.repaired, false);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
      client.release();
      await database.end();
    }
  },
);

async function verifyBusinessConstraints(client: PoolClient): Promise<void> {
  const customerId = "00000000-0000-4000-8000-000000009001";
  const accountId = "00000000-0000-4000-8000-000000009002";
  const catalogItemId = "00000000-0000-4000-8000-000000009003";
  const inventoryId = "00000000-0000-4000-8000-000000009004";
  const now = "2026-07-14 12:00:00+00";

  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO customers (id) VALUES ($1)", [customerId]);
    await client.query(`
      INSERT INTO rewards_accounts (
        id, customer_id, status, activated_at, created_at, updated_at
      ) VALUES ($1, $2, 'ACTIVE', $3, $3, $3)
    `, [accountId, customerId, now]);
    await client.query(`
      INSERT INTO catalog_items (
        id, code, version, name, description, mode, enabled, point_price,
        inventory_mode, fulfillment_mode, effective_from, created_at, updated_at
      ) VALUES ($1, 'TEST_REWARD', 1, 'Test reward', 'Constraint fixture', 'POINTS',
        true, 100, 'CONTROLLED', 'INTERNAL', $2, $2, $2)
    `, [catalogItemId, now]);

    await expectConstraint(client, "ck_catalog_inventory_commitments", () => client.query(`
      INSERT INTO catalog_inventory (
        id, catalog_item_id, total_capacity, reserved_quantity, fulfilled_quantity,
        created_at, updated_at
      ) VALUES ($1, $2, 1, 2, 0, $3, $3)
    `, [inventoryId, catalogItemId, now]));

    await expectConstraint(client, "ck_referrals_not_self", () => client.query(`
      INSERT INTO referrals (
        id, referring_account_id, referring_customer_id, referred_customer_id,
        referred_identity_hash, source, source_id, status, attributed_at, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000009005', $1, $2, $2,
        'identity-hash', 'BROWSER', 'self-referral', 'ATTRIBUTED', $3, $3, $3
      )
    `, [accountId, customerId, now]));

    await expectConstraint(client, "ck_compensation_record_split", () => client.query(`
      INSERT INTO compensation_records (
        id, customer_id, policy_version_id, currency, gross_amount,
        advisor_share_amount, customer_benefit_amount, status, idempotency_key,
        calculated_at, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000009006', $1,
        '00000000-0000-4000-8000-000000000201', 'MXN', 100, 80, 30,
        'HELD_FOR_REVIEW', 'invalid-split', $2, $2, $2
      )
    `, [customerId, now]));
  } finally {
    await client.query("ROLLBACK");
  }
}

async function expectConstraint(
  client: PoolClient,
  constraint: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  await client.query("SAVEPOINT expected_constraint");
  await assert.rejects(operation, (error: unknown) => {
    return isPostgresError(error) && error.constraint === constraint;
  });
  await client.query("ROLLBACK TO SAVEPOINT expected_constraint");
  await client.query("RELEASE SAVEPOINT expected_constraint");
}

function isPostgresError(error: unknown): error is { constraint?: string } {
  return typeof error === "object" && error !== null && "constraint" in error;
}

function assertRule(
  rules: readonly {
    code: string;
    enabled: boolean;
    point_value: string | null;
  }[],
  code: string,
  enabled: boolean,
  pointValue: string,
): void {
  const rule = rules.find((candidate) => candidate.code === code);
  assert.equal(rule?.enabled, enabled);
  assert.equal(rule?.point_value, pointValue);
}

function normalizeDatabaseUrl(value: string): string {
  return value.replace(/^postgresql\+asyncpg:/, "postgresql:");
}

function assertDedicatedTestDatabase(testDatabaseUrl: string): void {
  const primaryDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (primaryDatabaseUrl && normalizeDatabaseUrl(primaryDatabaseUrl) === testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL must be different from DATABASE_URL");
  }
}

class SchemaTransactionalDatabase {
  constructor(
    private readonly database: Pool,
    private readonly schema: string,
  ) {}

  async connect(): Promise<PoolClient> {
    const client = await this.database.connect();
    await client.query(`SET search_path TO "${this.schema}"`);
    return client;
  }

  async query<TRow extends QueryResultRow>(
    query: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>> {
    const client = await this.connect();
    try {
      return await client.query<TRow>(query, values);
    } finally {
      client.release();
    }
  }
}
