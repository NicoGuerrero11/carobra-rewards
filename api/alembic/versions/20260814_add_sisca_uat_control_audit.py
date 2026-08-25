"""add controlled UAT operator audit field

Revision ID: 20260814_sisca_uat_audit
Revises: 20260709_auth_sessions
Create Date: 2026-08-14 12:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260814_sisca_uat_audit"
down_revision = "20260709_auth_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sisca_validation_checks",
        sa.Column("operator_id", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sisca_validation_checks", "operator_id")
