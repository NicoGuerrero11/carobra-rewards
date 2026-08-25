import type { Migration } from "../migration.js";

export const rewardsCatalogRedemptions: Migration = {
  id: "003_rewards_catalog_redemptions",
  up: `
    CREATE TABLE catalog_items (
      id uuid PRIMARY KEY,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      name varchar(160) NOT NULL,
      description text NOT NULL,
      mode varchar(32) NOT NULL,
      enabled boolean NOT NULL,
      point_price bigint CHECK (point_price IS NULL OR point_price > 0),
      eligibility_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
      inventory_mode varchar(24) NOT NULL,
      fulfillment_mode varchar(40) NOT NULL,
      partner_dependency varchar(120),
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_catalog_items_code_version UNIQUE (code, version),
      CONSTRAINT ck_catalog_items_interval CHECK (effective_to IS NULL OR effective_to > effective_from),
      CONSTRAINT ck_catalog_items_points_price CHECK (
        (mode = 'POINTS' AND point_price IS NOT NULL) OR
        (mode <> 'POINTS' AND point_price IS NULL)
      ),
      CONSTRAINT ck_catalog_items_disabled_reason CHECK (enabled OR disabled_reason IS NOT NULL)
    );
    CREATE INDEX ix_catalog_items_available
      ON catalog_items (enabled, effective_from, effective_to, mode);

    CREATE TABLE catalog_inventory (
      id uuid PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      total_capacity integer CHECK (total_capacity IS NULL OR total_capacity >= 0),
      reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      fulfilled_quantity integer NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
      released_quantity integer NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_catalog_inventory_item UNIQUE (catalog_item_id),
      CONSTRAINT ck_catalog_inventory_commitments CHECK (
        total_capacity IS NULL OR reserved_quantity + fulfilled_quantity <= total_capacity
      )
    );

    CREATE TABLE entitlements (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      reward_event_id uuid REFERENCES reward_events(id) ON DELETE RESTRICT,
      status varchar(24) NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      granted_at timestamptz NOT NULL,
      used_at timestamptz,
      expires_at timestamptz,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_entitlements_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_entitlements_use_time CHECK (used_at IS NULL OR used_at >= granted_at),
      CONSTRAINT ck_entitlements_expiration CHECK (expires_at IS NULL OR expires_at > granted_at)
    );
    CREATE INDEX ix_entitlements_account_status ON entitlements (account_id, status, expires_at);

    CREATE TABLE redemptions (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      status varchar(24) NOT NULL,
      points_cost bigint NOT NULL DEFAULT 0 CHECK (points_cost >= 0),
      quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
      idempotency_key varchar(200) NOT NULL,
      correlation_id uuid NOT NULL,
      requested_at timestamptz NOT NULL,
      confirmed_at timestamptz,
      fulfilled_at timestamptz,
      cancelled_at timestamptz,
      refunded_at timestamptz,
      external_fulfillment_reference varchar(180),
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_redemptions_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_redemptions_points_cost CHECK (points_cost > 0 OR status = 'WAITLISTED')
    );
    CREATE INDEX ix_redemptions_account_requested ON redemptions (account_id, requested_at DESC);
    CREATE INDEX ix_redemptions_item_status ON redemptions (catalog_item_id, status);

    CREATE TABLE waitlist_entries (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      redemption_id uuid REFERENCES redemptions(id) ON DELETE RESTRICT,
      status varchar(24) NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      joined_at timestamptz NOT NULL,
      promoted_at timestamptz,
      closed_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_waitlist_entries_idempotency UNIQUE (idempotency_key),
      CONSTRAINT uq_waitlist_entries_redemption UNIQUE (redemption_id)
    );
    CREATE UNIQUE INDEX uq_waitlist_entries_active_account_item
      ON waitlist_entries (account_id, catalog_item_id)
      WHERE status IN ('WAITING', 'PROMOTED');
    CREATE INDEX ix_waitlist_entries_promotion
      ON waitlist_entries (catalog_item_id, status, joined_at);

    CREATE TABLE redemption_allocations (
      id uuid PRIMARY KEY,
      redemption_id uuid NOT NULL REFERENCES redemptions(id) ON DELETE RESTRICT,
      point_allocation_id uuid NOT NULL REFERENCES point_allocations(id) ON DELETE RESTRICT,
      points bigint NOT NULL CHECK (points > 0),
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_redemption_allocations_point_allocation UNIQUE (point_allocation_id),
      CONSTRAINT uq_redemption_allocations_redemption_allocation UNIQUE (redemption_id, point_allocation_id)
    );
    CREATE INDEX ix_redemption_allocations_redemption ON redemption_allocations (redemption_id);
  `,
  down: `
    DROP TABLE redemption_allocations;
    DROP TABLE waitlist_entries;
    DROP TABLE redemptions;
    DROP TABLE entitlements;
    DROP TABLE catalog_inventory;
    DROP TABLE catalog_items;
  `,
};
