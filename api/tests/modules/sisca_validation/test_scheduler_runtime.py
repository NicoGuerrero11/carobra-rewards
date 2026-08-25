from __future__ import annotations

import asyncio

import pytest

from carobra_rewards.modules.sisca_validation.application.scheduler_runtime import (
    run_sisca_scheduler_loop,
)


@pytest.mark.asyncio
async def test_scheduler_runs_due_work_and_can_be_stopped() -> None:
    called = asyncio.Event()
    limits: list[int] = []

    async def run_due(*, limit: int):
        limits.append(limit)
        called.set()
        return ()

    task = asyncio.create_task(run_sisca_scheduler_loop(run_due, poll_seconds=60, batch_size=25))
    await asyncio.wait_for(called.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert limits == [25]


@pytest.mark.asyncio
async def test_scheduler_recovers_after_one_failed_iteration() -> None:
    recovered = asyncio.Event()
    calls = 0

    async def run_due(*, limit: int):
        nonlocal calls
        assert limit == 10
        calls += 1
        if calls == 1:
            raise RuntimeError("provider detail must not stop the scheduler")
        recovered.set()
        return ()

    task = asyncio.create_task(run_sisca_scheduler_loop(run_due, poll_seconds=0.001, batch_size=10))
    await asyncio.wait_for(recovered.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert calls == 2


@pytest.mark.asyncio
async def test_scheduler_rejects_invalid_runtime_configuration() -> None:
    async def run_due(*, limit: int):
        return ()

    with pytest.raises(ValueError, match="poll_seconds"):
        await run_sisca_scheduler_loop(run_due, poll_seconds=0, batch_size=1)
    with pytest.raises(ValueError, match="batch_size"):
        await run_sisca_scheduler_loop(run_due, poll_seconds=1, batch_size=0)
