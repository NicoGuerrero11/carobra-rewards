import type { Migration } from "../migration.js";

export const referralInvitationLinks: Migration = {
  id: "014_referral_invitation_links",
  up: `
    CREATE TABLE referral_invitation_links (
      id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES rewards_accounts(id) ON DELETE RESTRICT,
      token varchar(64) NOT NULL,
      status varchar(24) NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      CONSTRAINT uq_referral_invitation_links_account UNIQUE (account_id),
      CONSTRAINT uq_referral_invitation_links_token UNIQUE (token),
      CONSTRAINT ck_referral_invitation_links_token CHECK (
        token ~ '^[A-Za-z0-9_-]{32,64}$'
      ),
      CONSTRAINT ck_referral_invitation_links_status CHECK (
        status IN ('ACTIVE', 'REVOKED')
      )
    );
    CREATE INDEX ix_referral_invitation_links_active_token
      ON referral_invitation_links (token)
      WHERE status = 'ACTIVE';
  `,
  down: `
    DROP TABLE referral_invitation_links;
  `,
};
