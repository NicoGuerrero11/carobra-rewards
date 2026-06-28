"""Router composition for API version 1."""

from fastapi import APIRouter

from carobra_rewards.api.v1.customer_intake.router import router as customer_intake_router

router = APIRouter(prefix="/api/v1")
router.include_router(customer_intake_router)
