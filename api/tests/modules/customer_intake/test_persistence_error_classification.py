from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from carobra_rewards.modules.customer_intake.domain.errors import (
    DuplicateAuthUserEmailError,
    DuplicateCustomerConsentError,
    DuplicateCustomerCurpError,
    DuplicateCustomerRewardsIdError,
    UnexpectedPersistenceError,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    _map_integrity_error,
)


class _Diagnostic:
    def __init__(self, constraint_name: str) -> None:
        self.constraint_name = constraint_name


class _DatabaseIntegrityError(Exception):
    def __init__(self, constraint_name: str) -> None:
        super().__init__(f'constraint "{constraint_name}" failed')
        self.diag = _Diagnostic(constraint_name)


def _integrity_error(constraint_name: str) -> IntegrityError:
    return IntegrityError("INSERT", {}, _DatabaseIntegrityError(constraint_name))


@pytest.mark.parametrize(
    ("constraint_name", "expected_type"),
    [
        ("uq_auth_users_email", DuplicateAuthUserEmailError),
        ("uq_customers_curp", DuplicateCustomerCurpError),
        ("uq_customers_rewards_id", DuplicateCustomerRewardsIdError),
        (
            "uq_customer_consents_customer_type_version",
            DuplicateCustomerConsentError,
        ),
    ],
)
def test_known_integrity_constraints_map_to_stable_persistence_errors(
    constraint_name: str,
    expected_type: type[Exception],
) -> None:
    assert isinstance(_map_integrity_error(_integrity_error(constraint_name)), expected_type)


def test_unknown_integrity_constraint_maps_to_unexpected_persistence_error() -> None:
    mapped = _map_integrity_error(_integrity_error("uq_unknown_constraint"))

    assert isinstance(mapped, UnexpectedPersistenceError)
