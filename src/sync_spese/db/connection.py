"""Connessione a SQLite con impostazioni sensate per un'app locale."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    """Istante corrente come stringa ISO 8601 in UTC.

    Si usa sempre UTC: l'ora legale altrimenti rende non monotone le date di
    sincronizzazione due volte l'anno.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(database_path: Path | str) -> sqlite3.Connection:
    """Apre il database, creando la cartella se manca."""
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, isolation_level=None, timeout=30.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    # WAL: permette di leggere il database (per esempio da un client SQLite)
    # mentre un sync sta scrivendo.
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


@contextmanager
def transaction(connection: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Blocco atomico esplicito.

    La connessione è in autocommit (``isolation_level=None``), quindi le
    transazioni si aprono a mano: così è chiaro nel codice dove comincia e
    dove finisce un'unità di lavoro.
    """
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
    except BaseException:
        connection.execute("ROLLBACK")
        raise
    connection.execute("COMMIT")
