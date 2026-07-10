"""SQLAlchemy models for customer intake persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
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


class AuthUserModel(TimestampMixin, Base):
    __tablename__ = "auth_users"
    __table_args__ = (
        CheckConstraint(
            "email = lower(btrim(email))",
            name="ck_auth_users_email_normalized",
        ),
        UniqueConstraint("email", name="uq_auth_users_email"),
    )

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    customer: Mapped[CustomerModel | None] = relationship(back_populates="auth_user")
    sessions: Mapped[list[AuthSessionModel]] = relationship(back_populates="auth_user")


class AuthSessionModel(TimestampMixin, Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),
        Index("ix_auth_sessions_auth_user_id", "auth_user_id"),
        Index("ix_auth_sessions_expires_at", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    auth_user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    auth_user: Mapped[AuthUserModel] = relationship(back_populates="sessions")


class CustomerModel(TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("rewards_id", name="uq_customers_rewards_id"),
        UniqueConstraint("curp", name="uq_customers_curp"),
        UniqueConstraint("auth_user_id", name="uq_customers_auth_user_id"),
    )

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    auth_user_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    rewards_id: Mapped[str] = mapped_column(String(64), nullable=False)
    curp: Mapped[str] = mapped_column(String(18), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(16), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_status: Mapped[str] = mapped_column(String(32), nullable=False)
    onboarding_status: Mapped[str] = mapped_column(String(32), nullable=False)

    auth_user: Mapped[AuthUserModel | None] = relationship(back_populates="customer")
    consents: Mapped[list[CustomerConsentModel]] = relationship(back_populates="customer")
    intake_requests: Mapped[list[CustomerIntakeRequestModel]] = relationship(
        back_populates="customer"
    )
    customer_services: Mapped[list[CustomerServiceModel]] = relationship(back_populates="customer")


class CustomerConsentModel(TimestampMixin, Base):
    __tablename__ = "customer_consents"
    __table_args__ = (
        UniqueConstraint(
            "customer_id",
            "consent_type",
            "terms_version",
            name="uq_customer_consents_customer_type_version",
        ),
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
    consent_type: Mapped[str] = mapped_column(String(50), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    terms_version: Mapped[str] = mapped_column(String(64), nullable=False)
    audit_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    customer: Mapped[CustomerModel] = relationship(back_populates="consents")


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

    customer_services: Mapped[list[CustomerServiceModel]] = relationship(back_populates="service")


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
