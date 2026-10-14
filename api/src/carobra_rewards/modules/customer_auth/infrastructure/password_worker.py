from __future__ import annotations

import asyncio
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore, Event, Lock
from typing import TypeVar

from carobra_rewards.modules.customer_auth.application.models import AuthAdmissionRejectedError

T = TypeVar("T")


class PasswordWorker:
    """Bound active AND queued hashes. Cancellation never frees a running hash's slot."""

    def __init__(self, *, workers: int = 2, queue_size: int = 8, timeout: float = 2) -> None:
        if workers < 1 or queue_size < 0 or timeout <= 0:
            raise ValueError("Invalid password worker limits")
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="auth-scrypt")
        self._slots = BoundedSemaphore(workers + queue_size)
        self._timeout = timeout

    async def run(self, operation: Callable[..., T], *args: object) -> T:
        if not self._slots.acquire(blocking=False):
            raise AuthAdmissionRejectedError()
        abandoned = Event()

        def execute() -> T:
            if abandoned.is_set():
                raise AuthAdmissionRejectedError()
            return operation(*args)

        try:
            work = self._executor.submit(execute)
        except BaseException:
            self._slots.release()
            raise
        work.add_done_callback(lambda _: self._slots.release())
        pending = asyncio.wrap_future(work)
        pending.add_done_callback(lambda done: None if done.cancelled() else done.exception())
        try:
            return await asyncio.wait_for(asyncio.shield(pending), timeout=self._timeout)
        except TimeoutError as exc:
            # Keep the slot until the executor dequeues this item. Cancelling the
            # Future would release it immediately while leaving a queue entry,
            # allowing repeated cancellations to grow the executor queue.
            abandoned.set()
            raise AuthAdmissionRejectedError() from exc
        except asyncio.CancelledError:
            abandoned.set()
            raise

    def close(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=True)


_worker: PasswordWorker | None = None
_worker_lock = Lock()


def get_password_worker() -> PasswordWorker:
    from carobra_rewards.core.config import get_settings

    global _worker
    # FastAPI constructs synchronous dependencies in multiple threads. A cache
    # alone can invoke its factory concurrently on the first requests.
    with _worker_lock:
        if _worker is None:
            settings = get_settings()
            _worker = PasswordWorker(
                workers=settings.auth_hash_workers,
                queue_size=settings.auth_hash_queue_size,
                timeout=settings.auth_hash_timeout_seconds,
            )
        return _worker
