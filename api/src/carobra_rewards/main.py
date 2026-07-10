from typing import cast

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from carobra_rewards.api.router import build_api_router
from carobra_rewards.api.v1.customer_intake.error_mapping import (
    build_validation_error_response,
)
from carobra_rewards.api.v1.customer_intake.http_tracing import (
    customer_intake_http_tracing_middleware,
    is_customer_intake_http_request,
)
from carobra_rewards.core.config import get_settings


async def _handle_request_validation_error(
    request: Request,
    exc: Exception,
) -> Response:
    validation_exc = cast(RequestValidationError, exc)
    if is_customer_intake_http_request(request):
        return build_validation_error_response()
    if request.url.path.startswith("/api/v1/internal/sisca-validations/"):
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "Request validation failed",
                }
            },
        )
    return await request_validation_exception_handler(request, validation_exc)


def create_application() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
        version="0.1.0",
        docs_url="/docs" if settings.is_docs_enabled else None,
        redoc_url="/redoc" if settings.is_docs_enabled else None,
        openapi_url="/openapi.json" if settings.is_docs_enabled else None,
        openapi_tags=[
            {
                "name": "customer-auth",
                "description": "Canonical customer registration, login, and profile API.",
            },
            {
                "name": "sisca-validation",
                "description": "SISCA validation lifecycle operations.",
            },
            {
                "name": "legacy-customer-intake",
                "description": "Legacy non-canonical customer intake preview.",
            },
        ],
    )
    if settings.legacy_customer_intake_enabled:
        app.middleware("http")(customer_intake_http_tracing_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.parsed_cors_allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.add_exception_handler(RequestValidationError, _handle_request_validation_error)
    app.include_router(build_api_router(settings))
    return app


app = create_application()
