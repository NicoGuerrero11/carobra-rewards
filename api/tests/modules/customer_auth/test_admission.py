from __future__ import annotations

import asyncio
from unittest.mock import Mock

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from carobra_rewards.core.config import Settings
from carobra_rewards.modules.customer_auth.application.models import (
    AuthAdmissionRejectedError,
    CustomerAuthPersistenceError,
)
from carobra_rewards.modules.customer_auth.infrastructure.admission import AuthAdmission


def settings(**overrides):
    values = {
        "AUTH_LOGIN_ACCOUNT_LIMIT": 2,
        "AUTH_REGISTER_ACCOUNT_LIMIT": 1,
        "AUTH_CONNECTION_LIMIT": 20,
        "AUTH_GLOBAL_LIMIT": 30,
    }
    values.update(overrides)
    return Settings.model_validate(values)


@pytest.mark.integration
async def test_account_normalization_rejection_is_temporary_and_does_not_extend_window(
    postgres_session_factory,
):
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", " Ada@Example.Test ", "peer-a")
    await gate.admit("login", "ada@example.test", "peer-b")
    async with postgres_session_factory() as session:
        before = dict(
            (
                await session.execute(text("SELECT key, expires_at FROM auth_admission_counters"))
            ).all()
        )
    for _ in range(3):
        with pytest.raises(AuthAdmissionRejectedError) as rejected:
            await gate.admit("login", "ADA@EXAMPLE.TEST", "peer-c")
        assert 1 <= rejected.value.retry_after <= 60
    async with postgres_session_factory() as session:
        after = dict(
            (
                await session.execute(text("SELECT key, expires_at FROM auth_admission_counters"))
            ).all()
        )
        assert all(after[key] == expiry for key, expiry in before.items())
        await session.execute(
            text("UPDATE auth_admission_counters SET expires_at = now() - interval '1 second'")
        )
        await session.commit()
    await gate.admit("login", "ada@example.test", "peer-c")


@pytest.mark.integration
async def test_shared_connection_budget_combines_login_and_registration(postgres_session_factory):
    gate = AuthAdmission(postgres_session_factory, settings(AUTH_CONNECTION_LIMIT=2))
    await gate.admit("login", "one@example.test", "shared-bff")
    await gate.admit("register", "two@example.test", "shared-bff")
    with pytest.raises(AuthAdmissionRejectedError):
        await gate.admit("login", "three@example.test", "shared-bff")
    await gate.admit("login", "three@example.test", "other-connection")


@pytest.mark.integration
async def test_two_instances_share_atomic_global_budget_and_bound_keys(postgres_session_factory):
    gates = [
        AuthAdmission(postgres_session_factory, settings(AUTH_GLOBAL_LIMIT=5)) for _ in range(2)
    ]
    outcomes = await asyncio.gather(
        *(
            gates[i % 2].admit("login", f"synthetic-{i}@example.test", f"peer-{i}")
            for i in range(12)
        ),
        return_exceptions=True,
    )
    assert sum(value is None for value in outcomes) == 5
    assert sum(isinstance(value, AuthAdmissionRejectedError) for value in outcomes) == 7
    async with postgres_session_factory() as session:
        rows = (
            await session.execute(text("SELECT key, attempts FROM auth_admission_counters"))
        ).all()
    assert len(rows) == 11
    assert all(len(key) == 64 and "@" not in key for key, _ in rows)
    with pytest.raises(AuthAdmissionRejectedError):
        await gates[1].admit("register", "another@example.test", "new-peer")


@pytest.mark.integration
async def test_registration_has_a_separate_smaller_account_budget(postgres_session_factory):
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("register", "ada@example.test", "shared-bff")
    with pytest.raises(AuthAdmissionRejectedError):
        await gate.admit("register", "ada@example.test", "shared-bff")
    await gate.admit("login", "ada@example.test", "shared-bff")


@pytest.mark.integration
async def test_expired_counter_cleanup_is_bounded_and_reclaims_storage(postgres_session_factory):
    async with postgres_session_factory() as session:
        await session.execute(
            text("""
            INSERT INTO auth_admission_counters (key, attempts, expires_at)
            SELECT md5(i::text), 1, now() - interval '1 second' FROM generate_series(1, 40) i
        """)
        )
        await session.commit()
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", "one@example.test", "shared-bff")
    async with postgres_session_factory() as session:
        count = await session.scalar(text("SELECT count(*) FROM auth_admission_counters"))
    assert count == 11
    await gate.admit("login", "one@example.test", "shared-bff")
    async with postgres_session_factory() as session:
        assert await session.scalar(text("SELECT count(*) FROM auth_admission_counters")) == 3


async def test_storage_failure_fails_closed():
    def unavailable():
        raise OperationalError("synthetic", None, Exception("unavailable"))

    gate = AuthAdmission(Mock(side_effect=unavailable), settings())
    with pytest.raises(CustomerAuthPersistenceError):
        await gate.admit("login", "synthetic@example.test", "peer")


async def snapshot(factory):
    async with factory() as session:
        return (
            await session.execute(
                text("SELECT key, attempts, expires_at FROM auth_admission_counters ORDER BY key")
            )
        ).all()


@pytest.mark.integration
@pytest.mark.parametrize("dimension", ["account", "connection", "global"])
async def test_rejection_has_no_partial_consumption_or_new_keys(
    postgres_session_factory, dimension
):
    limits = {"AUTH_GLOBAL_LIMIT": 2}
    if dimension == "account":
        limits["AUTH_LOGIN_ACCOUNT_LIMIT"] = 1
    if dimension == "connection":
        limits["AUTH_CONNECTION_LIMIT"] = 1
    gate = AuthAdmission(postgres_session_factory, settings(**limits))
    await gate.admit("login", "one@example.test", "peer-one")
    if dimension == "global":
        await gate.admit("login", "two@example.test", "peer-two")
    before = await snapshot(postgres_session_factory)
    for i in range(8):
        email = "one@example.test" if dimension == "account" else f"blocked-{i}@example.test"
        peer = "peer-one" if dimension == "connection" else f"blocked-peer-{i}"
        with pytest.raises(AuthAdmissionRejectedError):
            await gate.admit("login", email, peer)
    assert await snapshot(postgres_session_factory) == before
    if dimension != "global":
        # Rejected work did not spend the remaining global slot.
        await gate.admit("login", "two@example.test", "peer-two")


@pytest.mark.integration
async def test_cancel_after_consumption_before_commit_rolls_back_and_releases_capacity(
    postgres_session_factory,
):
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", "one@example.test", "peer-one")
    before = await snapshot(postgres_session_factory)
    wrote = asyncio.Event()

    class PausedAdmission(AuthAdmission):
        async def _decide(self, session, parameters):
            result = await super()._decide(session, parameters)
            wrote.set()
            await asyncio.Event().wait()
            return result

    paused = PausedAdmission(postgres_session_factory, settings())
    task = asyncio.create_task(paused.admit("login", "two@example.test", "peer-two"))
    await asyncio.wait_for(wrote.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await snapshot(postgres_session_factory) == before
    await gate.admit("login", "two@example.test", "peer-two")


@pytest.mark.integration
async def test_storage_timeout_rolls_back_partial_consumption(postgres_session_factory):
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", "one@example.test", "peer-one")
    before = await snapshot(postgres_session_factory)

    class PausedAdmission(AuthAdmission):
        async def _decide(self, session, parameters):
            result = await super()._decide(session, parameters)
            await asyncio.Event().wait()
            return result

    paused = PausedAdmission(
        postgres_session_factory, settings(AUTH_ADMISSION_TIMEOUT_SECONDS=0.05)
    )
    with pytest.raises(CustomerAuthPersistenceError):
        await paused.admit("login", "two@example.test", "peer-two")
    assert await snapshot(postgres_session_factory) == before
    await gate.admit("login", "two@example.test", "peer-two")


@pytest.mark.integration
async def test_sql_failure_after_consumption_rolls_back_every_dimension(postgres_session_factory):
    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", "one@example.test", "peer-one")
    before = await snapshot(postgres_session_factory)

    class FailedAdmission(AuthAdmission):
        async def _decide(self, session, parameters):
            await super()._decide(session, parameters)
            await session.execute(text("SELECT * FROM deliberately_missing_auth_test_table"))
            pytest.fail("invalid SQL must fail closed")

    with pytest.raises(CustomerAuthPersistenceError):
        await FailedAdmission(postgres_session_factory, settings()).admit(
            "login", "two@example.test", "peer-two"
        )
    assert await snapshot(postgres_session_factory) == before
    await gate.admit("login", "two@example.test", "peer-two")


@pytest.mark.integration
async def test_waiting_replica_reads_latest_committed_budget(postgres_session_factory):
    config = settings(AUTH_GLOBAL_LIMIT=2)
    gate = AuthAdmission(postgres_session_factory, config)
    await gate.admit("login", "one@example.test", "peer-one")
    consumed = asyncio.Event()
    release = asyncio.Event()

    class HoldingAdmission(AuthAdmission):
        async def _decide(self, session, parameters):
            result = await super()._decide(session, parameters)
            consumed.set()
            await release.wait()
            return result

    holder = asyncio.create_task(
        HoldingAdmission(postgres_session_factory, config).admit(
            "login", "two@example.test", "peer-two"
        )
    )
    await asyncio.wait_for(consumed.wait(), 2)
    waiter = asyncio.create_task(gate.admit("login", "three@example.test", "peer-three"))
    try:
        await asyncio.sleep(0.05)
        assert not waiter.done()
        release.set()
        await holder
        with pytest.raises(AuthAdmissionRejectedError):
            await waiter
        after = await snapshot(postgres_session_factory)
        assert len(after) == 5
        assert max(row.attempts for row in after) == 2
    finally:
        release.set()
        await asyncio.gather(holder, waiter, return_exceptions=True)


@pytest.mark.integration
async def test_database_lock_timeout_fails_closed_and_recovers(postgres_session_factory):
    from carobra_rewards.modules.customer_auth.infrastructure.admission import GLOBAL_KEY

    gate = AuthAdmission(postgres_session_factory, settings())
    await gate.admit("login", "one@example.test", "peer-one")
    before = await snapshot(postgres_session_factory)
    async with postgres_session_factory() as holder, holder.begin():
        await holder.execute(
            text("SELECT key FROM auth_admission_counters WHERE key = :key FOR UPDATE"),
            {"key": GLOBAL_KEY},
        )
        with pytest.raises(CustomerAuthPersistenceError):
            await asyncio.wait_for(gate.admit("login", "two@example.test", "peer-two"), 2)
    assert await snapshot(postgres_session_factory) == before
    await gate.admit("login", "two@example.test", "peer-two")
