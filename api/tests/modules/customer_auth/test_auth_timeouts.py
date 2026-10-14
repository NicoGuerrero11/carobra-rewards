import pytest
from pydantic import ValidationError

from carobra_rewards.core.config import Settings


def test_default_timeouts_leave_room_inside_api_deadline():
    settings = Settings()
    assert settings.auth_admission_timeout_seconds == 4
    assert settings.auth_hash_timeout_seconds == 2
    assert settings.auth_request_timeout_seconds == 7


@pytest.mark.parametrize(
    "overrides",
    [
        {"AUTH_HASH_TIMEOUT_SECONDS": 4},
        {"AUTH_ADMISSION_TIMEOUT_SECONDS": 4.1},
        {"AUTH_REQUEST_TIMEOUT_SECONDS": 6},
        {"AUTH_REQUEST_TIMEOUT_SECONDS": 2},
        {"AUTH_REQUEST_TIMEOUT_SECONDS": 11},
    ],
)
def test_incoherent_or_unbounded_timeouts_are_rejected(overrides):
    with pytest.raises(ValidationError):
        Settings.model_validate(overrides)
