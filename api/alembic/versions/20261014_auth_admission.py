"""Shared, temporary authentication admission counters."""

import sqlalchemy as sa
from alembic import op

revision = "20261014_auth_admission"
down_revision = "20260928_customer_birth_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_admission_counters",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_admission_expiry", "auth_admission_counters", ["expires_at"])


def downgrade() -> None:
    op.drop_table("auth_admission_counters")
