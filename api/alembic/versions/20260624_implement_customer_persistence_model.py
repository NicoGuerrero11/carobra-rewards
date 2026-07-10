"""implement customer persistence model

Revision ID: 20260624_customer_persistence
Revises:
Create Date: 2026-06-24 13:45:00
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260624_customer_persistence"
down_revision = None
branch_labels = None
depends_on = None

AFORE_SERVICE_ID = UUID("00000000-0000-0000-0000-00000000af01")


def _utc_now() -> datetime:
    return datetime.now(UTC)


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("rewards_id", sa.String(length=64), nullable=False),
        sa.Column("curp", sa.String(length=18), nullable=False),
        sa.Column("nss", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("postal_code", sa.String(length=16), nullable=True),
        sa.Column("customer_status", sa.String(length=32), nullable=False),
        sa.Column("onboarding_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("rewards_id", name="uq_customers_rewards_id"),
        sa.UniqueConstraint("curp", name="uq_customers_curp"),
    )
    op.create_table(
        "services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("code", name="uq_services_code"),
    )
    op.create_table(
        "customer_intake_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("external_request_id", sa.String(length=120), nullable=False),
        sa.Column("curp", sa.String(length=18), nullable=False),
        sa.Column("processing_status", sa.String(length=32), nullable=False),
        sa.Column("processing_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("original_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="RESTRICT",
            name="fk_intake_customer_id_customers",
        ),
        sa.UniqueConstraint("source", "external_request_id", name="uq_intake_source_external"),
    )
    op.create_index(
        "ix_intake_customer_id",
        "customer_intake_requests",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        "ix_intake_processing_status",
        "customer_intake_requests",
        ["processing_status"],
        unique=False,
    )
    op.create_table(
        "customer_services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="RESTRICT",
            name="fk_customer_services_customer_id_customers",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            ondelete="RESTRICT",
            name="fk_customer_services_service_id_services",
        ),
        sa.UniqueConstraint("customer_id", "service_id", name="uq_customer_service_pair"),
    )
    op.create_index(
        "ix_customer_services_service_id",
        "customer_services",
        ["service_id"],
        unique=False,
    )

    now = _utc_now()
    services = sa.table(
        "services",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String(length=32)),
        sa.column("name", sa.String(length=100)),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        services,
        [
            {
                "id": AFORE_SERVICE_ID,
                "code": "AFORE",
                "name": "AFORE",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_customer_services_service_id", table_name="customer_services")
    op.drop_table("customer_services")
    op.drop_index("ix_intake_processing_status", table_name="customer_intake_requests")
    op.drop_index("ix_intake_customer_id", table_name="customer_intake_requests")
    op.drop_table("customer_intake_requests")
    op.execute(sa.text("DELETE FROM services WHERE code = 'AFORE'"))
    op.drop_table("services")
    op.drop_table("customers")
