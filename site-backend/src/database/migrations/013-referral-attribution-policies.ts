import type { Migration } from "../migration.js";

const policyEffectiveFrom = "2026-07-14 12:00:00+00";

export const referralAttributionPolicies: Migration = {
  id: "013_referral_attribution_policies",
  up: `
    CREATE TABLE referral_limit_policy_versions (
      id uuid PRIMARY KEY,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      monthly_limit integer CHECK (monthly_limit IS NULL OR monthly_limit > 0),
      business_timezone varchar(100),
      excess_outcome varchar(32) CHECK (
        excess_outcome IS NULL OR excess_outcome IN ('REJECT', 'HELD_FOR_REVIEW')
      ),
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      approved_by varchar(120),
      approved_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_referral_limit_policies_code_version UNIQUE (code, version),
      CONSTRAINT ck_referral_limit_policy_interval CHECK (
        effective_to IS NULL OR effective_to > effective_from
      ),
      CONSTRAINT ck_referral_limit_policy_enabled_values CHECK (
        NOT enabled OR (
          monthly_limit IS NOT NULL AND
          business_timezone IS NOT NULL AND length(trim(business_timezone)) > 0 AND
          excess_outcome IS NOT NULL AND
          approved_by IS NOT NULL AND length(trim(approved_by)) > 0 AND
          approved_at IS NOT NULL
        )
      ),
      CONSTRAINT ck_referral_limit_policy_disabled_reason CHECK (
        enabled OR disabled_reason IS NOT NULL
      )
    );
    CREATE INDEX ix_referral_limit_policies_effective
      ON referral_limit_policy_versions (code, enabled, effective_from, effective_to);

    ALTER TABLE referrals
      ADD COLUMN limit_policy_version_id uuid
      REFERENCES referral_limit_policy_versions(id) ON DELETE RESTRICT;
    CREATE INDEX ix_referrals_referrer_policy_attributed
      ON referrals (referring_account_id, limit_policy_version_id, attributed_at DESC);

    INSERT INTO referral_limit_policy_versions (
      id, code, version, enabled, monthly_limit, business_timezone,
      excess_outcome, effective_from, effective_to, disabled_reason,
      approved_by, approved_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000601',
      'CUSTOMER_MONTHLY_REFERRALS', 1, false, NULL, NULL, NULL,
      '${policyEffectiveFrom}', NULL,
      'The monthly referral limit, business timezone, and excess outcome are pending team approval.',
      NULL, NULL, '${policyEffectiveFrom}', '${policyEffectiveFrom}'
    );
  `,
  down: `
    DROP INDEX ix_referrals_referrer_policy_attributed;
    ALTER TABLE referrals DROP COLUMN limit_policy_version_id;
    DROP TABLE referral_limit_policy_versions;
  `,
};
