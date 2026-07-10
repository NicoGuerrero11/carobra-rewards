from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import Depends

from carobra_rewards.core.config import Settings, get_settings
from carobra_rewards.infrastructure.database.session import get_session_factory
from carobra_rewards.modules.customer_auth.application.service import CustomerAuthService


def get_customer_auth_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerAuthService:
    return CustomerAuthService(
        get_session_factory(),
        session_ttl=timedelta(hours=settings.auth_session_ttl_hours),
    )
