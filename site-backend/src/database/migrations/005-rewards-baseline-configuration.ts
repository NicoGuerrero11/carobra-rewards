import type { Migration } from "../migration.js";

const baselineEffectiveFrom = "2026-07-14 00:00:00+00";

export const rewardsBaselineConfiguration: Migration = {
  id: "005_rewards_baseline_configuration",
  up: `
    INSERT INTO behavior_rule_versions (
      id, code, version, enabled, point_value, validity_policy,
      evidence_requirements, configuration, effective_from, effective_to,
      disabled_reason, created_at, updated_at
    ) VALUES
      ('00000000-0000-4000-8000-000000000101', 'REGISTRATION_ACTIVATION', 1, true, 2000, 'NORMAL_18_MONTHS',
       '{"customerStatus":"ACTIVE","siscaStatus":"VALIDATED","aforeRelationStatus":"ACTIVE"}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000102', 'ONBOARDING_COMPLETION', 1, false, 5000, 'NORMAL_18_MONTHS',
       '{"requiredEvidence":["confirmation","video","survey"]}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'Onboarding evidence owners and Cinepolis fulfillment are not approved.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000103', 'MONTHLY_INTERACTION', 1, false, 1000, 'NORMAL_18_MONTHS',
       '{"requiresAuthenticatedSession":true,"requiresQualifyingAction":true}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'Qualifying actions and the business timezone are not approved.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000104', 'BIRTHDAY', 1, false, 5000, 'NORMAL_18_MONTHS',
       '{"requiresVerifiedBirthDate":true}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'No approved verified birth-date source is configured.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000105', 'AFORE_ANNIVERSARY_6_MONTHS', 1, true, 5000, 'NORMAL_18_MONTHS',
       '{"activeAforeMonths":6}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000106', 'AFORE_ANNIVERSARY_12_MONTHS', 1, true, 15000, 'NORMAL_18_MONTHS',
       '{"activeAforeMonths":12}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000107', 'AFORE_ANNIVERSARY_18_MONTHS', 1, true, 35000, 'NORMAL_18_MONTHS',
       '{"activeAforeMonths":18}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000108', 'AVE_CONFIRMED_CONTRIBUTION', 1, false, 500, 'NORMAL_18_MONTHS',
       '{"requiresConfirmedExternalContribution":true}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'The authenticated AVE adapter contract is not approved.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000109', 'REFERRAL_REGISTRATION', 1, true, 3000, 'NORMAL_18_MONTHS',
       '{"requiresAcceptedAttribution":true,"milestone":"REGISTRATION"}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000110', 'REFERRAL_PERMANENCE_6_MONTHS', 1, true, 3000, 'NORMAL_18_MONTHS',
       '{"requiresAcceptedAttribution":true,"activeAforeMonths":6}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000111', 'REFERRAL_PERMANENCE_12_MONTHS', 1, true, 5000, 'NORMAL_18_MONTHS',
       '{"requiresAcceptedAttribution":true,"activeAforeMonths":12}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000112', 'SKANDIA_CONTRACTING', 1, true, 5000, 'NORMAL_18_MONTHS',
       '{"provider":"SKANDIA","qualifyingProducts":["PPR","LIFE"]}', '{}',
       '${baselineEffectiveFrom}', NULL, NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000113', 'PRODUCT_PERMANENCE_12_MONTHS', 1, false, 5000, 'NORMAL_18_MONTHS',
       '{"activeProductMonths":12}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'Partner status adapters and cancellation-safe permanence evidence are not approved.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000114', 'QUALITAS_ACTIVATION', 1, false, NULL, 'NORMAL_18_MONTHS',
       '{"provider":"QUALITAS"}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'The Qualitas activation strategy and customer value are not approved.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'),
      ('00000000-0000-4000-8000-000000000115', 'CATALOG_REDEMPTION', 1, false, NULL, 'NORMAL_18_MONTHS',
       '{}', '{}',
       '${baselineEffectiveFrom}', NULL,
       'The approved catalog, inventory, fulfillment agreements, and monthly redemption limit are unavailable.',
       '${baselineEffectiveFrom}', '${baselineEffectiveFrom}')
    ON CONFLICT (code, version) DO NOTHING;

    INSERT INTO compensation_policy_versions (
      id, code, version, enabled, advisor_share_rate, customer_benefit_share_rate,
      activity_requirements, configuration, effective_from, effective_to,
      disabled_reason, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000201',
      'PLATFORM_CROSS_SELL_80_20',
      1,
      false,
      0.800000,
      0.200000,
      '{"requiresApprovedActivityDefinition":true}',
      '{"undefinedActivityOutcome":"HELD_FOR_REVIEW"}',
      '${baselineEffectiveFrom}',
      NULL,
      'The final advisor matrix and active-platform evidence definition are not approved.',
      '${baselineEffectiveFrom}',
      '${baselineEffectiveFrom}'
    ) ON CONFLICT (code, version) DO NOTHING;
  `,
  down: `
    DELETE FROM compensation_policy_versions
      WHERE id = '00000000-0000-4000-8000-000000000201';
    DELETE FROM behavior_rule_versions
      WHERE id IN (
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000102',
        '00000000-0000-4000-8000-000000000103',
        '00000000-0000-4000-8000-000000000104',
        '00000000-0000-4000-8000-000000000105',
        '00000000-0000-4000-8000-000000000106',
        '00000000-0000-4000-8000-000000000107',
        '00000000-0000-4000-8000-000000000108',
        '00000000-0000-4000-8000-000000000109',
        '00000000-0000-4000-8000-000000000110',
        '00000000-0000-4000-8000-000000000111',
        '00000000-0000-4000-8000-000000000112',
        '00000000-0000-4000-8000-000000000113',
        '00000000-0000-4000-8000-000000000114',
        '00000000-0000-4000-8000-000000000115'
      );
  `,
};
