import type { Migration } from "../migration.js";

export const bondaAffiliationEvents: Migration = {
  id: "028_bonda_affiliation_events",
  up: `
    CREATE TABLE bonda_affiliation_event_controls (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      capture_enabled boolean NOT NULL DEFAULT false
    );
    INSERT INTO bonda_affiliation_event_controls (singleton) VALUES (true);
    CREATE TABLE bonda_affiliation_events (
      customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
      generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
      processed_generation bigint NOT NULL DEFAULT 0 CHECK (processed_generation >= 0 AND processed_generation <= generation),
      next_attempt_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_bonda_affiliation_events_due ON bonda_affiliation_events (next_attempt_at, customer_id)
      WHERE generation > processed_generation;
    CREATE FUNCTION enqueue_bonda_affiliation_event() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE subject_id uuid;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM bonda_affiliation_event_controls WHERE capture_enabled) THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME = 'customers' THEN
        IF TG_OP = 'UPDATE' AND NEW.customer_status IS NOT DISTINCT FROM OLD.customer_status
          AND NEW.rewards_id IS NOT DISTINCT FROM OLD.rewards_id THEN RETURN NEW; END IF;
        subject_id := NEW.id;
      ELSE
        IF TG_OP = 'UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state
          AND NEW.current_level IS NOT DISTINCT FROM OLD.current_level THEN RETURN NEW; END IF;
        subject_id := NEW.customer_id;
      END IF;
      INSERT INTO bonda_affiliation_events (customer_id) VALUES (subject_id)
      ON CONFLICT (customer_id) DO UPDATE SET generation = bonda_affiliation_events.generation + 1, next_attempt_at = now();
      RETURN NEW;
    END $$;
    CREATE TRIGGER bonda_affiliation_customer_event AFTER INSERT OR UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION enqueue_bonda_affiliation_event();
    CREATE TRIGGER bonda_affiliation_journey_event AFTER INSERT OR UPDATE ON rewards_v2_journeys
      FOR EACH ROW EXECUTE FUNCTION enqueue_bonda_affiliation_event();
  `,
  down: `
    DROP TRIGGER bonda_affiliation_journey_event ON rewards_v2_journeys;
    DROP TRIGGER bonda_affiliation_customer_event ON customers;
    DROP FUNCTION enqueue_bonda_affiliation_event();
    DROP TABLE bonda_affiliation_events;
    DROP TABLE bonda_affiliation_event_controls;
  `,
};
