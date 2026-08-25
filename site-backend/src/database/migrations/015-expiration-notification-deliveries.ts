import type { Migration } from "../migration.js";

export const expirationNotificationDeliveries: Migration = {
  id: "015_expiration_notification_deliveries",
  up: `
    CREATE TABLE expiration_notification_deliveries (
      id uuid PRIMARY KEY,
      job_id uuid NOT NULL REFERENCES scheduled_rewards_jobs(id) ON DELETE RESTRICT,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      cohort_expires_at timestamptz NOT NULL,
      window_days integer NOT NULL,
      status varchar(24) NOT NULL,
      idempotency_key varchar(220) NOT NULL,
      safe_outcome_code varchar(80),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      delivered_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_expiration_notification_delivery_job UNIQUE (job_id),
      CONSTRAINT uq_expiration_notification_delivery_key UNIQUE (idempotency_key),
      CONSTRAINT ck_expiration_notification_window CHECK (window_days IN (60, 30)),
      CONSTRAINT ck_expiration_notification_status CHECK (
        status IN ('PENDING', 'DELIVERED', 'SKIPPED', 'FAILED')
      ),
      CONSTRAINT ck_expiration_notification_outcome CHECK (
        (status = 'PENDING' AND safe_outcome_code IS NULL AND delivered_at IS NULL) OR
        (status = 'DELIVERED' AND safe_outcome_code IS NOT NULL AND delivered_at IS NOT NULL) OR
        (status = 'SKIPPED' AND safe_outcome_code IS NOT NULL AND delivered_at IS NULL) OR
        (status = 'FAILED' AND safe_outcome_code IS NOT NULL AND delivered_at IS NULL)
      )
    );
    CREATE INDEX ix_expiration_notification_deliveries_account_cohort
      ON expiration_notification_deliveries (account_id, cohort_expires_at, window_days);
  `,
  down: `
    DROP TABLE expiration_notification_deliveries;
  `,
};
