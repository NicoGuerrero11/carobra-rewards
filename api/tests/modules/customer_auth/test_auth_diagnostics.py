import logging
import ssl
from time import monotonic

import pytest
from sqlalchemy.exc import OperationalError

from carobra_rewards.modules.customer_auth.application.models import CustomerAuthPersistenceError
from carobra_rewards.modules.customer_auth.infrastructure.diagnostics import log_auth_failure


@pytest.mark.parametrize("kind", ["timeout", "sql", "ssl", "connection"])
def test_diagnostic_categories_never_include_exception_contents(caplog, kind):
    marker = "sensitive-account-token-connection-data"
    causes = {
        "timeout": TimeoutError(marker),
        "sql": OperationalError(marker, {"secret": marker}, Exception(marker)),
        "ssl": OperationalError(marker, {"secret": marker}, ssl.SSLError(marker)),
        "connection": ConnectionRefusedError(marker),
    }
    error = CustomerAuthPersistenceError()
    error.__cause__ = causes[kind]
    with caplog.at_level(logging.WARNING):
        log_auth_failure(error, stage="admission", started=monotonic())
    assert marker not in caplog.text
    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.exc_info is None
    assert record.stack_info is None
    assert record.getMessage().startswith(
        f"auth_failure stage=admission category={kind} duration_ms="
    )
