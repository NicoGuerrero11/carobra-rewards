import type { Migration } from "../migration.js";

const effectiveFrom = "2026-09-10 00:00:00+00";

export const bondaCoupons: Migration = {
  id: "022_bonda_coupons",
  up: `
    ALTER TABLE catalog_items
      ADD COLUMN partner_item_reference varchar(200);

    ALTER TABLE catalog_items
      ADD CONSTRAINT ck_catalog_items_bonda_reference CHECK (
        partner_dependency <> 'BONDA'
        OR NOT enabled
        OR partner_item_reference IS NOT NULL
      );

    CREATE UNIQUE INDEX uq_catalog_items_partner_reference_version
      ON catalog_items (partner_dependency, partner_item_reference, version)
      WHERE partner_dependency IS NOT NULL AND partner_item_reference IS NOT NULL;

    CREATE TABLE bonda_affiliate_provisioning (
      customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
      rewards_id varchar(200) NOT NULL,
      state varchar(24) NOT NULL DEFAULT 'PENDING',
      external_member_id varchar(200),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      last_attempt_at timestamptz,
      next_attempt_at timestamptz,
      safe_error_code varchar(80),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_bonda_affiliate_rewards_id UNIQUE (rewards_id),
      CONSTRAINT ck_bonda_affiliate_state CHECK (
        state IN ('PENDING', 'ACTIVE', 'ACTION_REQUIRED')
      ),
      CONSTRAINT ck_bonda_affiliate_active CHECK (
        state <> 'ACTIVE' OR (next_attempt_at IS NULL AND safe_error_code IS NULL)
      ),
      CONSTRAINT ck_bonda_affiliate_action_required CHECK (
        state <> 'ACTION_REQUIRED' OR (next_attempt_at IS NULL AND safe_error_code IS NOT NULL)
      ),
      CONSTRAINT ck_bonda_affiliate_retry_time CHECK (
        next_attempt_at IS NULL OR last_attempt_at IS NULL OR next_attempt_at > last_attempt_at
      )
    );
    CREATE INDEX ix_bonda_affiliate_retry
      ON bonda_affiliate_provisioning (next_attempt_at, customer_id)
      WHERE state = 'PENDING';

    CREATE TABLE bonda_coupon_requests (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      bonda_coupon_id varchar(200) NOT NULL,
      external_id varchar(200) NOT NULL,
      status varchar(32) NOT NULL,
      bonda_receipt_id varchar(200),
      safe_result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      requested_at timestamptz NOT NULL,
      resolved_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_bonda_coupon_requests_external_id UNIQUE (external_id),
      CONSTRAINT ck_bonda_coupon_requests_status CHECK (
        status IN (
          'PENDING', 'ISSUED', 'LIMIT_REACHED', 'INVENTORY_UNAVAILABLE',
          'UNAVAILABLE', 'VERIFICATION_REQUIRED'
        )
      ),
      CONSTRAINT ck_bonda_coupon_requests_metadata CHECK (
        jsonb_typeof(safe_result_metadata) = 'object'
        AND octet_length(safe_result_metadata::text) <= 8192
      ),
      CONSTRAINT ck_bonda_coupon_requests_resolution CHECK (
        (status IN ('PENDING', 'VERIFICATION_REQUIRED') AND resolved_at IS NULL)
        OR (status NOT IN ('PENDING', 'VERIFICATION_REQUIRED') AND resolved_at IS NOT NULL)
      )
    );
    CREATE INDEX ix_bonda_coupon_requests_customer_requested
      ON bonda_coupon_requests (customer_id, requested_at DESC);
    CREATE INDEX ix_bonda_coupon_requests_verification
      ON bonda_coupon_requests (updated_at, id)
      WHERE status = 'VERIFICATION_REQUIRED';

    INSERT INTO rewards_v2_rule_versions (
      id, rule_type, code, version, enabled, approved_for_production,
      settings, effective_from, effective_to, disabled_reason,
      approved_at, approved_by, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000002201', 'FEATURE_FLAG',
      'V2_BONDA_COUPONS', 1, false, false,
      '{"separateFromPointRedemption":true,"minimumLevel":"BRONZE","cumulative":true}',
      '${effectiveFrom}', NULL,
      'Bonda test credentials, catalog identifiers, and activation review are pending.',
      NULL, NULL, '${effectiveFrom}', '${effectiveFrom}'
    ) ON CONFLICT (code, version) DO NOTHING;
  `,
  down: `
    DELETE FROM rewards_v2_rule_versions
      WHERE code = 'V2_BONDA_COUPONS' AND version = 1;
    DROP TABLE bonda_coupon_requests;
    DROP TABLE bonda_affiliate_provisioning;
    DROP INDEX uq_catalog_items_partner_reference_version;
    ALTER TABLE catalog_items DROP CONSTRAINT ck_catalog_items_bonda_reference;
    ALTER TABLE catalog_items DROP COLUMN partner_item_reference;
  `,
};
