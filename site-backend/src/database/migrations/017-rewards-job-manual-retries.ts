import type { Migration } from "../migration.js";

export const rewardsJobManualRetries: Migration = {
  id: "017_rewards_job_manual_retries",
  up: `
    CREATE TABLE rewards_job_manual_retries (
      id uuid PRIMARY KEY,
      job_id uuid NOT NULL REFERENCES scheduled_rewards_jobs(id) ON DELETE RESTRICT,
      actor_id varchar(120) NOT NULL,
      reason_code varchar(80) NOT NULL,
      explanation text NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      status_before varchar(24) NOT NULL,
      status_after varchar(24) NOT NULL,
      requested_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_job_manual_retries_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_rewards_job_manual_retry_transition CHECK (
        status_before = 'FAILED' AND status_after = 'PENDING'
      ),
      CONSTRAINT ck_rewards_job_manual_retry_audit CHECK (
        length(trim(actor_id)) > 0 AND length(trim(reason_code)) > 0
          AND length(trim(explanation)) > 0
      )
    );
    CREATE INDEX ix_rewards_job_manual_retries_job_requested
      ON rewards_job_manual_retries (job_id, requested_at DESC);
  `,
  down: `
    DROP TABLE rewards_job_manual_retries;
  `,
};
