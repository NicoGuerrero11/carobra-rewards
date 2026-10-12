import type { Migration } from "../migration.js";
export const bondaPoints: Migration = {
  id: "029_bonda_points",
  up: `
    CREATE TABLE bonda_point_credits (
      ledger_entry_id uuid PRIMARY KEY REFERENCES ledger_entries(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      points bigint NOT NULL CHECK (points > 0),
      state varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','VERIFICATION_REQUIRED','CONFIRMED','ACTION_REQUIRED')),
      reason varchar(48), next_attempt_at timestamptz NOT NULL DEFAULT now(),
      lease_token uuid, lease_until timestamptz, operation_id uuid,
      microsite_id varchar(200), source_wallet_id varchar(20), affiliate_wallet_id varchar(20), rewards_id varchar(9),
      movement_id varchar(20), created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
      CHECK (state NOT IN ('VERIFICATION_REQUIRED','CONFIRMED') OR
        (operation_id IS NOT NULL AND microsite_id IS NOT NULL AND source_wallet_id IS NOT NULL AND affiliate_wallet_id IS NOT NULL AND rewards_id IS NOT NULL)),
      CHECK (state <> 'CONFIRMED' OR (movement_id IS NOT NULL AND confirmed_at IS NOT NULL)),
      UNIQUE (microsite_id, source_wallet_id, movement_id)
    );
    CREATE INDEX ix_bonda_point_credits_due ON bonda_point_credits (next_attempt_at, ledger_entry_id) WHERE state = 'PENDING';
    CREATE INDEX ix_bonda_point_credits_customer ON bonda_point_credits (customer_id, state);
    CREATE TABLE bonda_point_reviews (
      operation_id uuid PRIMARY KEY, ledger_entry_id uuid NOT NULL REFERENCES bonda_point_credits(ledger_entry_id),
      outcome varchar(16) NOT NULL CHECK (outcome IN ('APPLIED','NOT_APPLIED')),
      movement_id varchar(20), reviewer_id uuid NOT NULL, evidence_reference varchar(180) NOT NULL,
      reviewed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE bonda_point_balances (
      customer_id uuid NOT NULL REFERENCES customers(id), microsite_id varchar(200) NOT NULL,
      rewards_id varchar(9) NOT NULL, wallet_id varchar(20) NOT NULL, balance bigint NOT NULL CHECK (balance >= 0),
      observed_at timestamptz NOT NULL, request_started_at timestamptz NOT NULL,
      PRIMARY KEY (customer_id, microsite_id)
    );
    CREATE FUNCTION capture_bonda_point_credit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.entry_type = 'ISSUANCE' AND NEW.points_delta > 0 THEN
        INSERT INTO bonda_point_credits (ledger_entry_id, customer_id, points)
          SELECT NEW.id, customer_id, NEW.points_delta FROM rewards_accounts WHERE id = NEW.account_id
          ON CONFLICT (ledger_entry_id) DO NOTHING;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER bonda_point_award AFTER INSERT ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION capture_bonda_point_credit();
  `,
  down: `DROP TRIGGER bonda_point_award ON ledger_entries; DROP FUNCTION capture_bonda_point_credit();
    DROP TABLE bonda_point_balances; DROP TABLE bonda_point_reviews; DROP TABLE bonda_point_credits;`,
};
