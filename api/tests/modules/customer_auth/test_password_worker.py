from __future__ import annotations

import asyncio
import threading
import time

import pytest

from carobra_rewards.modules.customer_auth.application.models import AuthAdmissionRejectedError
from carobra_rewards.modules.customer_auth.infrastructure.password_worker import (
    PasswordWorker,
    get_password_worker,
)


@pytest.mark.asyncio
async def test_running_cancellation_keeps_capacity_and_loop_responsive():
    worker = PasswordWorker(workers=1, queue_size=0)
    started, release = threading.Event(), threading.Event()

    def blocked():
        started.set()
        release.wait(3)
        return 42

    task = asyncio.create_task(worker.run(blocked))
    try:
        while not started.is_set():
            await asyncio.sleep(0.001)
        assert not task.done()  # The event loop still runs while the worker is blocked.
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(AuthAdmissionRejectedError):
            await worker.run(lambda: pytest.fail("excess work must not start"))
        release.set()
        for _ in range(100):
            try:
                assert await worker.run(lambda: 7) == 7
                break
            except AuthAdmissionRejectedError:
                await asyncio.sleep(0.001)
        else:
            pytest.fail("worker capacity was not released")
    finally:
        release.set()
        worker.close()


@pytest.mark.asyncio
async def test_bounded_queue_cancellation_never_runs_cancelled_work():
    worker = PasswordWorker(workers=1, queue_size=1)
    started, release = threading.Event(), threading.Event()

    def blocked():
        started.set()
        release.wait(3)

    active = asyncio.create_task(worker.run(blocked))
    try:
        while not started.is_set():
            await asyncio.sleep(0.001)
        queued = asyncio.create_task(worker.run(lambda: pytest.fail("cancelled queue ran")))
        await asyncio.sleep(0)
        with pytest.raises(AuthAdmissionRejectedError):
            await worker.run(lambda: pytest.fail("queue exceeded bound"))
        queued.cancel()
        with pytest.raises(asyncio.CancelledError):
            await queued
        for _ in range(50):
            with pytest.raises(AuthAdmissionRejectedError):
                await worker.run(lambda: pytest.fail("cancelled item freed queue capacity"))
        release.set()
        await active
        for _ in range(100):
            try:
                assert await worker.run(lambda: "ok") == "ok"
                break
            except AuthAdmissionRejectedError:
                await asyncio.sleep(0.001)
        else:
            pytest.fail("queued capacity was not released")
    finally:
        release.set()
        worker.close()


@pytest.mark.asyncio
async def test_timeout_retains_running_capacity_and_exceptions_release_it():
    worker = PasswordWorker(workers=1, queue_size=0, timeout=0.02)
    release = threading.Event()
    try:
        with pytest.raises(AuthAdmissionRejectedError):
            await worker.run(lambda: release.wait(3))
        with pytest.raises(AuthAdmissionRejectedError):
            await worker.run(lambda: None)
        release.set()
        await asyncio.sleep(0.02)

        def broken():
            raise ValueError("synthetic")

        with pytest.raises(ValueError):
            await worker.run(broken)
        assert await worker.run(lambda: "recovered") == "recovered"
    finally:
        release.set()
        worker.close()


@pytest.mark.asyncio
async def test_request_dependency_threads_share_one_process_worker(monkeypatch):
    from carobra_rewards.modules.customer_auth.infrastructure import password_worker

    constructors = []

    def slow_constructor(**kwargs):
        constructors.append(1)
        time.sleep(0.01)  # Expose simultaneous cache misses during process startup.
        return PasswordWorker(**kwargs)

    monkeypatch.setattr(password_worker, "_worker", None)
    monkeypatch.setattr(password_worker, "PasswordWorker", slow_constructor)
    workers = await asyncio.gather(*(asyncio.to_thread(get_password_worker) for _ in range(30)))
    try:
        assert len(constructors) == 1
        assert all(worker is workers[0] for worker in workers)
    finally:
        workers[0].close()
