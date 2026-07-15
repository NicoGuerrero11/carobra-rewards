import type { Migration } from "../migration.js";

const baselineEffectiveFrom = "2025-01-01 00:00:00+00";

export const expectedRedemptionAssumptions: Migration = {
  id: "016_expected_redemption_assumptions",
  up: `
    CREATE TABLE expected_redemption_assumption_versions (
      id uuid PRIMARY KEY,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      expected_redemption_basis_points integer CHECK (
        expected_redemption_basis_points BETWEEN 0 AND 10000
      ),
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      approved_by varchar(120),
      approved_at timestamptz,
      disabled_reason text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_expected_redemption_assumptions_code_version UNIQUE (code, version),
      CONSTRAINT ck_expected_redemption_assumption_interval CHECK (
        effective_to IS NULL OR effective_to > effective_from
      ),
      CONSTRAINT ck_expected_redemption_assumption_enabled_values CHECK (
        NOT enabled OR (
          expected_redemption_basis_points IS NOT NULL AND
          approved_by IS NOT NULL AND length(trim(approved_by)) > 0 AND
          approved_at IS NOT NULL AND disabled_reason IS NULL
        )
      ),
      CONSTRAINT ck_expected_redemption_assumption_disabled_reason CHECK (
        enabled OR disabled_reason IS NOT NULL
      )
    );
    CREATE INDEX ix_expected_redemption_assumptions_effective
      ON expected_redemption_assumption_versions (
        code, enabled, effective_from, effective_to, version
      );

    INSERT INTO expected_redemption_assumption_versions (
      id, code, version, enabled, expected_redemption_basis_points,
      effective_from, effective_to, approved_by, approved_at, disabled_reason,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000701',
      'EXPECTED_REDEMPTION', 1, true, 6000,
      '${baselineEffectiveFrom}', NULL, 'MVP_DESIGN_BASELINE',
      '${baselineEffectiveFrom}', NULL, '${baselineEffectiveFrom}', '${baselineEffectiveFrom}'
    );
  `,
  down: `
    DROP TABLE expected_redemption_assumption_versions;
  `,
};
