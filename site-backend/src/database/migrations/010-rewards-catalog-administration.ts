import type { Migration } from "../migration.js";

export const rewardsCatalogAdministration: Migration = {
  id: "010_rewards_catalog_administration",
  up: `
    CREATE TABLE catalog_operation_audit (
      id uuid PRIMARY KEY,
      catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
      operation varchar(32) NOT NULL,
      actor_id varchar(160) NOT NULL,
      reason_code varchar(80) NOT NULL,
      explanation text NOT NULL,
      correlation_id uuid NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      before_state jsonb,
      after_state jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_catalog_operation_audit_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_catalog_operation_audit_operation CHECK (
        operation IN ('CREATE', 'VERSION', 'CLOSE', 'CAPACITY_CHANGE')
      )
    );
    CREATE INDEX ix_catalog_operation_audit_item_created
      ON catalog_operation_audit (catalog_item_id, created_at DESC);
    CREATE INDEX ix_catalog_operation_audit_correlation
      ON catalog_operation_audit (correlation_id);
  `,
  down: `
    DROP TABLE catalog_operation_audit;
  `,
};
