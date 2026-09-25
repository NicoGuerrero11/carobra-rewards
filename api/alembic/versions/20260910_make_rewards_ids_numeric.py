"""make Rewards IDs canonical nine-digit values

Revision ID: 20260910_numeric_rewards_ids
Revises: 20260814_sisca_uat_audit
Create Date: 2026-09-10 20:45:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260910_numeric_rewards_ids"
down_revision = "20260814_sisca_uat_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_rewards_id_migrations",
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="RESTRICT"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("previous_rewards_id", sa.String(length=64), nullable=False),
        sa.Column("numeric_rewards_id", sa.String(length=9), nullable=False),
        sa.Column(
            "migrated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "previous_rewards_id",
            name="uq_customer_rewards_id_migrations_previous",
        ),
        sa.UniqueConstraint(
            "numeric_rewards_id",
            name="uq_customer_rewards_id_migrations_numeric",
        ),
        sa.CheckConstraint(
            "numeric_rewards_id ~ '^[1-9][0-9]{8}$'",
            name="ck_customer_rewards_id_migrations_numeric",
        ),
    )

    op.execute(sa.text("LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE"))
    op.execute(
        sa.text(
            r"""
            DO $migration$
            DECLARE
                customer_record record;
                candidate bigint;
                first_candidate bigint;
            BEGIN
                FOR customer_record IN
                    SELECT id, rewards_id
                    FROM customers
                    WHERE rewards_id !~ '^[1-9][0-9]{8}$'
                    ORDER BY id
                LOOP
                    candidate := 100000000 + (
                        ('x' || substr(md5(customer_record.rewards_id), 1, 8))::bit(32)::bigint
                        % 900000000
                    );
                    first_candidate := candidate;

                    LOOP
                        EXIT WHEN NOT EXISTS (
                            SELECT 1 FROM customers WHERE rewards_id = candidate::text
                        ) AND NOT EXISTS (
                            SELECT 1
                            FROM customer_rewards_id_migrations
                            WHERE numeric_rewards_id = candidate::text
                        );
                        candidate := 100000000 + ((candidate - 100000000 + 1) % 900000000);
                        IF candidate = first_candidate THEN
                            RAISE EXCEPTION 'The nine-digit Rewards ID space is exhausted';
                        END IF;
                    END LOOP;

                    INSERT INTO customer_rewards_id_migrations (
                        customer_id, previous_rewards_id, numeric_rewards_id
                    ) VALUES (
                        customer_record.id,
                        customer_record.rewards_id,
                        candidate::text
                    );
                END LOOP;
            END
            $migration$;
            """
        )
    )

    op.execute(
        sa.text(
            r"""
            DO $migration$
            BEGIN
                IF to_regclass('public.bonda_affiliate_provisioning') IS NOT NULL THEN
                    EXECUTE $sql$
                        UPDATE bonda_affiliate_provisioning AS provisioning
                        SET rewards_id = mapping.numeric_rewards_id,
                            updated_at = now()
                        FROM customer_rewards_id_migrations AS mapping
                        WHERE provisioning.customer_id = mapping.customer_id
                    $sql$;
                END IF;
            END
            $migration$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE customers AS customer
            SET rewards_id = mapping.numeric_rewards_id,
                updated_at = now()
            FROM customer_rewards_id_migrations AS mapping
            WHERE customer.id = mapping.customer_id
            """
        )
    )
    op.create_check_constraint(
        "ck_customers_rewards_id_numeric",
        "customers",
        "rewards_id ~ '^[1-9][0-9]{8}$'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_customers_rewards_id_numeric",
        "customers",
        type_="check",
    )
    op.execute(sa.text("LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE"))
    op.execute(
        sa.text(
            r"""
            DO $migration$
            BEGIN
                IF to_regclass('public.bonda_affiliate_provisioning') IS NOT NULL THEN
                    EXECUTE $sql$
                        UPDATE bonda_affiliate_provisioning AS provisioning
                        SET rewards_id = mapping.previous_rewards_id,
                            updated_at = now()
                        FROM customer_rewards_id_migrations AS mapping
                        WHERE provisioning.customer_id = mapping.customer_id
                          AND provisioning.rewards_id = mapping.numeric_rewards_id
                    $sql$;
                END IF;
            END
            $migration$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE customers AS customer
            SET rewards_id = mapping.previous_rewards_id,
                updated_at = now()
            FROM customer_rewards_id_migrations AS mapping
            WHERE customer.id = mapping.customer_id
              AND customer.rewards_id = mapping.numeric_rewards_id
            """
        )
    )
    op.drop_table("customer_rewards_id_migrations")
