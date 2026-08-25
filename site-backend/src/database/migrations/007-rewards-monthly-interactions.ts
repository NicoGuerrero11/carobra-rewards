import type { Migration } from "../migration.js";

export const rewardsMonthlyInteractions: Migration = {
  id: "007_rewards_monthly_interactions",
  up: `
    CREATE TABLE monthly_interactions (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      rule_version_id uuid NOT NULL REFERENCES behavior_rule_versions(id) ON DELETE RESTRICT,
      business_month char(7) NOT NULL,
      business_timezone varchar(80) NOT NULL,
      action_code varchar(80) NOT NULL,
      source varchar(24) NOT NULL,
      source_id varchar(180) NOT NULL,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT ck_monthly_interactions_month CHECK (business_month ~ '^[0-9]{4}-[0-9]{2}$'),
      CONSTRAINT ck_monthly_interactions_chronology CHECK (received_at >= occurred_at),
      CONSTRAINT uq_monthly_interactions_source UNIQUE (source, source_id),
      CONSTRAINT uq_monthly_interactions_account_rule_month UNIQUE (
        account_id, rule_version_id, business_month
      )
    );
    CREATE INDEX ix_monthly_interactions_customer_month
      ON monthly_interactions (customer_id, business_month);
  `,
  down: `
    DROP TABLE monthly_interactions;
  `,
};
