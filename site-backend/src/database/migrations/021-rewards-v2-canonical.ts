import type { Migration } from "../migration.js";

const canonicalAt = "2026-08-25 18:00:00+00";

export const rewardsV2Canonical: Migration = {
  id: "021_rewards_v2_canonical",
  up: `
    UPDATE behavior_rule_versions
    SET enabled = false,
        effective_to = CASE
          WHEN effective_to IS NULL OR effective_to > '${canonicalAt}'
            THEN '${canonicalAt}'::timestamptz
          ELSE effective_to
        END,
        disabled_reason = 'Retired: Rewards V2 is the canonical business model.',
        updated_at = '${canonicalAt}'
    WHERE enabled = true;

    UPDATE rewards_v2_rule_versions
    SET approved_for_production = true,
        settings = jsonb_set(
          jsonb_set(settings, '{activationScope}', '"PRODUCTION"'::jsonb, true),
          '{productionValidityMonths}',
          COALESCE(
            NULLIF(settings->'productionValidityMonths', 'null'::jsonb),
            settings->'testValidityMonths',
            '18'::jsonb
          ),
          true
        ),
        approved_at = '${canonicalAt}',
        approved_by = 'carobra-rewards-v2-business-decision',
        updated_at = '${canonicalAt}'
    WHERE code IN (
      'V2_INVITED_REGISTRATION',
      'V2_INITIAL_PRODUCT_ACTIVE',
      'V2_SISCA_AFORE_ACTIVE',
      'V2_FIRST_ACTIVE_PRODUCT_LEVEL'
    )
      AND enabled = true;
  `,
  down: `
    UPDATE rewards_v2_rule_versions
    SET approved_for_production = false,
        settings = jsonb_set(
          jsonb_set(settings, '{activationScope}', '"INTERNAL_TEST_ONLY"'::jsonb, true),
          '{productionValidityMonths}',
          'null'::jsonb,
          true
        ),
        approved_at = NULL,
        approved_by = NULL,
        updated_at = '${canonicalAt}'
    WHERE code IN (
      'V2_INVITED_REGISTRATION',
      'V2_INITIAL_PRODUCT_ACTIVE',
      'V2_SISCA_AFORE_ACTIVE',
      'V2_FIRST_ACTIVE_PRODUCT_LEVEL'
    );

    UPDATE behavior_rule_versions
    SET enabled = true,
        effective_to = NULL,
        disabled_reason = NULL,
        updated_at = '${canonicalAt}'
    WHERE code IN (
      'REGISTRATION_ACTIVATION',
      'AFORE_ANNIVERSARY_6_MONTHS',
      'AFORE_ANNIVERSARY_12_MONTHS',
      'AFORE_ANNIVERSARY_18_MONTHS',
      'REFERRAL_REGISTRATION',
      'REFERRAL_PERMANENCE_6_MONTHS',
      'REFERRAL_PERMANENCE_12_MONTHS',
      'SKANDIA_CONTRACTING'
    )
      AND disabled_reason = 'Retired: Rewards V2 is the canonical business model.';
  `,
};
