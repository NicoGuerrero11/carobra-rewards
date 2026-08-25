from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from carobra_rewards.infrastructure.database.base import Base
from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import TimestampMixin


class SiscaValidationModel(TimestampMixin, Base):
    __tablename__ = "sisca_validations"
    __table_args__ = (
        UniqueConstraint("customer_id", name="uq_sisca_validations_customer_id"),
        Index("ix_sisca_validations_due", "status", "next_checkpoint_at"),
    )

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    h24_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    d3_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    d5_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_checkpoint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    next_checkpoint_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_check_outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_response_movement_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_response_sf_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_response_transfer_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requires_attention_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    team_notification_required: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False
    )
    team_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class SiscaValidationCheckModel(Base):
    __tablename__ = "sisca_validation_checks"
    __table_args__ = (
        UniqueConstraint(
            "validation_id",
            "checkpoint",
            "attempt_number",
            name="uq_sisca_check_checkpoint_attempt",
        ),
        UniqueConstraint("request_id", name="uq_sisca_check_request_id"),
        Index("ix_sisca_checks_validation_id", "validation_id"),
    )

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid4)
    validation_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("sisca_validations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    check_type: Mapped[str] = mapped_column(String(16), nullable=False)
    checkpoint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    attempt_number: Mapped[int] = mapped_column(Integer(), nullable=False)
    request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer(), nullable=True)
    outcome: Mapped[str] = mapped_column(String(40), nullable=False)
    raw_movement_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    raw_sf_status: Mapped[str | None] = mapped_column(String(80), nullable=True)
    raw_transfer_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    error_category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    retryable: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
