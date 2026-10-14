from __future__ import annotations

import asyncio
import hashlib
import math
from datetime import datetime
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
        account_limit = (
            settings.auth_login_account_limit
            if operation == "login"
            else settings.auth_register_account_limit
        )
        dimensions = [
            (GLOBAL_KEY, settings.auth_global_limit),
            (_key("connection", peer), settings.auth_connection_limit),
            (_key(operation, email.strip().lower()), account_limit),
        ]
        retry_after = 0
        try:
            # Bound connection acquisition, locking and queries, not only hash work.
            async with asyncio.timeout(settings.auth_admission_timeout_seconds):
                async with self._session_factory() as session, session.begin():
                    await session.execute(text("SET LOCAL lock_timeout = '200ms'"))
                    await session.execute(text("SET LOCAL statement_timeout = '500ms'"))
                    await session.execute(
                        text("""
                        INSERT INTO auth_admission_counters (key, attempts, expires_at)
                        VALUES (:key, 0, clock_timestamp()) ON CONFLICT (key) DO NOTHING
                    """),
                        {"key": GLOBAL_KEY},
                    )
                    # All replicas lock this same row before touching other dimensions.
                    await session.execute(
                        text("""
                        SELECT key FROM auth_admission_counters WHERE key = :key FOR UPDATE
                    """),
                        {"key": GLOBAL_KEY},
                    )
                    now = (await session.execute(text("SELECT clock_timestamp()"))).scalar_one()
                    # Check every budget before writing any consumption, while
                    # holding the shared lock. A rejected account/peer cannot
                    # drain the budget reserved for admitted work.
                    for key, limit in reversed(dimensions):
                        retry_after = await self._retry_after(session, key, limit, now)
                        if retry_after:
                            break
                    if not retry_after:
                        for key, _ in dimensions:
                            await self._consume(session, key, now)
                    # Bounded cleanup, under the same lock. The global budget bounds
                    # new keys even when an attacker varies account and connection.
                    await session.execute(
                        text("""
                        DELETE FROM auth_admission_counters WHERE key IN (
                            SELECT key FROM auth_admission_counters
                            WHERE expires_at <= :now AND key <> :global_key
                            ORDER BY expires_at LIMIT 32
                        )
                    """),
                        {"now": now, "global_key": GLOBAL_KEY},
                    )
                # All consumptions commit together; cancellation/errors roll back all.
        except (SQLAlchemyError, TimeoutError) as exc:
            raise CustomerAuthPersistenceError() from exc
        if retry_after:
            raise AuthAdmissionRejectedError(retry_after)

    async def _retry_after(self, session: AsyncSession, key: str, limit: int, now: datetime) -> int:
        row = (
            await session.execute(
                text("""
            SELECT attempts, expires_at FROM auth_admission_counters WHERE key = :key
        """),
                {"key": key},
            )
        ).one_or_none()
        if row is not None and row.expires_at > now and row.attempts >= limit:
            return max(1, math.ceil((row.expires_at - now).total_seconds()))
        return 0

    async def _consume(self, session: AsyncSession, key: str, now: datetime) -> None:
        await session.execute(
            text("""
            INSERT INTO auth_admission_counters (key, attempts, expires_at)
            VALUES (:key, 1, CAST(:now AS timestamptz)
                + make_interval(secs => CAST(:window AS double precision)))
            ON CONFLICT (key) DO UPDATE SET
                attempts = CASE WHEN auth_admission_counters.expires_at <= :now
                    THEN 1 ELSE auth_admission_counters.attempts + 1 END,
                expires_at = CASE WHEN auth_admission_counters.expires_at <= :now
                    THEN EXCLUDED.expires_at ELSE auth_admission_counters.expires_at END
        """),
            {"key": key, "now": now, "window": self._settings.auth_admission_window_seconds},
        )


def _key(dimension: str, value: str) -> str:
    # Retain no raw emails, cookies, passwords or IP addresses in the counters.
    return hashlib.sha256(f"auth:{dimension}:{value}".encode()).hexdigest()
