"""Allowlisted auth diagnostics: never format exceptions or attach tracebacks."""

import logging
import ssl
from time import monotonic
from typing import Literal

from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


def log_auth_failure(
    exc: BaseException, *, stage: Literal["admission", "login", "register"], started: float
) -> None:
    categories = set()
    pending = [exc]
    seen: set[int] = set()
    while pending and len(seen) < 16:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, ssl.SSLError):
            categories.add("ssl")
        elif isinstance(current, TimeoutError):
            categories.add("timeout")
        elif isinstance(current, SQLAlchemyError):
            categories.add("sql")
        elif isinstance(current, OSError):
            categories.add("connection")
        for nested in (current.__cause__, current.__context__, getattr(current, "orig", None)):
            if isinstance(nested, BaseException):
                pending.append(nested)
    category = next(
        (value for value in ("ssl", "timeout", "sql", "connection") if value in categories),
        "persistence",
    )
    logger.warning(
        "auth_failure stage=%s category=%s duration_ms=%d",
        stage,
        category,
        int((monotonic() - started) * 1000),
    )
