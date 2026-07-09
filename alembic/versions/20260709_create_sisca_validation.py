"""create SISCA validation lifecycle tables

Revision ID: 20260709_sisca_validation
Revises: 20260703_unique_customer_nss
Create Date: 2026-07-09 18:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260709_sisca_validation"
down_revision = "20260703_unique_customer_nss"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sisca_validations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("h24_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("d3_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("d5_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_checkpoint", sa.String(length=16), nullable=True),
        sa.Column("next_checkpoint_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_check_outcome", sa.String(length=40), nullable=True),
        sa.Column("last_response_movement_type", sa.String(length=80), nullable=True),
        sa.Column("last_response_sf_status", sa.String(length=80), nullable=True),
        sa.Column("last_response_transfer_date", sa.Date(), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requires_attention_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "team_notification_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("team_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="RESTRICT",
            name="fk_sisca_validations_customer_id",
        ),
        sa.UniqueConstraint("customer_id", name="uq_sisca_validations_customer_id"),
    )
    op.create_index(
        "ix_sisca_validations_due",
        "sisca_validations",
        ["status", "next_checkpoint_at"],
        unique=False,
    )
    op.create_table(
        "sisca_validation_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("validation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("check_type", sa.String(length=16), nullable=False),
        sa.Column("checkpoint", sa.String(length=16), nullable=True),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(length=40), nullable=False),
        sa.Column("raw_movement_type", sa.String(length=80), nullable=True),
        sa.Column("raw_sf_status", sa.String(length=80), nullable=True),
        sa.Column("raw_transfer_date", sa.Date(), nullable=True),
        sa.Column("error_category", sa.String(length=40), nullable=True),
        sa.Column("retryable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["validation_id"],
            ["sisca_validations.id"],
            ondelete="RESTRICT",
            name="fk_sisca_checks_validation_id",
        ),
        sa.UniqueConstraint(
            "validation_id",
            "checkpoint",
            "attempt_number",
            name="uq_sisca_check_checkpoint_attempt",
        ),
        sa.UniqueConstraint("request_id", name="uq_sisca_check_request_id"),
    )
    op.create_index(
        "ix_sisca_checks_validation_id",
        "sisca_validation_checks",
        ["validation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_sisca_checks_validation_id", table_name="sisca_validation_checks")
    op.drop_table("sisca_validation_checks")
    op.drop_index("ix_sisca_validations_due", table_name="sisca_validations")
    op.drop_table("sisca_validations")
