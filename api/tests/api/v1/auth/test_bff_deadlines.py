"""Opt-in real HTTP API -> BFF regression; local synthetic services only.

Build site-backend first and set AUTH_TEST_NODE to a local Node executable.
"""

from __future__ import annotations

import asyncio
import os
import socket
import threading
from pathlib import Path

import httpx
import pytest
import uvicorn

from carobra_rewards.api.v1.auth.dependencies import get_auth_admission, get_customer_auth_service
from carobra_rewards.core.config import Settings, get_settings
from carobra_rewards.main import create_application
from carobra_rewards.modules.customer_auth.application.models import AuthAdmissionRejectedError
from carobra_rewards.modules.customer_auth.infrastructure.password_worker import PasswordWorker

BFF_ROOT = Path(__file__).resolve().parents[5] / "site-backend"
BFF_SCRIPT = """
import { createSiteBackendServer } from './dist/src/app.js';
import { loadConfig } from './dist/src/config.js';
const config = loadConfig({
  API_BASE_URL: process.argv[1], API_REQUEST_TIMEOUT_MS: '50',
  AUTH_API_RESPONSE_BUDGET_MS: '1000', AUTH_REQUEST_TIMEOUT_MS: '2000',
});
const server = createSiteBackendServer(config);
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
"""


@pytest.mark.integration
@pytest.mark.parametrize("endpoint", ["login", "register"])
@pytest.mark.parametrize("failure", ["hash_timeout", "route_timeout", "transport_timeout"])
async def test_real_api_bff_deadline_contract(endpoint, failure):
    node = os.getenv("AUTH_TEST_NODE")
    if not node:
        pytest.skip("AUTH_TEST_NODE is required for the local cross-service HTTP test")
    assert (BFF_ROOT / "dist/src/app.js").is_file(), "Build site-backend before this test"
    release_hash = threading.Event()
    release_response = asyncio.Event()
    worker = PasswordWorker(workers=1, queue_size=0, timeout=0.1)

    class Admission:
        async def admit(self, *_args):
            return None

    class Service:
        async def login(self, _command):
            if failure == "route_timeout":
                await asyncio.Event().wait()
            # Kept blocked until test cleanup: response deadlines must not free capacity.
            await worker.run(release_hash.wait)
            pytest.fail("blocked hash unexpectedly returned")

        register = login

    app = create_application()
    app.dependency_overrides[get_settings] = lambda: Settings(
        AUTH_ADMISSION_TIMEOUT_SECONDS=0.1,
        AUTH_HASH_TIMEOUT_SECONDS=0.1,
        AUTH_REQUEST_TIMEOUT_SECONDS=1,
    )
    app.dependency_overrides[get_auth_admission] = Admission
    app.dependency_overrides[get_customer_auth_service] = Service

    async def transport(scope, receive, send):
        async def gated_send(message):
            if failure == "transport_timeout" and message["type"] == "http.response.start":
                # Simulate a response that the transport never delivers, independently
                # of the API's own deadline. No production connection is involved.
                await release_response.wait()
            await send(message)

        await app(scope, receive, gated_send)

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    sock.listen()
    port = sock.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            transport,
            lifespan="off",
            access_log=False,
            log_level="critical",
            proxy_headers=False,
        )
    )
    serving = asyncio.create_task(server.serve(sockets=[sock]))
    process = None
    try:
        async with asyncio.timeout(5):
            while not server.started:
                await asyncio.sleep(0.001)
        process = await asyncio.create_subprocess_exec(
            node,
            "--input-type=module",
            "-e",
            BFF_SCRIPT,
            f"http://127.0.0.1:{port}",
            cwd=BFF_ROOT,
            env={"PATH": os.defpath, "NODE_ENV": "test"},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        assert process.stdout is not None
        bff_port = int(await asyncio.wait_for(process.stdout.readline(), 5))
        payload: dict[str, object] = {
            "email": "synthetic@example.test",
            "password": "synthetic-password",
        }
        if endpoint == "register":
            payload.update(
                {
                    "curp": "ABCD123456HMNLRS09",
                    "first_name": "Ada",
                    "last_name": "Test",
                    "phone": "5551234567",
                    "confirm_password": "synthetic-password",
                    "postal_code": "01010",
                    "state": "CDMX",
                    "city": "CDMX",
                    "terms_accepted": True,
                    "terms_version": "2026-10",
                }
            )
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"http://127.0.0.1:{bff_port}/api/v1/auth/{endpoint}",
                json=payload,
            )
        assert "set-cookie" not in response.headers
        if failure == "transport_timeout":
            assert response.status_code == 503
            assert response.json()["error"]["code"] == "api_unavailable"
            assert "retry-after" not in response.headers
        else:
            assert response.status_code == 429
            assert response.json() == {
                "error": {
                    "code": "auth_rate_limited",
                    "message": "Try again later",
                }
            }
            assert response.headers["retry-after"] == "1"
            assert response.headers["cache-control"] == "no-store"
        if failure != "route_timeout":
            with pytest.raises(AuthAdmissionRejectedError):
                await worker.run(lambda: None)
    finally:
        release_hash.set()
        release_response.set()
        await asyncio.to_thread(worker.close)
        if process is not None and process.returncode is None:
            process.terminate()
            await asyncio.wait_for(process.wait(), 5)
        server.should_exit = True
        await asyncio.wait_for(serving, 5)
        sock.close()
