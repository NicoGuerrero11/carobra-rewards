import type { Migration } from "../migration.js";

export const rewardsReferralsProductsAdvisors: Migration = {
  id: "004_rewards_referrals_products_advisors",
  up: `
    CREATE TABLE referrals (
      id uuid PRIMARY KEY,
      referring_account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      referring_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      referred_customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
      referred_identity_hash varchar(128) NOT NULL,
      source varchar(40) NOT NULL,
      source_id varchar(180) NOT NULL,
      status varchar(32) NOT NULL,
      attributed_at timestamptz NOT NULL,
      registered_at timestamptz,
      active_service_started_at timestamptz,
      rejection_reason varchar(80),
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_referrals_source_identity UNIQUE (source, source_id),
      CONSTRAINT ck_referrals_not_self CHECK (
        referred_customer_id IS NULL OR referred_customer_id <> referring_customer_id
      )
    );
    CREATE UNIQUE INDEX uq_referrals_accepted_referred_customer
      ON referrals (referred_customer_id)
      WHERE referred_customer_id IS NOT NULL AND status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE');
    CREATE UNIQUE INDEX uq_referrals_accepted_identity
      ON referrals (referred_identity_hash)
      WHERE status IN ('ATTRIBUTED', 'REGISTERED', 'ACTIVE');
    CREATE INDEX ix_referrals_referrer_attributed
      ON referrals (referring_account_id, attributed_at DESC);

    CREATE TABLE product_contracts (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      provider varchar(24) NOT NULL,
      product_code varchar(80) NOT NULL,
      external_contract_id varchar(180) NOT NULL,
      status varchar(32) NOT NULL,
      contracted_at timestamptz NOT NULL,
      activated_at timestamptz,
      cancelled_at timestamptz,
      cancellation_reason varchar(80),
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_product_contracts_external_identity UNIQUE (provider, external_contract_id),
      CONSTRAINT ck_product_contract_activation CHECK (
        activated_at IS NULL OR activated_at >= contracted_at
      ),
      CONSTRAINT ck_product_contract_cancellation CHECK (
        cancelled_at IS NULL OR cancelled_at >= contracted_at
      )
    );
    CREATE INDEX ix_product_contracts_account_status ON product_contracts (account_id, status);
    ALTER TABLE reward_events
      ADD CONSTRAINT fk_reward_events_product_contract
      FOREIGN KEY (product_contract_id) REFERENCES product_contracts(id) ON DELETE RESTRICT;

    CREATE TABLE restricted_wallets (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      product_contract_id uuid NOT NULL REFERENCES product_contracts(id) ON DELETE RESTRICT,
      currency char(3) NOT NULL,
      policy_version varchar(100) NOT NULL,
      release_condition jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(32) NOT NULL,
      pending_amount numeric(19, 4) NOT NULL DEFAULT 0 CHECK (pending_amount >= 0),
      available_amount numeric(19, 4) NOT NULL DEFAULT 0 CHECK (available_amount >= 0),
      applied_amount numeric(19, 4) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
      cancelled_amount numeric(19, 4) NOT NULL DEFAULT 0 CHECK (cancelled_amount >= 0),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_restricted_wallets_contract_currency_policy
        UNIQUE (product_contract_id, currency, policy_version)
    );
    CREATE INDEX ix_restricted_wallets_account_status ON restricted_wallets (account_id, status);

    CREATE TABLE restricted_wallet_entries (
      id uuid PRIMARY KEY,
      wallet_id uuid NOT NULL REFERENCES restricted_wallets(id) ON DELETE RESTRICT,
      entry_type varchar(32) NOT NULL,
      amount_delta numeric(19, 4) NOT NULL CHECK (amount_delta <> 0),
      idempotency_key varchar(200) NOT NULL,
      correlation_id uuid NOT NULL,
      policy_version varchar(100) NOT NULL,
      reason_code varchar(80),
      external_event_id varchar(180),
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_restricted_wallet_entries_idempotency UNIQUE (idempotency_key)
    );
    CREATE INDEX ix_restricted_wallet_entries_wallet_created
      ON restricted_wallet_entries (wallet_id, created_at);

    CREATE TABLE advisors (
      id uuid PRIMARY KEY,
      external_advisor_id varchar(120) NOT NULL,
      status varchar(24) NOT NULL,
      display_name varchar(160) NOT NULL,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_advisors_external_id UNIQUE (external_advisor_id)
    );

    CREATE TABLE advisor_attributions (
      id uuid PRIMARY KEY,
      advisor_id uuid REFERENCES advisors(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      product_contract_id uuid REFERENCES product_contracts(id) ON DELETE RESTRICT,
      origin varchar(32) NOT NULL,
      source_id varchar(180) NOT NULL,
      attributed_at timestamptz NOT NULL,
      ended_at timestamptz,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_advisor_attributions_source UNIQUE (source_id),
      CONSTRAINT ck_advisor_attribution_origin CHECK (
        (origin = 'ADVISOR' AND advisor_id IS NOT NULL) OR
        (origin <> 'ADVISOR' AND advisor_id IS NULL)
      ),
      CONSTRAINT ck_advisor_attribution_interval CHECK (ended_at IS NULL OR ended_at > attributed_at)
    );
    CREATE UNIQUE INDEX uq_advisor_attributions_active_customer_origin
      ON advisor_attributions (customer_id, origin)
      WHERE product_contract_id IS NULL AND ended_at IS NULL;
    CREATE UNIQUE INDEX uq_advisor_attributions_active_product
      ON advisor_attributions (product_contract_id)
      WHERE product_contract_id IS NOT NULL AND ended_at IS NULL;

    CREATE TABLE compensation_policy_versions (
      id uuid PRIMARY KEY,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      advisor_share_rate numeric(7, 6) CHECK (
        advisor_share_rate IS NULL OR advisor_share_rate BETWEEN 0 AND 1
      ),
      customer_benefit_share_rate numeric(7, 6) CHECK (
        customer_benefit_share_rate IS NULL OR customer_benefit_share_rate BETWEEN 0 AND 1
      ),
      activity_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
      configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_compensation_policies_code_version UNIQUE (code, version),
      CONSTRAINT ck_compensation_policy_interval CHECK (effective_to IS NULL OR effective_to > effective_from),
      CONSTRAINT ck_compensation_policy_disabled_reason CHECK (enabled OR disabled_reason IS NOT NULL)
    );
    CREATE INDEX ix_compensation_policies_effective
      ON compensation_policy_versions (code, enabled, effective_from, effective_to);

    CREATE TABLE compensation_records (
      id uuid PRIMARY KEY,
      advisor_id uuid REFERENCES advisors(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      product_contract_id uuid REFERENCES product_contracts(id) ON DELETE RESTRICT,
      policy_version_id uuid NOT NULL REFERENCES compensation_policy_versions(id) ON DELETE RESTRICT,
      currency char(3) NOT NULL,
      gross_amount numeric(19, 4) NOT NULL CHECK (gross_amount >= 0),
      advisor_share_amount numeric(19, 4) NOT NULL CHECK (advisor_share_amount >= 0),
      customer_benefit_amount numeric(19, 4) NOT NULL CHECK (customer_benefit_amount >= 0),
      calculation_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
      activity_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(32) NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      external_export_reference varchar(180),
      external_payment_reference varchar(180),
      calculated_at timestamptz NOT NULL,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_compensation_records_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_compensation_record_split CHECK (
        advisor_share_amount + customer_benefit_amount <= gross_amount
      )
    );
    CREATE UNIQUE INDEX uq_compensation_records_export_reference
      ON compensation_records (external_export_reference)
      WHERE external_export_reference IS NOT NULL;
    CREATE UNIQUE INDEX uq_compensation_records_payment_reference
      ON compensation_records (external_payment_reference)
      WHERE external_payment_reference IS NOT NULL;
    CREATE INDEX ix_compensation_records_advisor_status
      ON compensation_records (advisor_id, status, calculated_at);

    CREATE TABLE rewards_review_flags (
      id uuid PRIMARY KEY,
      flag_type varchar(80) NOT NULL,
      subject_type varchar(40) NOT NULL,
      subject_id uuid NOT NULL,
      status varchar(24) NOT NULL,
      severity varchar(24) NOT NULL,
      safe_reason_code varchar(80) NOT NULL,
      safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      correlation_id uuid NOT NULL,
      opened_at timestamptz NOT NULL,
      resolved_at timestamptz,
      resolved_by varchar(120),
      resolution_code varchar(80),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_review_flags_business_key
        UNIQUE (flag_type, subject_type, subject_id, correlation_id),
      CONSTRAINT ck_rewards_review_flag_resolution CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL AND resolution_code IS NULL) OR
        (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_code IS NOT NULL)
      )
    );
    CREATE INDEX ix_rewards_review_flags_status_opened
      ON rewards_review_flags (status, opened_at);
  `,
  down: `
    DROP TABLE rewards_review_flags;
    DROP TABLE compensation_records;
    DROP TABLE compensation_policy_versions;
    DROP TABLE advisor_attributions;
    DROP TABLE advisors;
    DROP TABLE restricted_wallet_entries;
    DROP TABLE restricted_wallets;
    ALTER TABLE reward_events DROP CONSTRAINT fk_reward_events_product_contract;
    DROP TABLE product_contracts;
    DROP TABLE referrals;
  `,
};
