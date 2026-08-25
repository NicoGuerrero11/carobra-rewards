import type { Migration } from "../migration.js";

export const rewardsCustomerPortal: Migration = {
  id: "020_rewards_customer_portal",
  up: `
    CREATE TABLE rewards_customer_preferences (
      customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
      activity_updates boolean NOT NULL DEFAULT true,
      learning_updates boolean NOT NULL DEFAULT true,
      product_updates boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL
    );

    CREATE TABLE rewards_notification_reads (
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      notification_id varchar(220) NOT NULL,
      read_at timestamptz NOT NULL,
      PRIMARY KEY (customer_id, notification_id),
      CONSTRAINT ck_rewards_notification_reads_id CHECK (length(trim(notification_id)) BETWEEN 1 AND 220)
    );

    CREATE TABLE rewards_customer_actions (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      action_code varchar(100) NOT NULL,
      action_type varchar(24) NOT NULL,
      title varchar(160) NOT NULL,
      description varchar(500) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'PENDING',
      href varchar(240),
      approved_points bigint,
      assigned_at timestamptz NOT NULL,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_customer_actions_code UNIQUE (customer_id, action_code),
      CONSTRAINT ck_rewards_customer_actions_type CHECK (
        action_type IN ('QUESTIONNAIRE', 'CONTENT', 'DOCUMENT', 'LEARNING', 'SUPPORT')
      ),
      CONSTRAINT ck_rewards_customer_actions_status CHECK (
        status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED')
      ),
      CONSTRAINT ck_rewards_customer_actions_points CHECK (approved_points IS NULL OR approved_points >= 0),
      CONSTRAINT ck_rewards_customer_actions_completion CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL) OR status <> 'COMPLETED'
      )
    );
    CREATE INDEX ix_rewards_customer_actions_pending
      ON rewards_customer_actions (customer_id, status, assigned_at DESC);

    CREATE TABLE rewards_learning_assignments (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      course_code varchar(100) NOT NULL,
      title varchar(160) NOT NULL,
      description varchar(500) NOT NULL,
      category varchar(80) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'ASSIGNED',
      progress smallint NOT NULL DEFAULT 0,
      qualifies boolean NOT NULL DEFAULT false,
      assigned_at timestamptz NOT NULL,
      last_activity_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_learning_assignment UNIQUE (customer_id, course_code),
      CONSTRAINT ck_rewards_learning_status CHECK (
        status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED')
      ),
      CONSTRAINT ck_rewards_learning_progress CHECK (progress BETWEEN 0 AND 100),
      CONSTRAINT ck_rewards_learning_completion CHECK (
        (status = 'COMPLETED' AND progress = 100 AND completed_at IS NOT NULL)
        OR status <> 'COMPLETED'
      )
    );
    CREATE INDEX ix_rewards_learning_customer_status
      ON rewards_learning_assignments (customer_id, status, assigned_at DESC);

    CREATE TABLE rewards_document_requests (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      request_code varchar(100) NOT NULL,
      title varchar(160) NOT NULL,
      purpose varchar(500) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'REQUESTED',
      accepted_mime_types text[] NOT NULL,
      max_size_bytes integer NOT NULL,
      upload_enabled boolean NOT NULL DEFAULT false,
      submitted_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_rewards_document_request UNIQUE (customer_id, request_code),
      CONSTRAINT ck_rewards_document_request_status CHECK (
        status IN ('REQUESTED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED')
      ),
      CONSTRAINT ck_rewards_document_request_size CHECK (
        max_size_bytes BETWEEN 1 AND 20971520
      ),
      CONSTRAINT ck_rewards_document_request_mime CHECK (
        cardinality(accepted_mime_types) BETWEEN 1 AND 10
      )
    );
    CREATE INDEX ix_rewards_document_requests_customer_status
      ON rewards_document_requests (customer_id, status, created_at DESC);
  `,
  down: `
    DROP TABLE rewards_document_requests;
    DROP TABLE rewards_learning_assignments;
    DROP TABLE rewards_customer_actions;
    DROP TABLE rewards_notification_reads;
    DROP TABLE rewards_customer_preferences;
  `,
};
