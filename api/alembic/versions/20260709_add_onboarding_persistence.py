"""add customer onboarding persistence

Revision ID: 20260709_onboarding_persistence
Revises: 20260709_sisca_validation
Create Date: 2026-07-09 21:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260709_onboarding_persistence"
down_revision = "20260709_sisca_validation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("password_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "email = lower(btrim(email))",
            name="ck_auth_users_email_normalized",
        ),
        sa.UniqueConstraint("email", name="uq_auth_users_email"),
    )

    op.add_column(
        "customers",
        sa.Column("auth_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("customers", sa.Column("first_name", sa.String(length=100), nullable=True))
    op.add_column("customers", sa.Column("last_name", sa.String(length=200), nullable=True))
    op.add_column("customers", sa.Column("state", sa.String(length=100), nullable=True))
    op.add_column("customers", sa.Column("city", sa.String(length=100), nullable=True))

    # Existing rows predate Rewards registration. Preserve their display name and
    # use empty contact/location values instead of manufacturing auth identities.
    op.execute(
        sa.text(
            """
            UPDATE customers
            SET first_name = COALESCE(NULLIF(btrim(name), ''), 'Legacy'),
                last_name = '',
                phone = COALESCE(phone, ''),
                postal_code = COALESCE(postal_code, ''),
                state = '',
                city = ''
            """
        )
    )

    op.alter_column("customers", "first_name", existing_type=sa.String(100), nullable=False)
    op.alter_column("customers", "last_name", existing_type=sa.String(200), nullable=False)
    op.alter_column("customers", "phone", existing_type=sa.String(32), nullable=False)
    op.alter_column("customers", "postal_code", existing_type=sa.String(16), nullable=False)
    op.alter_column("customers", "state", existing_type=sa.String(100), nullable=False)
    op.alter_column("customers", "city", existing_type=sa.String(100), nullable=False)

    op.create_foreign_key(
        "fk_customers_auth_user_id_auth_users",
        "customers",
        "auth_users",
        ["auth_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint("uq_customers_auth_user_id", "customers", ["auth_user_id"])

    op.drop_constraint("uq_customers_nss", "customers", type_="unique")
    op.drop_column("customers", "nss")
    op.drop_column("customers", "name")

    op.create_table(
        "customer_consents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("consent_type", sa.String(length=50), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("terms_version", sa.String(length=64), nullable=False),
        sa.Column("audit_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_consents_customer_id_customers",
        ),
        sa.UniqueConstraint(
            "customer_id",
            "consent_type",
            "terms_version",
            name="uq_customer_consents_customer_type_version",
        ),
    )


def downgrade() -> None:
    op.drop_table("customer_consents")

    op.add_column("customers", sa.Column("name", sa.String(length=200), nullable=True))
    op.add_column("customers", sa.Column("nss", sa.String(length=16), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE customers
            SET name = LEFT(
                    concat_ws(' ', NULLIF(first_name, ''), NULLIF(last_name, '')),
                    200
                ),
                nss = 'LEGACY' || LEFT(replace(id::text, '-', ''), 10)
            """
        )
    )
    op.alter_column("customers", "name", existing_type=sa.String(200), nullable=False)
    op.alter_column("customers", "nss", existing_type=sa.String(16), nullable=False)
    op.create_unique_constraint("uq_customers_nss", "customers", ["nss"])

    op.drop_constraint("uq_customers_auth_user_id", "customers", type_="unique")
    op.drop_constraint(
        "fk_customers_auth_user_id_auth_users",
        "customers",
        type_="foreignkey",
    )
    op.drop_column("customers", "auth_user_id")
    op.drop_column("customers", "city")
    op.drop_column("customers", "state")
    op.drop_column("customers", "last_name")
    op.drop_column("customers", "first_name")
    op.alter_column("customers", "postal_code", existing_type=sa.String(16), nullable=True)
    op.alter_column("customers", "phone", existing_type=sa.String(32), nullable=True)

    op.drop_table("auth_users")
