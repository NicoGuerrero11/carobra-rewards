from __future__ import annotations

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from carobra_rewards.modules.customer_auth.application.models import InvalidBirthDateError

REGISTRATION_TIMEZONE = ZoneInfo("America/Mexico_City")
MIN_BIRTH_DATE = date(1900, 1, 1)


def parse_birth_date(value: object, *, today: date) -> date | None:
    """Validate a self-reported date, not verified birthday evidence."""
    if value is None:
        return None
    if isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        try:
            value = date.fromisoformat(value)
        except ValueError as exc:
            raise InvalidBirthDateError() from exc
    if not isinstance(value, date) or isinstance(value, datetime):
        raise InvalidBirthDateError()
    if not MIN_BIRTH_DATE <= value <= today:
        raise InvalidBirthDateError()
    return value
