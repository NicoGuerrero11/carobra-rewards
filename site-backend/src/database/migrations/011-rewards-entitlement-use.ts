import type { Migration } from "../migration.js";

export const rewardsEntitlementUse: Migration = {
  id: "011_rewards_entitlement_use",
  up: `
    ALTER TABLE entitlements ADD COLUMN use_idempotency_key varchar(200);
    ALTER TABLE entitlements ADD CONSTRAINT uq_entitlements_use_idempotency
      UNIQUE (use_idempotency_key);
    ALTER TABLE entitlements ADD CONSTRAINT ck_entitlements_used_state CHECK (
      (status = 'USED' AND used_at IS NOT NULL AND use_idempotency_key IS NOT NULL) OR
      (status <> 'USED' AND used_at IS NULL AND use_idempotency_key IS NULL)
    );
  `,
  down: `
    ALTER TABLE entitlements DROP CONSTRAINT ck_entitlements_used_state;
    ALTER TABLE entitlements DROP CONSTRAINT uq_entitlements_use_idempotency;
    ALTER TABLE entitlements DROP COLUMN use_idempotency_key;
  `,
};
