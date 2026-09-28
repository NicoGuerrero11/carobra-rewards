"""add optional self-reported birth date to customers

Revision ID: 20260928_customer_birth_date
Revises: 20260910_numeric_rewards_ids
Create Date: 2026-09-28
"""

import sqlalchemy as sa
from alembic import op

revision = "20260928_customer_birth_date"
down_revision = "20260910_numeric_rewards_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("birth_date", sa.Date(), nullable=True))


def downgrade() -> None:
    # Operational rollback should normally keep the column to preserve collected dates.
    op.drop_column("customers", "birth_date")
