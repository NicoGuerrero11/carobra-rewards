"""Real asyncpg TLS against an ephemeral local PostgreSQL-wire peer, never Neon."""

import asyncio
import shutil
import ssl
import struct
import subprocess
from contextlib import suppress
from pathlib import Path

import pytest
from sqlalchemy import event

from carobra_rewards.infrastructure.database.engine import create_database_engine


@pytest.fixture(scope="module")
def certificates(tmp_path_factory):
    directory = tmp_path_factory.mktemp("database-tls")

    def openssl(*args):
        subprocess.run(["openssl", *args], cwd=directory, check=True, capture_output=True)

    openssl(
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        "ca.key",
        "-out",
        "ca.pem",
        "-days",
        "1",
        "-subj",
        "/CN=Ephemeral test CA",
        "-addext",
        "basicConstraints=critical,CA:TRUE",
        "-addext",
        "keyUsage=critical,keyCertSign,cRLSign",
    )
    openssl(
        "req",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        "server.key",
        "-out",
        "server.csr",
        "-subj",
        "/CN=localhost",
    )
    (directory / "extensions").write_text(
        "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n"
    )
    (directory / "wrong-extensions").write_text(
        "subjectAltName=DNS:wrong.example\nextendedKeyUsage=serverAuth\n"
    )
    for name in ["valid", "mismatch"]:
        openssl(
            "x509",
            "-req",
            "-in",
            "server.csr",
            "-CA",
            "ca.pem",
            "-CAkey",
            "ca.key",
            "-CAcreateserial",
            "-out",
            f"{name}.pem",
            "-days",
            "1",
            "-extfile",
            "extensions" if name == "valid" else "wrong-extensions",
        )
    (directory / "index").write_text("")
    (directory / "serial").write_text("01\n")
    (directory / "ca.conf").write_text(
        "[ca]\ndefault_ca=test\n[test]\ndatabase=index\nnew_certs_dir=.\n"
        "certificate=ca.pem\nprivate_key=ca.key\nserial=serial\npolicy=policy\n"
        "[policy]\ncommonName=supplied\n[leaf]\n"
        "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n"
    )
    openssl(
        "ca",
        "-batch",
        "-config",
        "ca.conf",
        "-in",
        "server.csr",
        "-out",
        "expired.pem",
        "-startdate",
        "20000101000000Z",
        "-enddate",
        "20010101000000Z",
        "-extensions",
        "leaf",
        "-md",
        "sha256",
    )
    yield directory
    shutil.rmtree(directory)


@pytest.mark.parametrize(
    "scenario", ["valid", "valid-dns", "untrusted", "expired", "mismatch", "refuses-tls"]
)
async def test_asyncpg_rejects_invalid_tls_before_startup_or_password(
    certificates: Path, monkeypatch, scenario: str
) -> None:
    if scenario != "untrusted":
        monkeypatch.setenv("SSL_CERT_FILE", str(certificates / "ca.pem"))
    else:
        monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.setenv("PGSSLMODE", "disable")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    cert_name = scenario if scenario in {"expired", "mismatch"} else "valid"
    context.load_cert_chain(certificates / f"{cert_name}.pem", certificates / "server.key")
    startup = []
    passwords = []
    negotiations = []
    tasks = set()

    async def peer(reader, writer):
        try:
            negotiations.append(await reader.readexactly(8))
            if scenario == "refuses-tls":
                writer.write(b"N")
                await writer.drain()
                return
            writer.write(b"S")
            await writer.drain()
            await writer.start_tls(context)
            size = struct.unpack("!I", await reader.readexactly(4))[0]
            startup.append(await reader.readexactly(size - 4))
            writer.write(b"R" + struct.pack("!II", 8, 3))
            await writer.drain()
            assert await reader.readexactly(1) == b"p"
            size = struct.unpack("!I", await reader.readexactly(4))[0]
            passwords.append(await reader.readexactly(size - 4))
            # AuthenticationOk, server version and ReadyForQuery, enough for asyncpg.
            writer.write(b"R" + struct.pack("!II", 8, 0))
            parameter = b"server_version\x0016.0\x00"
            writer.write(b"S" + struct.pack("!I", 4 + len(parameter)) + parameter)
            writer.write(b"Z" + struct.pack("!I", 5) + b"I")
            await writer.drain()
            assert await reader.readexactly(5) == b"X\x00\x00\x00\x04"
        except (ssl.SSLError, ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            writer.close()
            with suppress(ssl.SSLError, ConnectionError):
                await writer.wait_closed()

    def connected(reader, writer):
        task = asyncio.create_task(peer(reader, writer))
        tasks.add(task)

    server = await asyncio.start_server(connected, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    host = "localhost" if scenario in {"valid-dns", "mismatch"} else "127.0.0.1"
    engine = create_database_engine(
        f"postgres://tls-test-user:tls-test-password@{host}:{port}/test?sslmode=verify-full"
    )
    driver_connected = False

    class DriverConnectedError(Exception):
        pass

    # Stop before SQLAlchemy runs initialization SQL: exercise its actual dialect
    # connect and asyncpg authentication using the factory's unchanged TLS arguments.
    @event.listens_for(engine.sync_engine, "do_connect")
    def connect_driver(dialect, _record, args, params):
        nonlocal driver_connected
        connection = dialect.connect(*args, **params)
        driver_connected = True
        connection.close()
        raise DriverConnectedError

    try:
        expected = DriverConnectedError if scenario in {"valid", "valid-dns"} else Exception
        with pytest.raises(expected) as error:
            await asyncio.wait_for(engine.connect(), timeout=3)
        if scenario in {"valid", "valid-dns"}:
            assert driver_connected
            assert passwords == [b"tls-test-password\x00"]
            assert b"tls-test-user" in startup[0]
        else:
            assert not driver_connected
            assert not passwords
            assert not startup
            message = str(error.value)
            if scenario == "refuses-tls":
                assert "rejected SSL upgrade" in message
            else:
                assert isinstance(error.value, ssl.SSLCertVerificationError)
                if scenario == "expired":
                    assert "expired" in message
                if scenario == "mismatch":
                    assert "mismatch" in message
        assert negotiations == [struct.pack("!II", 8, 80877103)]
    finally:
        await engine.dispose()
        server.close()
        await server.wait_closed()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
