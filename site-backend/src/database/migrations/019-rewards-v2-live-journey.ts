import type { Migration } from "../migration.js";

const effectiveFrom = "2026-08-24 00:00:00+00";

export const rewardsV2LiveJourney: Migration = {
  id: "019_rewards_v2_live_journey",
  up: `
    ALTER TABLE reward_events
      ALTER COLUMN rule_version_id DROP NOT NULL,
      ADD COLUMN v2_rule_version_id uuid
        REFERENCES rewards_v2_rule_versions(id) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_reward_events_single_rule_version CHECK (
        num_nonnulls(rule_version_id, v2_rule_version_id) = 1
      );

    ALTER TABLE ledger_entries
      ADD COLUMN v2_rule_version_id uuid
        REFERENCES rewards_v2_rule_versions(id) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_ledger_entries_single_rule_version CHECK (
        num_nonnulls(rule_version_id, v2_rule_version_id) <= 1
      );

    CREATE INDEX ix_reward_events_v2_rule_version
      ON reward_events (v2_rule_version_id)
      WHERE v2_rule_version_id IS NOT NULL;
    CREATE INDEX ix_ledger_entries_v2_rule_version
      ON ledger_entries (v2_rule_version_id)
      WHERE v2_rule_version_id IS NOT NULL;

    INSERT INTO rewards_v2_rule_versions (
      id, rule_type, code, version, enabled, approved_for_production,
      settings, effective_from, effective_to, disabled_reason,
      approved_at, approved_by, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000001812', 'LEVEL_RULE',
      'V2_FIRST_ACTIVE_PRODUCT_LEVEL', 1, true, false,
      '{"minimumActiveProducts":1,"resultingLevel":"BRONZE","activationScope":"INTERNAL_TEST_ONLY"}',
      '${effectiveFrom}', NULL, NULL, NULL, NULL,
      '${effectiveFrom}', '${effectiveFrom}'
    ) ON CONFLICT (code, version) DO NOTHING;
  `,
  down: `
    DELETE FROM rewards_v2_rule_versions
    WHERE code = 'V2_FIRST_ACTIVE_PRODUCT_LEVEL' AND version = 1;

    DROP INDEX ix_ledger_entries_v2_rule_version;
    DROP INDEX ix_reward_events_v2_rule_version;
    ALTER TABLE ledger_entries
      DROP CONSTRAINT ck_ledger_entries_single_rule_version,
      DROP COLUMN v2_rule_version_id;
    ALTER TABLE reward_events
      DROP CONSTRAINT ck_reward_events_single_rule_version,
      DROP COLUMN v2_rule_version_id,
      ALTER COLUMN rule_version_id SET NOT NULL;
  `,
};
