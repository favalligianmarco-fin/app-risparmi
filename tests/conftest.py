from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from sync_spese import repository
from sync_spese.config import Settings
from sync_spese.db import connect, migrate


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        application_id="app-1234",
        private_key_path=tmp_path / "chiave.pem",
        api_origin="https://api.enablebanking.test",
        redirect_url="http://localhost:8080/auth_redirect",
        aspsp_name="UniCredit",
        aspsp_country="IT",
        psu_type="personal",
        language="IT",
        consent_days=None,
        psu_ip_address=None,
        psu_user_agent=None,
        user_id="test-user",
        database_path=tmp_path / "spese.sqlite3",
        http_timeout=5.0,
        log_level="WARNING",
    )


@pytest.fixture
def connection(settings: Settings) -> sqlite3.Connection:
    conn = connect(settings.database_path)
    migrate(conn)
    repository.ensure_user(conn, settings.user_id)
    yield conn
    conn.close()


@pytest.fixture
def account_id(connection: sqlite3.Connection, settings: Settings) -> int:
    repository.insert_session(
        connection,
        session_id="sess-1",
        user_id=settings.user_id,
        aspsp_name="UniCredit",
        aspsp_country="IT",
        psu_type="personal",
        authorization_id="auth-1",
        psu_id_hash=None,
        access_valid_until="2099-01-01T00:00:00+00:00",
        access={"valid_until": "2099-01-01T00:00:00+00:00"},
    )
    return repository.upsert_account(
        connection,
        user_id=settings.user_id,
        identification_hash="hash-conto-stabile",
        aspsp_name="UniCredit",
        aspsp_country="IT",
        iban="IT60X0542811101000000999999",
        other_identification=None,
        name="Conto personale",
        product="Genius",
        details=None,
        currency="EUR",
        cash_account_type="CACC",
        usage="PRIV",
        current_uid="uid-sessione-1",
        current_session_id="sess-1",
        raw={"uid": "uid-sessione-1"},
    )
