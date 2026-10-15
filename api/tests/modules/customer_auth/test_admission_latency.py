"""Real PostgreSQL behind an isolated TCP latency proxy, never external hosts."""

import asyncio
from contextlib import asynccontextmanager
from time import monotonic

import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker

from carobra_rewards.core.config import Settings
from carobra_rewards.infrastructure.database.engine import create_database_engine
from carobra_rewards.modules.customer_auth.application.models import AuthAdmissionRejectedError
from carobra_rewards.modules.customer_auth.infrastructure.admission import AuthAdmission


@asynccontextmanager
async def delayed_postgres(database_url, delay=0.05):
    target = make_url(database_url)
    assert target.host in {"127.0.0.1", "::1"}, "Latency tests only allow loopback PostgreSQL"
    tasks = set()

    async def handle(reader, writer):
        task = asyncio.current_task()
        tasks.add(task)
        upstream = None
        try:
            upstream_reader, upstream = await asyncio.open_connection(target.host, target.port)

            async def relay(source, destination):
                try:
                    while chunk := await source.read(65536):
                        await asyncio.sleep(delay)
                        destination.write(chunk)
                        await destination.drain()
                finally:
                    destination.close()

            async with asyncio.TaskGroup() as group:
                group.create_task(relay(reader, upstream))
                group.create_task(relay(upstream_reader, writer))
        finally:
            writer.close()
            if upstream:
                upstream.close()
            tasks.discard(task)

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    engine = create_database_engine(
        target.set(host="127.0.0.1", port=port).render_as_string(hide_password=False),
        pool_pre_ping=True,
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        server.close()
        await server.wait_closed()
        active = list(tasks)
        for task in active:
            task.cancel()
        await asyncio.gather(*active, return_exceptions=True)


@pytest.mark.integration
async def test_real_network_latency_cold_warm_and_rejection(migrated_postgres_database):
    settings = Settings(AUTH_LOGIN_ACCOUNT_LIMIT=2)
    async with delayed_postgres(migrated_postgres_database) as factory:
        gate = AuthAdmission(factory, settings)
        for state in ("cold", "warm"):
            started = monotonic()
            await gate.admit("login", "latency@example.test", "synthetic-peer")
            elapsed = monotonic() - started
            print(f"{state}: {elapsed:.3f}s, simulated RTT >= 100ms")
            assert elapsed < settings.auth_admission_timeout_seconds
        with pytest.raises(AuthAdmissionRejectedError):
            await gate.admit("login", "latency@example.test", "synthetic-peer")


@pytest.mark.integration
async def test_concurrent_replicas_under_network_latency_never_overspend(
    migrated_postgres_database,
):
    from sqlalchemy import text

    from carobra_rewards.modules.customer_auth.application.models import (
        CustomerAuthPersistenceError,
    )

    settings = Settings(AUTH_GLOBAL_LIMIT=1)
    async with delayed_postgres(migrated_postgres_database) as factory:
        gates = [AuthAdmission(factory, settings) for _ in range(4)]
        outcomes = await asyncio.gather(
            *(
                gate.admit("login", f"replica-{i}@example.test", f"peer-{i}")
                for i, gate in enumerate(gates)
            ),
            return_exceptions=True,
        )
        assert sum(outcome is None for outcome in outcomes) == 1
        assert all(
            outcome is None
            or isinstance(outcome, AuthAdmissionRejectedError | CustomerAuthPersistenceError)
            for outcome in outcomes
        )
        async with factory() as session:
            rows = (
                (await session.execute(text("SELECT attempts FROM auth_admission_counters")))
                .scalars()
                .all()
            )
        assert rows == [1, 1, 1]
        # Contention can fail closed with 503 at the unchanged 200ms lock limit.
        # Once the lock clears, all replicas see the spent quota and return 429.
        with pytest.raises(AuthAdmissionRejectedError):
            await gates[0].admit("login", "after-contention@example.test", "other-peer")
