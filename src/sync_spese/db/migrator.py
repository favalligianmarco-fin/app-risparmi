"""Migrazioni: file .sql numerati, applicati una sola volta e in ordine.

Volutamente minimale — niente ORM, niente downgrade. Quello che serve è
sapere con certezza a quale versione dello schema corrisponde un database, e
accorgersi se una migrazione già applicata è stata modificata a posteriori.
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

from ..errors import MigrationError
from .connection import utc_now

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TEXT NOT NULL
)
"""


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def discover(directory: Path | None = None) -> list[tuple[str, Path]]:
    """Elenco ordinato di ``(versione, percorso)`` delle migrazioni su disco."""
    base = directory or MIGRATIONS_DIR
    files = sorted(base.glob("*.sql"), key=lambda p: p.name)
    return [(path.stem, path) for path in files]


def applied_migrations(connection: sqlite3.Connection) -> dict[str, str]:
    """Versioni già applicate, mappate al loro checksum."""
    connection.execute(_CREATE_TABLE)
    rows = connection.execute("SELECT version, checksum FROM schema_migrations").fetchall()
    return {row["version"]: row["checksum"] for row in rows}


def pending_migrations(
    connection: sqlite3.Connection, directory: Path | None = None
) -> list[tuple[str, Path]]:
    """Migrazioni non ancora applicate, in ordine."""
    applied = applied_migrations(connection)
    return [item for item in discover(directory) if item[0] not in applied]


def migrate(connection: sqlite3.Connection, directory: Path | None = None) -> list[str]:
    """Applica le migrazioni mancanti. Restituisce le versioni applicate ora.

    Ogni migrazione gira nella propria transazione: se una fallisce, quelle
    precedenti restano applicate e il database non resta a metà di un file.
    """
    applied = applied_migrations(connection)

    for version, path in discover(directory):
        sql = path.read_text(encoding="utf-8")
        current = _checksum(sql)
        previous = applied.get(version)
        if previous is not None and previous != current:
            raise MigrationError(
                f"La migrazione {version} è stata modificata dopo essere stata applicata "
                f"(checksum {previous[:12]}… → {current[:12]}…). "
                f"Non modificare le migrazioni già eseguite: aggiungine una nuova."
            )

    newly_applied: list[str] = []
    for version, path in discover(directory):
        if version in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            # `executescript` fa un COMMIT implicito di qualunque transazione
            # aperta prima di partire: la transazione va quindi aperta dentro
            # lo script stesso, non prima con `execute("BEGIN")`.
            connection.executescript("BEGIN IMMEDIATE;\n" + sql)
            connection.execute(
                "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)",
                (version, _checksum(sql), utc_now()),
            )
            connection.execute("COMMIT")
        except BaseException:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        newly_applied.append(version)

    return newly_applied
