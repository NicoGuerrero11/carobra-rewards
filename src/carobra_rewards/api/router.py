from fastapi import APIRouter

from carobra_rewards.api.health import router as health_router
from carobra_rewards.api.v1.router import build_v1_router
from carobra_rewards.core.config import Settings, get_settings


def build_api_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    router.include_router(health_router)
    router.include_router(build_v1_router(settings))
    return router


api_router = build_api_router(get_settings())
