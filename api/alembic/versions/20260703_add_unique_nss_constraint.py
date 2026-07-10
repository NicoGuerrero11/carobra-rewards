"""add unique nss constraint for customers

Revision ID: 20260703_unique_customer_nss
Revises: 20260624_customer_persistence
Create Date: 2026-07-03 11:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260703_unique_customer_nss"
down_revision = "20260624_customer_persistence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_customers_nss", "customers", ["nss"])


def downgrade() -> None:
    op.drop_constraint("uq_customers_nss", "customers", type_="unique")
