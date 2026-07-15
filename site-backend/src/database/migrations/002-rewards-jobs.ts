import type { Migration } from "../migration.js";

export const rewardsJobFoundation: Migration = {
  id: "002_rewards_jobs",
  up: `
    CREATE TABLE scheduled_rewards_jobs (
      id uuid PRIMARY KEY,
      job_type varchar(80) NOT NULL,
      business_key varchar(220) NOT NULL,
      due_at timestamptz NOT NULL,
      status varchar(24) NOT NULL,
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      locked_at timestamptz,
      locked_by varchar(120),
      completed_at timestamptz,
      safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_jobs_business_key UNIQUE (job_type, business_key)
    );
    CREATE INDEX ix_rewards_jobs_due ON scheduled_rewards_jobs (status, due_at);

    CREATE TABLE rewards_job_executions (
      id uuid PRIMARY KEY,
      job_id uuid NOT NULL REFERENCES scheduled_rewards_jobs(id) ON DELETE RESTRICT,
      attempt_number integer NOT NULL CHECK (attempt_number > 0),
      status varchar(24) NOT NULL,
      worker_id varchar(120) NOT NULL,
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      safe_error_code varchar(80),
      CONSTRAINT uq_rewards_job_execution_attempt UNIQUE (job_id, attempt_number)
    );
    CREATE INDEX ix_rewards_job_executions_started ON rewards_job_executions (started_at);
  `,
  down: `
    DROP TABLE rewards_job_executions;
    DROP TABLE scheduled_rewards_jobs;
  `,
};
