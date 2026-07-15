import type { Migration } from "../migration.js";

const policyEffectiveFrom = "2026-07-14 12:00:00+00";

export const redemptionLimitPolicies: Migration = {
  id: "012_redemption_limit_policies",
  up: `
    CREATE TABLE redemption_limit_policy_versions (
      id uuid PRIMARY KEY,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      scope_type varchar(32) NOT NULL,
      scope_key varchar(120),
      monthly_limit integer CHECK (monthly_limit IS NULL OR monthly_limit > 0),
      business_timezone varchar(100),
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      approved_by varchar(120),
      approved_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_redemption_limit_policies_code_version UNIQUE (code, version),
      CONSTRAINT ck_redemption_limit_policy_interval CHECK (
        effective_to IS NULL OR effective_to > effective_from
      ),
      CONSTRAINT ck_redemption_limit_policy_scope CHECK (
        (scope_type = 'GLOBAL' AND scope_key IS NULL) OR
        (scope_type IN ('CATALOG_ITEM', 'INVENTORY_MODE') AND scope_key IS NOT NULL)
      ),
      CONSTRAINT ck_redemption_limit_policy_enabled_values CHECK (
        NOT enabled OR (
          monthly_limit IS NOT NULL AND
          business_timezone IS NOT NULL AND length(trim(business_timezone)) > 0 AND
          approved_by IS NOT NULL AND length(trim(approved_by)) > 0 AND
          approved_at IS NOT NULL
        )
      ),
      CONSTRAINT ck_redemption_limit_policy_disabled_reason CHECK (
        enabled OR disabled_reason IS NOT NULL
      )
    );
    CREATE INDEX ix_redemption_limit_policies_effective
      ON redemption_limit_policy_versions (
        code, scope_type, scope_key, enabled, effective_from, effective_to
      );

    ALTER TABLE redemptions
      ADD COLUMN limit_policy_version_id uuid
      REFERENCES redemption_limit_policy_versions(id) ON DELETE RESTRICT;
    CREATE INDEX ix_redemptions_account_policy_requested
      ON redemptions (account_id, limit_policy_version_id, requested_at DESC);

    INSERT INTO redemption_limit_policy_versions (
      id, code, version, enabled, scope_type, scope_key, monthly_limit,
      business_timezone, effective_from, effective_to, disabled_reason,
      approved_by, approved_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000501',
      'CUSTOMER_MONTHLY_REDEMPTIONS', 1, false, 'GLOBAL', NULL, NULL, NULL,
      '${policyEffectiveFrom}', NULL,
      'The monthly redemption limit, scope, and business timezone are pending team approval.',
      NULL, NULL, '${policyEffectiveFrom}', '${policyEffectiveFrom}'
    );
  `,
  down: `
    DROP INDEX ix_redemptions_account_policy_requested;
    ALTER TABLE redemptions DROP COLUMN limit_policy_version_id;
    DROP TABLE redemption_limit_policy_versions;
  `,
};
