import pytest

from carobra_rewards.modules.customer_auth.application.models import PasswordValidationError
from carobra_rewards.modules.customer_auth.domain.passwords import hash_password, verify_password


def test_password_hash_round_trip_does_not_store_raw_password() -> None:
    encoded = hash_password("correct-horse-7")

    assert encoded.startswith("scrypt$")
    assert "correct-horse-7" not in encoded
    assert verify_password("correct-horse-7", encoded) is True
    assert verify_password("wrong-password", encoded) is False


@pytest.mark.parametrize("password", ["short", "x" * 129])
def test_password_length_is_validated(password: str) -> None:
    with pytest.raises(PasswordValidationError):
        hash_password(password)


def test_malformed_hash_is_rejected_safely() -> None:
    assert verify_password("correct-horse-7", "not-a-valid-hash") is False
