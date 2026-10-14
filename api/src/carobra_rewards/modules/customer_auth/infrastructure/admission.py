from __future__ import annotations

import asyncio
import hashlib
from threading import BoundedSemaphore
from typing import Literal

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from carobra_rewards.core.config import Settings
from carobra_rewards.modules.customer_auth.application.models import (
    AuthAdmissionRejectedError,
    CustomerAuthPersistenceError,
)

_ADMISSION_SLOTS = BoundedSemaphore(16)
GLOBAL_KEY = hashlib.sha256(b"auth:global:v1").hexdigest()

# This statement runs AFTER the global lock has been acquired in a separate
# statement. Under READ COMMITTED it therefore sees the previous owner's commit.
# Combining lock acquisition and this snapshot into one statement would lose
# that guarantee when another replica was already waiting for the lock.
_DECIDE = text("""
    WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now),
    dimensions(key, budget) AS (VALUES
        (CAST(:global_key AS varchar), CAST(:global_limit AS integer)),
        (CAST(:peer_key AS varchar), CAST(:peer_limit AS integer)),
        (CAST(:account_key AS varchar), CAST(:account_limit AS integer))
    ),
    decision AS MATERIALIZED (
        SELECT COALESCE(MAX(CEIL(EXTRACT(EPOCH FROM (c.expires_at - i.now))))
            FILTER (WHERE c.expires_at > i.now AND c.attempts >= d.budget), 0)::integer
            AS retry_after
        FROM dimensions d CROSS JOIN instant i
        LEFT JOIN auth_admission_counters c ON c.key = d.key
    ),
    consumed AS (
        INSERT INTO auth_admission_counters (key, attempts, expires_at)
        SELECT d.key, 1, i.now + make_interval(secs => CAST(:window AS double precision))
        FROM dimensions d CROSS JOIN instant i CROSS JOIN decision verdict
        WHERE verdict.retry_after = 0
        ON CONFLICT (key) DO UPDATE SET
            attempts = CASE WHEN auth_admission_counters.expires_at <= (SELECT now FROM instant)
                THEN 1 ELSE auth_admission_counters.attempts + 1 END,
            expires_at = CASE WHEN auth_admission_counters.expires_at <= (SELECT now FROM instant)
                THEN EXCLUDED.expires_at ELSE auth_admission_counters.expires_at END
    ),
    cleaned AS (
        DELETE FROM auth_admission_counters WHERE key IN (
            SELECT c.key FROM auth_admission_counters c CROSS JOIN instant i
            WHERE c.expires_at <= i.now AND c.key NOT IN (SELECT key FROM dimensions)
                AND (SELECT retry_after FROM decision) = 0
            ORDER BY c.expires_at LIMIT 32
        )
    )
    SELECT retry_after FROM decision
""")


class AuthAdmission:
    """Shared fixed windows; rejected requests never extend an account's window."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], settings: Settings):
        self._session_factory = session_factory
        self._settings = settings

    async def admit(self, operation: Literal["login", "register"], email: str, peer: str) -> None:
        if not _ADMISSION_SLOTS.acquire(blocking=False):
            raise AuthAdmissionRejectedError()
        try:
            await self._admit(operation, email, peer)
        finally:
            _ADMISSION_SLOTS.release()

    async def _admit(self, operation: Literal["login", "register"], email: str, peer: str) -> None:
        settings = self._settings
        parameters = {
            "global_key": GLOBAL_KEY,
            "global_limit": settings.auth_global_limit,
            "peer_key": _key("connection", peer),
            "peer_limit": settings.auth_connection_limit,
            "account_key": _key(operation, email.strip().lower()),
            "account_limit": (
                settings.auth_login_account_limit
                if operation == "login"
                else settings.auth_register_account_limit
            ),
            "window": settings.auth_admission_window_seconds,
        }
        try:
            # Three SQL executions; driver setup, prepare, BEGIN and COMMIT
            # also need network round trips within this same bounded budget.
            async with asyncio.timeout(settings.auth_admission_timeout_seconds):
                async with self._session_factory() as session, session.begin():
                    await session.execute(
                        text("""
                        SELECT set_config('lock_timeout', '200ms', true),
                               set_config('statement_timeout', '500ms', true)
                    """)
                    )
                    # The no-op update acquires the same row lock on both cold and
                    # warm starts without changing its window or consumption.
                    await session.execute(
                        text("""
                        INSERT INTO auth_admission_counters (key, attempts, expires_at)
                        VALUES (:key, 0, clock_timestamp())
                        ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
                    """),
                        {"key": GLOBAL_KEY},
                    )
                    retry_after = await self._decide(session, parameters)
                # Decision, consumption and bounded cleanup commit together.
                # Cancellation/errors roll back; rejected work consumes nothing.
        except (SQLAlchemyError, TimeoutError, OSError) as exc:
            raise CustomerAuthPersistenceError() from exc
        if retry_after:
            raise AuthAdmissionRejectedError(retry_after)

    async def _decide(self, session: AsyncSession, parameters: dict[str, str | int]) -> int:
        # Cleanup excludes ALL consumed keys: two data-changing CTEs must never
        # modify the same row in one statement, including an expired account.
        return int((await session.execute(_DECIDE, parameters)).scalar_one())


def _key(dimension: str, value: str) -> str:
    # Retain no raw emails, cookies, passwords or IP addresses in the counters.
    return hashlib.sha256(f"auth:{dimension}:{value}".encode()).hexdigest()
