import assert from "node:assert/strict";
import test from "node:test";

import { rewardsLedgerFoundation } from "../src/database/migrations/001-rewards-ledger-foundation.js";
import { rewardsJobFoundation } from "../src/database/migrations/002-rewards-jobs.js";
import { rewardsCatalogRedemptions } from "../src/database/migrations/003-rewards-catalog-redemptions.js";
import { rewardsReferralsProductsAdvisors } from "../src/database/migrations/004-rewards-referrals-products-advisors.js";
import { rewardsBaselineConfiguration } from "../src/database/migrations/005-rewards-baseline-configuration.js";
import { rewardsMvpCatalog } from "../src/database/migrations/009-rewards-mvp-catalog.js";
import { rewardsCatalogAdministration } from "../src/database/migrations/010-rewards-catalog-administration.js";
import { rewardsEntitlementUse } from "../src/database/migrations/011-rewards-entitlement-use.js";
import { redemptionLimitPolicies } from "../src/database/migrations/012-redemption-limit-policies.js";
import { referralAttributionPolicies } from "../src/database/migrations/013-referral-attribution-policies.js";
import { referralInvitationLinks } from "../src/database/migrations/014-referral-invitation-links.js";
import { expirationNotificationDeliveries } from "../src/database/migrations/015-expiration-notification-deliveries.js";
import { expectedRedemptionAssumptions } from "../src/database/migrations/016-expected-redemption-assumptions.js";
import { rewardsJobManualRetries } from "../src/database/migrations/017-rewards-job-manual-retries.js";
import { rewardsV2Foundation } from "../src/database/migrations/018-rewards-v2-foundation.js";
import { rewardsV2LiveJourney } from "../src/database/migrations/019-rewards-v2-live-journey.js";
import { rewardsCustomerPortal } from "../src/database/migrations/020-rewards-customer-portal.js";

test("ledger foundation migration declares required tables and business constraints", () => {
  for (const table of [
    "rewards_accounts",
    "behavior_rule_versions",
    "reward_events",
    "ledger_entries",
    "point_lots",
    "point_allocations",
  ]) {
    assert.match(rewardsLedgerFoundation.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsLedgerFoundation.down, new RegExp(`DROP TABLE ${table}`));
  }
  for (const constraint of [
    "uq_rewards_accounts_customer_id",
    "uq_behavior_rules_code_version",
    "uq_reward_events_source_identity",
    "uq_ledger_entries_idempotency",
    "uq_point_lots_source_entry",
  ]) {
    assert.match(rewardsLedgerFoundation.up, new RegExp(constraint));
  }
});

test("job migration persists unique business keys and safe execution attempts", () => {
  for (const table of ["scheduled_rewards_jobs", "rewards_job_executions"]) {
    assert.match(rewardsJobFoundation.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsJobFoundation.down, new RegExp(`DROP TABLE ${table}`));
  }
  assert.match(rewardsJobFoundation.up, /uq_rewards_jobs_business_key/);
  assert.match(rewardsJobFoundation.up, /uq_rewards_job_execution_attempt/);
  assert.doesNotMatch(rewardsJobFoundation.up, /raw_payload|customer_sensitive/);
});

test("catalog migration persists inventory-safe redemption relationships", () => {
  for (const table of [
    "catalog_items",
    "catalog_inventory",
    "entitlements",
    "redemptions",
    "waitlist_entries",
    "redemption_allocations",
  ]) {
    assert.match(rewardsCatalogRedemptions.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsCatalogRedemptions.down, new RegExp(`DROP TABLE ${table}`));
  }
  for (const constraint of [
    "uq_catalog_items_code_version",
    "ck_catalog_inventory_commitments",
    "uq_entitlements_idempotency",
    "uq_redemptions_idempotency",
    "uq_waitlist_entries_active_account_item",
    "uq_redemption_allocations_point_allocation",
  ]) {
    assert.match(rewardsCatalogRedemptions.up, new RegExp(constraint));
  }
});

test("commercial foundation separates referrals, product value, and advisor compensation", () => {
  for (const table of [
    "referrals",
    "product_contracts",
    "restricted_wallets",
    "restricted_wallet_entries",
    "advisors",
    "advisor_attributions",
    "compensation_policy_versions",
    "compensation_records",
    "rewards_review_flags",
  ]) {
    assert.match(rewardsReferralsProductsAdvisors.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsReferralsProductsAdvisors.down, new RegExp(`DROP TABLE ${table}`));
  }
  for (const constraint of [
    "ck_referrals_not_self",
    "uq_product_contracts_external_identity",
    "uq_restricted_wallet_entries_idempotency",
    "ck_advisor_attribution_origin",
    "uq_compensation_records_idempotency",
    "ck_compensation_record_split",
    "uq_rewards_review_flags_business_key",
  ]) {
    assert.match(rewardsReferralsProductsAdvisors.up, new RegExp(constraint));
  }
  assert.doesNotMatch(rewardsReferralsProductsAdvisors.up, /curp|password|raw_sisca/i);
});

test("baseline seeds preserve approved values and disable unresolved decisions", () => {
  for (const [code, points] of [
    ["REGISTRATION_ACTIVATION", 2000],
    ["ONBOARDING_COMPLETION", 5000],
    ["MONTHLY_INTERACTION", 1000],
    ["BIRTHDAY", 5000],
    ["AFORE_ANNIVERSARY_6_MONTHS", 5000],
    ["AFORE_ANNIVERSARY_12_MONTHS", 15000],
    ["AFORE_ANNIVERSARY_18_MONTHS", 35000],
    ["AVE_CONFIRMED_CONTRIBUTION", 500],
    ["REFERRAL_REGISTRATION", 3000],
    ["REFERRAL_PERMANENCE_6_MONTHS", 3000],
    ["REFERRAL_PERMANENCE_12_MONTHS", 5000],
    ["SKANDIA_CONTRACTING", 5000],
    ["PRODUCT_PERMANENCE_12_MONTHS", 5000],
  ] as const) {
    assert.match(rewardsBaselineConfiguration.up, new RegExp(`'${code}'[^\\n]+${points}`));
  }
  for (const unresolved of [
    "MONTHLY_INTERACTION",
    "BIRTHDAY",
    "AVE_CONFIRMED_CONTRIBUTION",
    "QUALITAS_ACTIVATION",
    "CATALOG_REDEMPTION",
    "PLATFORM_CROSS_SELL_80_20",
  ]) {
    assert.match(rewardsBaselineConfiguration.up, new RegExp(`'${unresolved}'[\\s\\S]{0,180}false`));
  }
  assert.match(rewardsBaselineConfiguration.up, /undefinedActivityOutcome.*HELD_FOR_REVIEW/);
  assert.match(rewardsBaselineConfiguration.down, /DELETE FROM behavior_rule_versions/);
  assert.match(rewardsBaselineConfiguration.down, /DELETE FROM compensation_policy_versions/);
});

test("MVP catalog seed preserves approved values and disables unresolved items", () => {
  for (const code of [
    "WELCOME_AUTOMATED",
    "CINEPOLIS_ONBOARDING_2_TICKETS",
    "AMAZON_GIFT_CARD_200_REACTIVATION",
    "AMAZON_GIFT_CARD_500_PERMANENCE",
    "BIRTHDAY_RECOGNITION",
    "AFORE_ANNIVERSARY_6_MONTH_RECOGNITION",
    "PENSION_DIAGNOSTIC_ACCESS",
    "QUALITAS_POLICY_DISCOUNT",
    "SKANDIA_PPR_WALLET",
    "CAROBRA_ANNIVERSARY_PARTY",
    "CAROBRA_YEAR_END_GALA",
    "PUERTO_VALLARTA_4D3N_COUPLE",
  ]) {
    assert.match(rewardsMvpCatalog.up, new RegExp(`'${code}'`));
  }
  assert.match(rewardsMvpCatalog.up, /CAROBRA_ANNIVERSARY_PARTY'[\s\S]{0,180}100000/);
  assert.match(rewardsMvpCatalog.up, /PUERTO_VALLARTA_4D3N_COUPLE'[\s\S]{0,180}350000/);
  assert.match(
    rewardsMvpCatalog.up,
    /00000000-0000-4000-8000-000000000402'.*00000000-0000-4000-8000-000000000302', 500/,
  );
  assert.match(rewardsMvpCatalog.up, /'CATALOG_REDEMPTION', 2, false/);
  assert.match(rewardsMvpCatalog.up, /MONTHLY_REDEMPTION_LIMIT/);
  assert.match(rewardsMvpCatalog.down, /DELETE FROM catalog_items/);
});

test("catalog administration migration preserves immutable audit history", () => {
  assert.match(rewardsCatalogAdministration.up, /CREATE TABLE catalog_operation_audit/);
  assert.match(rewardsCatalogAdministration.up, /uq_catalog_operation_audit_idempotency/);
  assert.match(rewardsCatalogAdministration.up, /before_state jsonb/);
  assert.match(rewardsCatalogAdministration.up, /after_state jsonb NOT NULL/);
  assert.match(rewardsCatalogAdministration.down, /DROP TABLE catalog_operation_audit/);
});

test("entitlement use migration makes customer use replay-safe", () => {
  assert.match(rewardsEntitlementUse.up, /use_idempotency_key/);
  assert.match(rewardsEntitlementUse.up, /uq_entitlements_use_idempotency/);
  assert.match(rewardsEntitlementUse.up, /ck_entitlements_used_state/);
  assert.match(rewardsEntitlementUse.down, /DROP COLUMN use_idempotency_key/);
});

test("redemption-limit policies are effective-dated, scoped, approved, and disabled by default", () => {
  assert.match(redemptionLimitPolicies.up, /CREATE TABLE redemption_limit_policy_versions/);
  assert.match(redemptionLimitPolicies.up, /uq_redemption_limit_policies_code_version/);
  assert.match(redemptionLimitPolicies.up, /scope_type IN \('CATALOG_ITEM', 'INVENTORY_MODE'\)/);
  assert.match(redemptionLimitPolicies.up, /approved_by IS NOT NULL/);
  assert.match(redemptionLimitPolicies.up, /'CUSTOMER_MONTHLY_REDEMPTIONS', 1, false/);
  assert.match(redemptionLimitPolicies.up, /pending team approval/);
  assert.match(redemptionLimitPolicies.up, /ADD COLUMN limit_policy_version_id/);
  assert.match(redemptionLimitPolicies.down, /DROP TABLE redemption_limit_policy_versions/);
});

test("referral-limit policies preserve approvals and keep unresolved attribution disabled", () => {
  assert.match(referralAttributionPolicies.up, /CREATE TABLE referral_limit_policy_versions/);
  assert.match(referralAttributionPolicies.up, /uq_referral_limit_policies_code_version/);
  assert.match(referralAttributionPolicies.up, /'REJECT', 'HELD_FOR_REVIEW'/);
  assert.match(referralAttributionPolicies.up, /approved_by IS NOT NULL/);
  assert.match(referralAttributionPolicies.up, /'CUSTOMER_MONTHLY_REFERRALS', 1, false/);
  assert.match(referralAttributionPolicies.up, /pending team approval/);
  assert.match(referralAttributionPolicies.up, /ADD COLUMN limit_policy_version_id/);
  assert.match(referralAttributionPolicies.down, /DROP TABLE referral_limit_policy_versions/);
});

test("personal referral links are opaque, reusable, non-expiring, and account-scoped", () => {
  assert.match(referralInvitationLinks.up, /CREATE TABLE referral_invitation_links/);
  assert.match(referralInvitationLinks.up, /uq_referral_invitation_links_account/);
  assert.match(referralInvitationLinks.up, /uq_referral_invitation_links_token/);
  assert.match(referralInvitationLinks.up, /\{32,64\}/);
  assert.doesNotMatch(referralInvitationLinks.up, /expires_at|customer_name|email|curp/i);
  assert.match(referralInvitationLinks.down, /DROP TABLE referral_invitation_links/);
});

test("expiration notification delivery history is cohort-idempotent and safe", () => {
  assert.match(expirationNotificationDeliveries.up,
    /CREATE TABLE expiration_notification_deliveries/);
  assert.match(expirationNotificationDeliveries.up,
    /uq_expiration_notification_delivery_key/);
  assert.match(expirationNotificationDeliveries.up, /window_days IN \(60, 30\)/);
  assert.match(expirationNotificationDeliveries.up, /safe_outcome_code/);
  assert.doesNotMatch(expirationNotificationDeliveries.up,
    /email|phone|curp|raw_payload|points_amount/i);
  assert.match(expirationNotificationDeliveries.down,
    /DROP TABLE expiration_notification_deliveries/);
});

test("expected-redemption assumptions are versioned, effective-dated, and approved", () => {
  assert.match(expectedRedemptionAssumptions.up,
    /CREATE TABLE expected_redemption_assumption_versions/);
  assert.match(expectedRedemptionAssumptions.up,
    /uq_expected_redemption_assumptions_code_version/);
  assert.match(expectedRedemptionAssumptions.up,
    /expected_redemption_basis_points BETWEEN 0 AND 10000/);
  assert.match(expectedRedemptionAssumptions.up, /approved_by IS NOT NULL/);
  assert.match(expectedRedemptionAssumptions.up,
    /'EXPECTED_REDEMPTION', 1, true, 6000/);
  assert.match(expectedRedemptionAssumptions.down,
    /DROP TABLE expected_redemption_assumption_versions/);
});

test("manual job retries preserve immutable actor and transition audit", () => {
  assert.match(rewardsJobManualRetries.up, /CREATE TABLE rewards_job_manual_retries/);
  assert.match(rewardsJobManualRetries.up,
    /uq_rewards_job_manual_retries_idempotency/);
  assert.match(rewardsJobManualRetries.up,
    /status_before = 'FAILED' AND status_after = 'PENDING'/);
  assert.match(rewardsJobManualRetries.up, /actor_id varchar\(120\) NOT NULL/);
  assert.doesNotMatch(rewardsJobManualRetries.up, /safe_payload|customer_id|account_id/i);
  assert.match(rewardsJobManualRetries.down, /DROP TABLE rewards_job_manual_retries/);
});

test("Rewards V2 foundation is additive, auditable, and disabled for production", () => {
  for (const table of [
    "rewards_v2_rule_versions",
    "rewards_v2_journeys",
    "rewards_product_facts",
    "rewards_product_fact_events",
    "rewards_profile_activities",
    "rewards_level_decisions",
  ]) {
    assert.match(rewardsV2Foundation.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsV2Foundation.down, new RegExp(`DROP TABLE ${table}`));
  }
  for (const constraint of [
    "uq_rewards_v2_rule_versions_code_version",
    "ck_rewards_v2_rule_versions_production_approval",
    "uq_rewards_v2_journeys_customer",
    "uq_rewards_product_facts_source",
    "ck_rewards_product_facts_active_evidence",
    "uq_rewards_product_fact_events_source",
    "uq_rewards_profile_activities_source",
    "uq_rewards_level_decisions_idempotency",
  ]) {
    assert.match(rewardsV2Foundation.up, new RegExp(constraint));
  }
  assert.match(rewardsV2Foundation.up, /'V2_INVITED_REGISTRATION'[\s\S]{0,160}45/);
  assert.match(rewardsV2Foundation.up, /'V2_INITIAL_PRODUCT_ACTIVE'[\s\S]{0,160}105/);
  assert.match(rewardsV2Foundation.up, /'V2_REDEMPTION', 1, false, false/);
  assert.match(rewardsV2Foundation.up, /'V2_EXPIRY', 1, false, false/);
  assert.match(rewardsV2Foundation.up, /'V2_AVE', 1, false, false/);
  assert.match(rewardsV2Foundation.up, /'V2_REFERRALS', 1, false, false/);
  assert.match(rewardsV2Foundation.up, /'V2_RENEWALS', 1, false, false/);
  assert.doesNotMatch(rewardsV2Foundation.down, /DROP TABLE (?:ledger_entries|point_lots|reward_events)/);
});

test("Rewards V2 live journey links ledger awards to V2 rules without rewriting history", () => {
  assert.match(rewardsV2LiveJourney.up, /ADD COLUMN v2_rule_version_id uuid/);
  assert.match(rewardsV2LiveJourney.up, /ck_reward_events_single_rule_version/);
  assert.match(rewardsV2LiveJourney.up, /V2_FIRST_ACTIVE_PRODUCT_LEVEL/);
  assert.match(rewardsV2LiveJourney.up, /INTERNAL_TEST_ONLY/);
  assert.doesNotMatch(rewardsV2LiveJourney.up, /approved_for_production[\s\S]{0,120}true/);
});

test("customer portal persistence is account-scoped, constrained, and additive", () => {
  for (const table of [
    "rewards_customer_preferences",
    "rewards_notification_reads",
    "rewards_customer_actions",
    "rewards_learning_assignments",
    "rewards_document_requests",
  ]) {
    assert.match(rewardsCustomerPortal.up, new RegExp(`CREATE TABLE ${table}`));
    assert.match(rewardsCustomerPortal.down, new RegExp(`DROP TABLE ${table}`));
  }
  assert.match(rewardsCustomerPortal.up, /PRIMARY KEY \(customer_id, notification_id\)/);
  assert.match(rewardsCustomerPortal.up, /UNIQUE \(customer_id, action_code\)/);
  assert.match(rewardsCustomerPortal.up, /progress BETWEEN 0 AND 100/);
  assert.match(rewardsCustomerPortal.up, /max_size_bytes BETWEEN 1 AND 20971520/);
  assert.doesNotMatch(rewardsCustomerPortal.up, /raw_evidence|provider|source_id|checkpoint/i);
});
