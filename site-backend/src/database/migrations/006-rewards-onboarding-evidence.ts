import type { Migration } from "../migration.js";

export const rewardsOnboardingEvidence: Migration = {
  id: "006_rewards_onboarding_evidence",
  up: `
    CREATE TABLE onboarding_evidence (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      onboarding_instance_id varchar(100) NOT NULL,
      evidence_type varchar(24) NOT NULL,
      evidence_version varchar(80) NOT NULL,
      source varchar(24) NOT NULL,
      source_id varchar(180) NOT NULL,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT ck_onboarding_evidence_type CHECK (
        evidence_type IN ('CONFIRMATION', 'VIDEO', 'SURVEY')
      ),
      CONSTRAINT ck_onboarding_evidence_chronology CHECK (received_at >= occurred_at),
      CONSTRAINT uq_onboarding_evidence_source UNIQUE (source, source_id),
      CONSTRAINT uq_onboarding_evidence_instance_type UNIQUE (
        account_id, onboarding_instance_id, evidence_type
      )
    );
    CREATE INDEX ix_onboarding_evidence_progress
      ON onboarding_evidence (account_id, onboarding_instance_id, occurred_at);
  `,
  down: `
    DROP TABLE onboarding_evidence;
  `,
};
