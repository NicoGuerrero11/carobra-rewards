import type { Migration } from "../migration.js";

export const rewardsVerifiedBirthDates: Migration = {
  id: "008_rewards_verified_birth_dates",
  up: `
    CREATE TABLE verified_birth_dates (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      birth_date date NOT NULL,
      source varchar(80) NOT NULL,
      source_id varchar(180) NOT NULL,
      source_version varchar(80) NOT NULL,
      verified_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_verified_birth_dates_account UNIQUE (account_id),
      CONSTRAINT uq_verified_birth_dates_source UNIQUE (source, source_id),
      CONSTRAINT ck_verified_birth_dates_reasonable CHECK (
        birth_date >= DATE '1900-01-01' AND birth_date <= verified_at::date
      )
    );
    CREATE INDEX ix_verified_birth_dates_customer ON verified_birth_dates (customer_id);
  `,
  down: `
    DROP TABLE verified_birth_dates;
  `,
};
