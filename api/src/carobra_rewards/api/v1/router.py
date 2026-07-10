"""Router composition for API version 1."""

from fastapi import APIRouter

from carobra_rewards.api.v1.auth.router import router as auth_router
from carobra_rewards.api.v1.customer_intake.router import router as customer_intake_router
from carobra_rewards.api.v1.sisca_validation.router import router as sisca_validation_router
from carobra_rewards.core.config import Settings, get_settings


def build_v1_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    router.include_router(auth_router)
    if settings.legacy_customer_intake_enabled:
        router.include_router(customer_intake_router)
    router.include_router(sisca_validation_router)
    return router


router = build_v1_router(get_settings())
