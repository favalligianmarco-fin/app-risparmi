"""Migrazioni dello schema."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from sync_spese.db import connect, migrate
from sync_spese.db.migrator import applied_migrations, discover, pending_migrations
from sync_spese.errors import MigrationError


def test_le_migrazioni_esistono():
    assert discover(), "nessun file .sql trovato"


def test_applicazione_e_ripetibile(tmp_path: Path):
    conn = connect(tmp_path / "a.sqlite3")
    prima = migrate(conn)
    assert prima
    assert migrate(conn) == [], "una seconda esecuzione non deve riapplicare nulla"
    assert pending_migrations(conn) == []


def test_registra_versione_e_checksum(tmp_path: Path):
    conn = connect(tmp_path / "b.sqlite3")
    migrate(conn)
    registro = applied_migrations(conn)
    assert set(registro) == {version for version, _ in discover()}
    assert all(len(checksum) == 64 for checksum in registro.values())


def test_crea_tutte_le_tabelle(tmp_path: Path):
    conn = connect(tmp_path / "c.sqlite3")
    migrate(conn)
    tabelle = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {
        "users",
        "bank_sessions",
        "accounts",
        "balances",
        "transactions",
        "raw_transaction_pages",
        "sync_runs",
        "schema_migrations",
    } <= tabelle


def test_ogni_tabella_dati_ha_user_id(tmp_path: Path):
    # Requisito esplicito: user_id fin dal primo giorno, ovunque.
    conn = connect(tmp_path / "d.sqlite3")
    migrate(conn)
    for tabella in (
        "bank_sessions",
        "accounts",
        "balances",
        "transactions",
        "raw_transaction_pages",
        "sync_runs",
    ):
        colonne = {row[1] for row in conn.execute(f"PRAGMA table_info({tabella})")}
        assert "user_id" in colonne, f"{tabella} non ha user_id"


def test_una_migrazione_modificata_viene_rilevata(tmp_path: Path):
    cartella = tmp_path / "mig"
    cartella.mkdir()
    (cartella / "001_x.sql").write_text("CREATE TABLE x (a INT);")
    conn = connect(tmp_path / "e.sqlite3")
    migrate(conn, cartella)

    (cartella / "001_x.sql").write_text("CREATE TABLE x (a INT, b INT);")
    with pytest.raises(MigrationError, match="modificata"):
        migrate(conn, cartella)


def test_una_migrazione_fallita_non_lascia_lo_schema_a_meta(tmp_path: Path):
    cartella = tmp_path / "mig"
    cartella.mkdir()
    (cartella / "001_rotta.sql").write_text(
        "CREATE TABLE buona (a INT);\nCREATE TABLE buona (b INT);"
    )
    conn = connect(tmp_path / "f.sqlite3")
    with pytest.raises(sqlite3.OperationalError):
        migrate(conn, cartella)

    tabelle = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "buona" not in tabelle
    assert applied_migrations(conn) == {}


def test_chiave_univoca_sui_movimenti(tmp_path: Path):
    conn = connect(tmp_path / "g.sqlite3")
    migrate(conn)
    indici = [
        row[0]
        for row in conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='transactions' "
            "AND sql IS NOT NULL"
        )
    ]
    definizione = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'"
    ).fetchone()[0]
    assert "UNIQUE (user_id, account_id, dedup_key)" in definizione or any(
        "dedup_key" in (indice or "") for indice in indici
    )
