import type { Migration } from "../migration.js";

const v2EffectiveFrom = "2026-08-24 00:00:00+00";

export const rewardsV2Foundation: Migration = {
  id: "018_rewards_v2_foundation",
  up: `
    CREATE TABLE rewards_v2_rule_versions (
      id uuid PRIMARY KEY,
      rule_type varchar(40) NOT NULL,
      code varchar(100) NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      enabled boolean NOT NULL,
      approved_for_production boolean NOT NULL DEFAULT false,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_from timestamptz NOT NULL,
      effective_to timestamptz,
      disabled_reason text,
      approved_at timestamptz,
      approved_by varchar(120),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_v2_rule_versions_code_version UNIQUE (code, version),
      CONSTRAINT ck_rewards_v2_rule_versions_type CHECK (
        rule_type IN ('POINT_AWARD', 'LEVEL_RULE', 'PRODUCT_EVIDENCE', 'FEATURE_FLAG')
      ),
      CONSTRAINT ck_rewards_v2_rule_versions_settings CHECK (
        jsonb_typeof(settings) = 'object'
      ),
      CONSTRAINT ck_rewards_v2_rule_versions_interval CHECK (
        effective_to IS NULL OR effective_to > effective_from
      ),
      CONSTRAINT ck_rewards_v2_rule_versions_disabled_reason CHECK (
        enabled OR disabled_reason IS NOT NULL
      ),
      CONSTRAINT ck_rewards_v2_rule_versions_production_approval CHECK (
        NOT approved_for_production OR (
          enabled AND approved_at IS NOT NULL AND approved_by IS NOT NULL
        )
      )
    );
    CREATE INDEX ix_rewards_v2_rule_versions_effective
      ON rewards_v2_rule_versions (code, enabled, effective_from, effective_to);

    CREATE TABLE rewards_v2_journeys (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      state varchar(24) NOT NULL,
      current_level varchar(24),
      redemption_eligible boolean NOT NULL DEFAULT false,
      registered_at timestamptz NOT NULL,
      last_evaluated_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_v2_journeys_account UNIQUE (account_id),
      CONSTRAINT uq_rewards_v2_journeys_customer UNIQUE (customer_id),
      CONSTRAINT ck_rewards_v2_journeys_state CHECK (
        state IN ('INVITED', 'ACTIVE', 'INACTIVE', 'BLOCKED')
      ),
      CONSTRAINT ck_rewards_v2_journeys_level CHECK (
        current_level IS NULL OR current_level IN (
          'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'TITANIUM'
        )
      ),
      CONSTRAINT ck_rewards_v2_journeys_redemption CHECK (
        NOT redemption_eligible OR state = 'ACTIVE'
      )
    );
    CREATE INDEX ix_rewards_v2_journeys_state_level
      ON rewards_v2_journeys (state, current_level);

    CREATE TABLE rewards_product_facts (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      provider varchar(40) NOT NULL,
      product_type varchar(80) NOT NULL,
      external_reference varchar(180),
      status varchar(24) NOT NULL,
      source varchar(40) NOT NULL,
      source_id varchar(180) NOT NULL,
      safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      signed_at timestamptz,
      accepted_at timestamptz,
      activated_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_product_facts_source UNIQUE (source, source_id),
      CONSTRAINT ck_rewards_product_facts_status CHECK (
        status IN ('SIGNED', 'PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'ENDED')
      ),
      CONSTRAINT ck_rewards_product_facts_evidence CHECK (
        jsonb_typeof(safe_evidence) = 'object'
      ),
      CONSTRAINT ck_rewards_product_facts_active_evidence CHECK (
        status <> 'ACTIVE' OR (accepted_at IS NOT NULL AND activated_at IS NOT NULL)
      ),
      CONSTRAINT ck_rewards_product_facts_chronology CHECK (
        (accepted_at IS NULL OR signed_at IS NULL OR accepted_at >= signed_at) AND
        (activated_at IS NULL OR accepted_at IS NULL OR activated_at >= accepted_at) AND
        (ended_at IS NULL OR activated_at IS NULL OR ended_at >= activated_at)
      )
    );
    CREATE UNIQUE INDEX uq_rewards_product_facts_external_identity
      ON rewards_product_facts (provider, external_reference)
      WHERE external_reference IS NOT NULL;
    CREATE INDEX ix_rewards_product_facts_customer_status
      ON rewards_product_facts (customer_id, status, activated_at);
    CREATE INDEX ix_rewards_product_facts_account_status
      ON rewards_product_facts (account_id, status);

    CREATE TABLE rewards_product_fact_events (
      id uuid PRIMARY KEY,
      product_fact_id uuid NOT NULL REFERENCES rewards_product_facts(id) ON DELETE RESTRICT,
      from_status varchar(24),
      to_status varchar(24) NOT NULL,
      source varchar(40) NOT NULL,
      source_id varchar(180) NOT NULL,
      safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_product_fact_events_source UNIQUE (source, source_id),
      CONSTRAINT ck_rewards_product_fact_events_from_status CHECK (
        from_status IS NULL OR from_status IN (
          'SIGNED', 'PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'ENDED'
        )
      ),
      CONSTRAINT ck_rewards_product_fact_events_to_status CHECK (
        to_status IN ('SIGNED', 'PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'ENDED')
      ),
      CONSTRAINT ck_rewards_product_fact_events_evidence CHECK (
        jsonb_typeof(safe_evidence) = 'object'
      ),
      CONSTRAINT ck_rewards_product_fact_events_chronology CHECK (
        received_at >= occurred_at
      )
    );
    CREATE INDEX ix_rewards_product_fact_events_fact_occurred
      ON rewards_product_fact_events (product_fact_id, occurred_at DESC);

    CREATE TABLE rewards_profile_activities (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      activity_type varchar(80) NOT NULL,
      source varchar(40) NOT NULL,
      source_id varchar(180) NOT NULL,
      qualifies boolean NOT NULL DEFAULT false,
      rule_version_id uuid REFERENCES rewards_v2_rule_versions(id) ON DELETE RESTRICT,
      safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_profile_activities_source UNIQUE (source, source_id),
      CONSTRAINT ck_rewards_profile_activities_metadata CHECK (
        jsonb_typeof(safe_metadata) = 'object'
      ),
      CONSTRAINT ck_rewards_profile_activities_chronology CHECK (
        received_at >= occurred_at
      ),
      CONSTRAINT ck_rewards_profile_activities_qualification CHECK (
        NOT qualifies OR rule_version_id IS NOT NULL
      )
    );
    CREATE INDEX ix_rewards_profile_activities_customer_occurred
      ON rewards_profile_activities (customer_id, occurred_at DESC);
    CREATE INDEX ix_rewards_profile_activities_progress
      ON rewards_profile_activities (account_id, qualifies, activity_type, occurred_at);

    CREATE TABLE rewards_level_decisions (
      id uuid PRIMARY KEY,
      journey_id uuid NOT NULL REFERENCES rewards_v2_journeys(id) ON DELETE RESTRICT,
      rule_version_id uuid NOT NULL REFERENCES rewards_v2_rule_versions(id) ON DELETE RESTRICT,
      previous_level varchar(24),
      resulting_level varchar(24),
      trigger_type varchar(40) NOT NULL,
      trigger_id varchar(180) NOT NULL,
      decision_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
      reason_code varchar(100) NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      decided_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_level_decisions_idempotency UNIQUE (idempotency_key),
      CONSTRAINT ck_rewards_level_decisions_previous_level CHECK (
        previous_level IS NULL OR previous_level IN (
          'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'TITANIUM'
        )
      ),
      CONSTRAINT ck_rewards_level_decisions_resulting_level CHECK (
        resulting_level IS NULL OR resulting_level IN (
          'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'TITANIUM'
        )
      ),
      CONSTRAINT ck_rewards_level_decisions_inputs CHECK (
        jsonb_typeof(decision_inputs) = 'object'
      )
    );
    CREATE INDEX ix_rewards_level_decisions_journey_decided
      ON rewards_level_decisions (journey_id, decided_at DESC);

    INSERT INTO rewards_v2_rule_versions (
      id, rule_type, code, version, enabled, approved_for_production,
      settings, effective_from, effective_to, disabled_reason,
      approved_at, approved_by, created_at, updated_at
    ) VALUES
      ('00000000-0000-4000-8000-000000001801', 'POINT_AWARD',
       'V2_INVITED_REGISTRATION', 1, true, false,
       '{"points":45,"activationScope":"INTERNAL_TEST_ONLY","testValidityMonths":18,"productionValidityMonths":null}',
       '${v2EffectiveFrom}', NULL, NULL, NULL, NULL,
       '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001802', 'POINT_AWARD',
       'V2_INITIAL_PRODUCT_ACTIVE', 1, true, false,
       '{"points":105,"activationScope":"INTERNAL_TEST_ONLY","testValidityMonths":18,"productionValidityMonths":null,"requiredStatus":"ACTIVE"}',
       '${v2EffectiveFrom}', NULL, NULL, NULL, NULL,
       '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001803', 'LEVEL_RULE',
       'V2_LEVEL_PRECEDENCE', 1, false, false,
       '{"candidate":{"BRONZE":1,"GOLD":2,"PLATINUM":3,"TITANIUM":4}}',
       '${v2EffectiveFrom}', NULL,
       'The final level precedence and degradation matrix require team approval.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001804', 'LEVEL_RULE',
       'V2_SILVER_PROFILE_THRESHOLD', 1, false, false,
       '{"minimumRegistrationMonths":6,"qualifyingActivityCount":null,"window":null}',
       '${v2EffectiveFrom}', NULL,
       'Qualifying activity types, count, and window for Silver require team approval.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001805', 'PRODUCT_EVIDENCE',
       'V2_SISCA_AFORE_ACTIVE', 1, true, false,
       '{"provider":"SISCA","productType":"AFORE","requiredStatus":"ACTIVE","activationScope":"INTERNAL_TEST_ONLY"}',
       '${v2EffectiveFrom}', NULL, NULL, NULL, NULL,
       '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001806', 'FEATURE_FLAG',
       'V2_REDEMPTION', 1, false, false, '{}', '${v2EffectiveFrom}', NULL,
       'Bonda, catalog, fulfillment, and point validity are not approved.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001807', 'FEATURE_FLAG',
       'V2_EXPIRY', 1, false, false, '{}', '${v2EffectiveFrom}', NULL,
       'The 12-month or 18-month point validity policy is not approved.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001808', 'FEATURE_FLAG',
       'V2_AVE', 1, false, false, '{}', '${v2EffectiveFrom}', NULL,
       'AVE scope and evidence source are not approved for V2.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001809', 'FEATURE_FLAG',
       'V2_REFERRALS', 1, false, false, '{}', '${v2EffectiveFrom}', NULL,
       'Referral attribution, sales events, and gift-card policy are not approved.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001810', 'FEATURE_FLAG',
       'V2_RENEWALS', 1, false, false, '{}', '${v2EffectiveFrom}', NULL,
       'Qualitas renewal and Skandia continuation policies are not approved.',
       NULL, NULL, '${v2EffectiveFrom}', '${v2EffectiveFrom}'),
      ('00000000-0000-4000-8000-000000001811', 'FEATURE_FLAG',
       'V2_TEST_MODE', 1, true, false,
       '{"requiresNonProductionEnvironment":true,"requiresAuthorization":true}',
       '${v2EffectiveFrom}', NULL, NULL, NULL, NULL,
       '${v2EffectiveFrom}', '${v2EffectiveFrom}')
    ON CONFLICT (code, version) DO NOTHING;
  `,
  down: `
    DROP TABLE rewards_level_decisions;
    DROP TABLE rewards_profile_activities;
    DROP TABLE rewards_product_fact_events;
    DROP TABLE rewards_product_facts;
    DROP TABLE rewards_v2_journeys;
    DROP TABLE rewards_v2_rule_versions;
  `,
};
