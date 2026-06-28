from fastapi import APIRouter

from carobra_rewards.api.health import router as health_router
from carobra_rewards.api.v1.router import router as v1_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(v1_router)
