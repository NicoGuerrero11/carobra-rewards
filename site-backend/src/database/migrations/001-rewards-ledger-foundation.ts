import type { Migration } from "../migration.js";

export const rewardsLedgerFoundation: Migration = {
  id: "001_rewards_ledger_foundation",
  up: `
    CREATE TABLE rewards_accounts (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      status varchar(24) NOT NULL,
      activated_at timestamptz NOT NULL,
      available_points bigint NOT NULL DEFAULT 0 CHECK (available_points >= 0),
      reserved_points bigint NOT NULL DEFAULT 0 CHECK (reserved_points >= 0),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_accounts_customer_id UNIQUE (customer_id)
    );

    CREATE TABLE behavior_rule_versions (
      id uuid PRIMARY KEY,
      code varchar(80) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      point_value bigint CHECK (point_value IS NULL OR point_value >= 0),
      validity_policy varchar(32) NOT NULL,
      evidence_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
      configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_behavior_rules_code_version UNIQUE (code, version),
      CONSTRAINT ck_behavior_rules_interval CHECK (effective_to IS NULL OR effective_to > effective_from),
      CONSTRAINT ck_behavior_rules_disabled_reason CHECK (enabled OR disabled_reason IS NOT NULL)
    );
    CREATE INDEX ix_behavior_rules_effective
      ON behavior_rule_versions (code, enabled, effective_from, effective_to);

    CREATE TABLE reward_events (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      rule_version_id uuid NOT NULL REFERENCES behavior_rule_versions(id) ON DELETE RESTRICT,
      source varchar(24) NOT NULL,
      source_id varchar(180) NOT NULL,
      event_type varchar(80) NOT NULL,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      service_id uuid,
      product_contract_id uuid,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_reward_events_source_identity UNIQUE (source, source_id)
    );
    CREATE INDEX ix_reward_events_account_occurred ON reward_events (account_id, occurred_at);
    CREATE INDEX ix_reward_events_customer_type ON reward_events (customer_id, event_type);

    CREATE TABLE ledger_entries (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      reward_event_id uuid REFERENCES reward_events(id) ON DELETE RESTRICT,
      rule_version_id uuid REFERENCES behavior_rule_versions(id) ON DELETE RESTRICT,
      entry_type varchar(24) NOT NULL,
      points_delta bigint NOT NULL CHECK (points_delta <> 0),
      idempotency_key varchar(200) NOT NULL,
      correlation_id uuid NOT NULL,
      actor_type varchar(24) NOT NULL,
      actor_id varchar(120),
      reason_code varchar(80),
      explanation text,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_ledger_entries_idempotency UNIQUE (idempotency_key),
      CONSTRAINT uq_ledger_entries_reward_event UNIQUE (reward_event_id)
    );
    CREATE INDEX ix_ledger_entries_account_created ON ledger_entries (account_id, created_at);
    CREATE INDEX ix_ledger_entries_correlation ON ledger_entries (correlation_id);

    CREATE TABLE point_lots (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      source_ledger_entry_id uuid NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,
      issued_points bigint NOT NULL CHECK (issued_points > 0),
      remaining_points bigint NOT NULL CHECK (remaining_points >= 0 AND remaining_points <= issued_points),
      issued_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
      expired_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_point_lots_source_entry UNIQUE (source_ledger_entry_id)
    );
    CREATE INDEX ix_point_lots_fifo ON point_lots (account_id, expires_at, issued_at);

    CREATE TABLE point_allocations (
      id uuid PRIMARY KEY,
      ledger_entry_id uuid NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,
      lot_id uuid NOT NULL REFERENCES point_lots(id) ON DELETE RESTRICT,
      points bigint NOT NULL CHECK (points > 0),
      status varchar(24) NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_point_allocations_entry_lot UNIQUE (ledger_entry_id, lot_id)
    );
    CREATE INDEX ix_point_allocations_lot_status ON point_allocations (lot_id, status);
  `,
  down: `
    DROP TABLE point_allocations;
    DROP TABLE point_lots;
    DROP TABLE ledger_entries;
    DROP TABLE reward_events;
    DROP TABLE behavior_rule_versions;
    DROP TABLE rewards_accounts;
  `,
};
