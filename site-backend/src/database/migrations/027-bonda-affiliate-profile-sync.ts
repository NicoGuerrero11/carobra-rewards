import type { Migration } from "../migration.js";

export const bondaAffiliateProfileSync: Migration = {
  id: "027_bonda_affiliate_profile_sync",
  up: `
    CREATE TABLE bonda_profile_sync_controls (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      capture_enabled boolean NOT NULL DEFAULT false
    );
    INSERT INTO bonda_profile_sync_controls (singleton) VALUES (true);

    CREATE TABLE bonda_profile_sync_queue (
      customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
      generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
      processed_generation bigint NOT NULL DEFAULT 0 CHECK (processed_generation >= 0 AND processed_generation <= generation),
      last_status varchar(48),
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_bonda_profile_sync_due ON bonda_profile_sync_queue (next_attempt_at, customer_id)
      WHERE generation > processed_generation;

    CREATE TABLE bonda_profile_sync_checkpoints (
      customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
      rewards_id varchar(9) CHECK (rewards_id ~ '^[1-9][0-9]{8}$'),
      status varchar(32) CHECK (status IN ('SYNCHRONIZED','VERIFICATION_REQUIRED','ACTION_REQUIRED','RETRY_APPROVED')),
      field_digests jsonb NOT NULL DEFAULT '{}'::jsonb,
      operation_id uuid,
      lease_token uuid,
      lease_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status IS NULL AND rewards_id IS NULL AND operation_id IS NULL)
        OR (status IS NOT NULL AND rewards_id IS NOT NULL AND operation_id IS NOT NULL)),
      CHECK (status IS NULL OR status = 'RETRY_APPROVED' OR field_digests ?& ARRAY['email','nombre','apellido','curp']),
      CHECK (jsonb_typeof(field_digests) = 'object'
        AND field_digests - ARRAY['email','nombre','apellido','curp'] = '{}'::jsonb
        AND octet_length(field_digests::text) <= 1024
        AND (NOT field_digests ? 'email' OR COALESCE(jsonb_typeof(field_digests->'email') = 'string' AND field_digests->>'email' ~ '^[a-f0-9]{64}$', false))
        AND (NOT field_digests ? 'nombre' OR COALESCE(jsonb_typeof(field_digests->'nombre') = 'string' AND field_digests->>'nombre' ~ '^[a-f0-9]{64}$', false))
        AND (NOT field_digests ? 'apellido' OR COALESCE(jsonb_typeof(field_digests->'apellido') = 'string' AND field_digests->>'apellido' ~ '^[a-f0-9]{64}$', false))
        AND (NOT field_digests ? 'curp' OR COALESCE(jsonb_typeof(field_digests->'curp') = 'string' AND field_digests->>'curp' ~ '^[a-f0-9]{64}$', false)))
    );
    CREATE TABLE bonda_profile_sync_reviews (
      operation_id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      outcome varchar(16) NOT NULL CHECK (outcome IN ('APPLIED','NOT_APPLIED')),
      evidence_reference varchar(180) NOT NULL,
      reviewer_id uuid NOT NULL,
      reviewed_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE FUNCTION enqueue_bonda_profile_sync() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE subject_id uuid;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM bonda_profile_sync_controls WHERE capture_enabled) THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME = 'customers' THEN
        IF TG_OP = 'UPDATE' AND
          (to_jsonb(NEW) - ARRAY['updated_at','last_login_at']) = (to_jsonb(OLD) - ARRAY['updated_at','last_login_at'])
          THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND
          jsonb_build_array(NEW.rewards_id, NEW.curp, NEW.email, NEW.first_name, NEW.last_name, NEW.customer_status)
          IS NOT DISTINCT FROM
          jsonb_build_array(OLD.rewards_id, OLD.curp, OLD.email, OLD.first_name, OLD.last_name, OLD.customer_status)
          THEN RETURN NEW; END IF;
        subject_id := NEW.id;
      ELSIF TG_TABLE_NAME = 'rewards_v2_journeys' THEN
        IF TG_OP = 'UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state
          AND NEW.current_level IS NOT DISTINCT FROM OLD.current_level THEN RETURN NEW; END IF;
        subject_id := NEW.customer_id;
      ELSE
        IF NEW.state <> 'ACTIVE' THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state
          AND NEW.rewards_id IS NOT DISTINCT FROM OLD.rewards_id THEN RETURN NEW; END IF;
        subject_id := NEW.customer_id;
      END IF;
      INSERT INTO bonda_profile_sync_queue (customer_id) VALUES (subject_id)
      ON CONFLICT (customer_id) DO UPDATE SET generation = bonda_profile_sync_queue.generation + 1,
        next_attempt_at = now(), updated_at = now();
      RETURN NEW;
    END $$;
    CREATE TRIGGER bonda_profile_customer_event AFTER INSERT OR UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION enqueue_bonda_profile_sync();
    CREATE TRIGGER bonda_profile_journey_event AFTER INSERT OR UPDATE ON rewards_v2_journeys
      FOR EACH ROW EXECUTE FUNCTION enqueue_bonda_profile_sync();
    CREATE TRIGGER bonda_profile_affiliate_event AFTER INSERT OR UPDATE ON bonda_affiliate_provisioning
      FOR EACH ROW EXECUTE FUNCTION enqueue_bonda_profile_sync();
  `,
  down: `
    DROP TRIGGER bonda_profile_affiliate_event ON bonda_affiliate_provisioning;
    DROP TRIGGER bonda_profile_journey_event ON rewards_v2_journeys;
    DROP TRIGGER bonda_profile_customer_event ON customers;
    DROP FUNCTION enqueue_bonda_profile_sync();
    DROP TABLE bonda_profile_sync_reviews;
    DROP TABLE bonda_profile_sync_checkpoints;
    DROP TABLE bonda_profile_sync_queue;
    DROP TABLE bonda_profile_sync_controls;
  `,
};
