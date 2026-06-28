"""SQLAlchemy models for customer intake persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from carobra_rewards.infrastructure.database.base import Base
from carobra_rewards.modules.customer_intake.infrastructure.persistence.timestamps import (
    utc_now,
)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class CustomerModel(TimestampMixin, Base):
    __tablename__ = "customers"

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    rewards_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    curp: Mapped[str] = mapped_column(String(18), nullable=False, unique=True)
    nss: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    customer_status: Mapped[str] = mapped_column(String(32), nullable=False)
    onboarding_status: Mapped[str] = mapped_column(String(32), nullable=False)

    intake_requests: Mapped[list[CustomerIntakeRequestModel]] = relationship(
        back_populates="customer"
    )
    customer_services: Mapped[list[CustomerServiceModel]] = relationship(
        back_populates="customer"
    )


class ServiceModel(TimestampMixin, Base):
    __tablename__ = "services"

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    customer_services: Mapped[list[CustomerServiceModel]] = relationship(
        back_populates="service"
    )


class CustomerIntakeRequestModel(TimestampMixin, Base):
    __tablename__ = "customer_intake_requests"
    __table_args__ = (
        UniqueConstraint("source", "external_request_id", name="uq_intake_source_external"),
        Index("ix_intake_customer_id", "customer_id"),
        Index("ix_intake_processing_status", "processing_status"),
    )

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_request_id: Mapped[str] = mapped_column(String(120), nullable=False)
    curp: Mapped[str] = mapped_column(String(18), nullable=False)
    processing_status: Mapped[str] = mapped_column(String(32), nullable=False)
    processing_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    original_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    customer_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    customer: Mapped[CustomerModel | None] = relationship(back_populates="intake_requests")


class CustomerServiceModel(TimestampMixin, Base):
    __tablename__ = "customer_services"
    __table_args__ = (
        UniqueConstraint("customer_id", "service_id", name="uq_customer_service_pair"),
        Index("ix_customer_services_service_id", "service_id"),
    )

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    customer_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    service_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    customer: Mapped[CustomerModel] = relationship(back_populates="customer_services")
    service: Mapped[ServiceModel] = relationship(back_populates="customer_services")
