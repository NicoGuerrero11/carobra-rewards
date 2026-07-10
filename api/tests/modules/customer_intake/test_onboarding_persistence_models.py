from __future__ import annotations

from typing import cast

from sqlalchemy import CheckConstraint, Table, UniqueConstraint

from carobra_rewards.modules.customer_intake.infrastructure.persistence.models import (
    AuthUserModel,
    CustomerConsentModel,
    CustomerModel,
)


def _constraint_names(model: type) -> set[str | None]:
    table = cast(Table, model.__table__)
    return {cast(str | None, constraint.name) for constraint in table.constraints}


def test_auth_users_model_requires_normalized_unique_email_and_password_audit_fields() -> None:
    table = cast(Table, AuthUserModel.__table__)
    columns = table.c

    assert set(columns.keys()) == {
        "id",
        "email",
        "password_hash",
        "password_updated_at",
        "email_verified_at",
        "created_at",
        "updated_at",
    }
    assert columns.email.nullable is False
    assert columns.password_hash.nullable is False
    assert columns.password_updated_at.nullable is False
    assert columns.email_verified_at.nullable is True
    assert "uq_auth_users_email" in _constraint_names(AuthUserModel)
    assert any(
        isinstance(constraint, CheckConstraint)
        and constraint.name == "ck_auth_users_email_normalized"
        for constraint in table.constraints
    )


def test_customer_model_uses_registration_profile_and_has_no_nss_or_combined_name() -> None:
    columns = CustomerModel.__table__.c

    assert "nss" not in columns
    assert "name" not in columns
    assert {
        "auth_user_id",
        "first_name",
        "last_name",
        "phone",
        "postal_code",
        "state",
        "city",
    }.issubset(columns.keys())
    assert columns.auth_user_id.nullable is True
    assert all(
        columns[column].nullable is False
        for column in ("first_name", "last_name", "phone", "postal_code", "state", "city")
    )
    assert "uq_customers_auth_user_id" in _constraint_names(CustomerModel)


def test_customer_consents_model_keeps_versioned_acceptance_and_audit_metadata() -> None:
    table = cast(Table, CustomerConsentModel.__table__)
    columns = table.c

    assert set(columns.keys()) == {
        "id",
        "customer_id",
        "consent_type",
        "accepted_at",
        "terms_version",
        "audit_metadata",
        "created_at",
        "updated_at",
    }
    assert all(column.nullable is False for column in columns)
    constraint = next(
        item
        for item in table.constraints
        if isinstance(item, UniqueConstraint)
        and item.name == "uq_customer_consents_customer_type_version"
    )
    assert tuple(constraint.columns.keys()) == (
        "customer_id",
        "consent_type",
        "terms_version",
    )
