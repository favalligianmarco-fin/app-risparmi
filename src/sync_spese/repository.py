"""Tutte le scritture e le letture sul database, in un posto solo.

Nessuna di queste funzioni parla con la rete: ricevono dati già normalizzati.
Questo tiene il livello di persistenza testabile con un semplice database in
memoria.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from .db.connection import utc_now

TRANSACTION_COLUMNS: tuple[str, ...] = (
    "user_id",
    "account_id",
    "dedup_key",
    "dedup_source",
    "transaction_id",
    "entry_reference",
    "amount_minor",
    "amount_raw",
    "currency",
    "currency_exponent",
    "credit_debit_indicator",
    "status",
    "is_pending",
    "booking_date",
    "value_date",
    "transaction_date",
    "effective_date",
    "counterparty_name",
    "counterparty_account",
    "remittance_information",
    "reference_number",
    "merchant_category_code",
    "bank_transaction_code",
    "note",
    "balance_after_minor",
    "balance_after_currency",
    "raw_json",
)

# Colonne aggiornate quando un movimento già noto viene rivisto. La chiave di
# deduplica e `first_seen_at` non si toccano mai.
_UPDATABLE_COLUMNS: tuple[str, ...] = tuple(
    column
    for column in TRANSACTION_COLUMNS
    if column not in {"user_id", "account_id", "dedup_key"}
)


# --- utenti -----------------------------------------------------------------


def ensure_user(connection: sqlite3.Connection, user_id: str, label: str | None = None) -> None:
    connection.execute(
        "INSERT INTO users (user_id, label, created_at) VALUES (?, ?, ?) "
        "ON CONFLICT (user_id) DO NOTHING",
        (user_id, label, utc_now()),
    )


# --- sessioni / consenso -----------------------------------------------------


def supersede_active_sessions(connection: sqlite3.Connection, user_id: str) -> int:
    """Marca come superate le sessioni attive.

    Le banche italiane ammettono un solo consenso attivo per intermediario:
    quando se ne apre uno nuovo, il precedente smette di funzionare. Il
    database deve rispecchiarlo, altrimenti `status` mostrerebbe un consenso
    valido che in realtà la banca ha già chiuso.
    """
    cursor = connection.execute(
        "UPDATE bank_sessions SET status = 'SUPERSEDED', closed_at = ? "
        "WHERE user_id = ? AND status = 'ACTIVE'",
        (utc_now(), user_id),
    )
    return cursor.rowcount


def insert_session(
    connection: sqlite3.Connection,
    *,
    session_id: str,
    user_id: str,
    aspsp_name: str,
    aspsp_country: str,
    psu_type: str,
    authorization_id: str | None,
    psu_id_hash: str | None,
    access_valid_until: str,
    access: Mapping[str, Any] | None,
) -> None:
    connection.execute(
        """
        INSERT INTO bank_sessions (
            session_id, user_id, aspsp_name, aspsp_country, psu_type,
            authorization_id, psu_id_hash, access_valid_until, access_json,
            status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        ON CONFLICT (session_id) DO UPDATE SET
            access_valid_until = excluded.access_valid_until,
            access_json        = excluded.access_json,
            status             = 'ACTIVE',
            closed_at          = NULL
        """,
        (
            session_id,
            user_id,
            aspsp_name,
            aspsp_country,
            psu_type,
            authorization_id,
            psu_id_hash,
            access_valid_until,
            json.dumps(dict(access), ensure_ascii=False) if access else None,
            utc_now(),
        ),
    )


def get_active_session(connection: sqlite3.Connection, user_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM bank_sessions WHERE user_id = ? AND status = 'ACTIVE' "
        "ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()


def mark_session_status(
    connection: sqlite3.Connection, session_id: str, status: str
) -> None:
    connection.execute(
        "UPDATE bank_sessions SET status = ?, closed_at = ? WHERE session_id = ?",
        (status, utc_now(), session_id),
    )


def list_sessions(connection: sqlite3.Connection, user_id: str) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM bank_sessions WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()


# --- conti -------------------------------------------------------------------


def upsert_account(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    identification_hash: str,
    aspsp_name: str,
    aspsp_country: str,
    iban: str | None,
    other_identification: str | None,
    name: str | None,
    product: str | None,
    details: str | None,
    currency: str,
    cash_account_type: str | None,
    usage: str | None,
    current_uid: str | None,
    current_session_id: str | None,
    raw: Mapping[str, Any] | None,
) -> int:
    """Inserisce o aggiorna un conto e restituisce il suo id interno.

    L'`uid` di Enable Banking cambia a ogni sessione, quindi non può essere la
    chiave: la chiave naturale è ``(user_id, identification_hash)``, che resta
    stabile fra un consenso e l'altro. L'`uid` corrente è solo un attributo.
    """
    now = utc_now()
    connection.execute(
        """
        INSERT INTO accounts (
            user_id, identification_hash, aspsp_name, aspsp_country, iban,
            other_identification, name, product, details, currency,
            cash_account_type, usage, current_uid, current_session_id, raw_json,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, identification_hash) DO UPDATE SET
            aspsp_name           = excluded.aspsp_name,
            aspsp_country        = excluded.aspsp_country,
            iban                 = COALESCE(excluded.iban, accounts.iban),
            other_identification = COALESCE(excluded.other_identification,
                                            accounts.other_identification),
            name                 = COALESCE(excluded.name, accounts.name),
            product              = COALESCE(excluded.product, accounts.product),
            details              = COALESCE(excluded.details, accounts.details),
            currency             = excluded.currency,
            cash_account_type    = COALESCE(excluded.cash_account_type,
                                            accounts.cash_account_type),
            usage                = COALESCE(excluded.usage, accounts.usage),
            current_uid          = excluded.current_uid,
            current_session_id   = excluded.current_session_id,
            raw_json             = excluded.raw_json,
            updated_at           = excluded.updated_at
        """,
        (
            user_id,
            identification_hash,
            aspsp_name,
            aspsp_country,
            iban,
            other_identification,
            name,
            product,
            details,
            currency,
            cash_account_type,
            usage,
            current_uid,
            current_session_id,
            json.dumps(dict(raw), ensure_ascii=False) if raw else None,
            now,
            now,
        ),
    )
    row = connection.execute(
        "SELECT id FROM accounts WHERE user_id = ? AND identification_hash = ?",
        (user_id, identification_hash),
    ).fetchone()
    return int(row["id"])


def list_accounts(connection: sqlite3.Connection, user_id: str) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM accounts WHERE user_id = ? ORDER BY id", (user_id,)
    ).fetchall()


def get_account(connection: sqlite3.Connection, user_id: str, account_id: int) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM accounts WHERE user_id = ? AND id = ?", (user_id, account_id)
    ).fetchone()


# --- saldi -------------------------------------------------------------------


def insert_balances(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    account_id: int,
    balances: Iterable[Mapping[str, Any]],
) -> int:
    now = utc_now()
    rows = [
        (
            user_id,
            account_id,
            balance["balance_type"],
            balance.get("name"),
            balance["amount_minor"],
            balance["currency"],
            balance.get("reference_date"),
            balance.get("last_change_date_time"),
            now,
            json.dumps(balance.get("raw"), ensure_ascii=False) if balance.get("raw") else None,
        )
        for balance in balances
    ]
    if not rows:
        return 0
    connection.executemany(
        """
        INSERT INTO balances (
            user_id, account_id, balance_type, name, amount_minor, currency,
            reference_date, last_change_date_time, observed_at, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return len(rows)


def latest_balances(
    connection: sqlite3.Connection, user_id: str, account_id: int
) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT * FROM balances
        WHERE user_id = ? AND account_id = ?
          AND observed_at = (
              SELECT MAX(observed_at) FROM balances
              WHERE user_id = ? AND account_id = ?
          )
        ORDER BY balance_type
        """,
        (user_id, account_id, user_id, account_id),
    ).fetchall()


# --- esecuzioni di sincronizzazione -----------------------------------------


def start_sync_run(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    account_id: int | None,
    session_id: str | None,
    kind: str,
    strategy: str | None,
    date_from: str | None,
    date_to: str | None,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO sync_runs (
            user_id, account_id, session_id, kind, strategy,
            date_from, date_to, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
        """,
        (user_id, account_id, session_id, kind, strategy, date_from, date_to, utc_now()),
    )
    return int(cursor.lastrowid)


def update_sync_run(connection: sqlite3.Connection, run_id: int, **fields: Any) -> None:
    if not fields:
        return
    assignments = ", ".join(f"{name} = ?" for name in fields)
    connection.execute(
        f"UPDATE sync_runs SET {assignments} WHERE id = ?", (*fields.values(), run_id)
    )


def finish_sync_run(
    connection: sqlite3.Connection,
    run_id: int,
    *,
    status: str,
    error: str | None = None,
    **counters: Any,
) -> None:
    update_sync_run(
        connection, run_id, status=status, error=error, finished_at=utc_now(), **counters
    )


def last_successful_run(
    connection: sqlite3.Connection, user_id: str, account_id: int
) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM sync_runs WHERE user_id = ? AND account_id = ? AND status = 'completed' "
        "ORDER BY started_at DESC LIMIT 1",
        (user_id, account_id),
    ).fetchone()


# --- pagine grezze -----------------------------------------------------------


def save_raw_page(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    account_id: int,
    sync_run_id: int,
    page_number: int,
    request: Mapping[str, Any],
    payload: Mapping[str, Any],
    transaction_count: int,
    continuation_key: str | None,
) -> int:
    """Salva una pagina così com'è arrivata, prima di qualunque parsing.

    È il punto in cui il backfill diventa recuperabile: se l'ingestione
    fallisce, i dati scaricati nella finestra buona sono già su disco e si
    possono rileggere con `sync-spese reingest`, senza richiamare la banca.
    """
    cursor = connection.execute(
        """
        INSERT INTO raw_transaction_pages (
            user_id, account_id, sync_run_id, page_number, request_json,
            payload_json, transaction_count, continuation_key, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            account_id,
            sync_run_id,
            page_number,
            json.dumps(dict(request), ensure_ascii=False, sort_keys=True),
            json.dumps(dict(payload), ensure_ascii=False),
            transaction_count,
            continuation_key,
            utc_now(),
        ),
    )
    return int(cursor.lastrowid)


def raw_pages_for_run(connection: sqlite3.Connection, sync_run_id: int) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM raw_transaction_pages WHERE sync_run_id = ? ORDER BY page_number",
        (sync_run_id,),
    ).fetchall()


def runs_with_uningested_pages(
    connection: sqlite3.Connection, user_id: str
) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT r.*, COUNT(p.id) AS pending_pages
        FROM sync_runs r
        JOIN raw_transaction_pages p ON p.sync_run_id = r.id
        WHERE r.user_id = ? AND p.ingested_at IS NULL
        GROUP BY r.id
        ORDER BY r.started_at
        """,
        (user_id,),
    ).fetchall()


def mark_pages_ingested(connection: sqlite3.Connection, sync_run_id: int) -> None:
    connection.execute(
        "UPDATE raw_transaction_pages SET ingested_at = ? "
        "WHERE sync_run_id = ? AND ingested_at IS NULL",
        (utc_now(), sync_run_id),
    )


# --- movimenti ---------------------------------------------------------------


def existing_dedup_keys(
    connection: sqlite3.Connection, user_id: str, account_id: int
) -> set[str]:
    rows = connection.execute(
        "SELECT dedup_key FROM transactions WHERE user_id = ? AND account_id = ?",
        (user_id, account_id),
    ).fetchall()
    return {row["dedup_key"] for row in rows}


def upsert_transactions(
    connection: sqlite3.Connection, rows: Sequence[Mapping[str, Any]]
) -> tuple[int, int]:
    """Inserisce o aggiorna i movimenti. Restituisce ``(inseriti, aggiornati)``.

    È l'operazione che rende il sync idempotente: la chiave univoca
    ``(user_id, account_id, dedup_key)`` fa sì che rieseguire dieci volte lo
    stesso fetch non crei duplicati. `first_seen_at` conserva la prima volta
    che il movimento è stato visto, `last_seen_at` l'ultima.
    """
    if not rows:
        return (0, 0)

    now = utc_now()
    columns = (*TRANSACTION_COLUMNS, "first_seen_at", "last_seen_at")
    placeholders = ", ".join("?" for _ in columns)
    updates = ", ".join(f"{name} = excluded.{name}" for name in _UPDATABLE_COLUMNS)

    statement = f"""
        INSERT INTO transactions ({", ".join(columns)})
        VALUES ({placeholders})
        ON CONFLICT (user_id, account_id, dedup_key) DO UPDATE SET
            {updates},
            last_seen_at = excluded.last_seen_at
    """

    # Si legge prima l'insieme delle chiavi già presenti: `ON CONFLICT DO
    # UPDATE` non permette di distinguere un inserimento da un aggiornamento
    # guardando solo il numero di righe modificate.
    account_ids = {int(row["account_id"]) for row in rows}
    user_ids = {str(row["user_id"]) for row in rows}
    known: set[str] = set()
    for user_id in user_ids:
        for account_id in account_ids:
            known |= existing_dedup_keys(connection, user_id, account_id)

    inserted = sum(1 for row in rows if row["dedup_key"] not in known)

    connection.executemany(
        statement,
        [tuple(row[name] for name in TRANSACTION_COLUMNS) + (now, now) for row in rows],
    )
    return inserted, len(rows) - inserted


def delete_stale_pending(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    account_id: int,
    date_from: str | None,
    date_to: str | None,
    seen_keys: Iterable[str],
) -> int:
    """Rimuove i movimenti provvisori che la banca non riporta più.

    Un movimento "in attesa" (PDNG) non è un dato definitivo: quando viene
    contabilizzato la banca lo ripropone come BOOK, spesso con un
    `entry_reference` diverso. Se non si eliminassero i provvisori spariti,
    ogni spesa comparirebbe due volte, una in attesa e una contabilizzata.

    I movimenti contabilizzati non vengono mai cancellati.
    """
    keys = list(seen_keys)
    connection.execute("CREATE TEMP TABLE IF NOT EXISTS _seen_keys (dedup_key TEXT PRIMARY KEY)")
    connection.execute("DELETE FROM _seen_keys")
    if keys:
        connection.executemany(
            "INSERT OR IGNORE INTO _seen_keys (dedup_key) VALUES (?)", [(key,) for key in keys]
        )

    conditions = ["user_id = ?", "account_id = ?", "is_pending = 1"]
    params: list[Any] = [user_id, account_id]
    if date_from:
        conditions.append("(effective_date IS NULL OR effective_date >= ?)")
        params.append(date_from)
    if date_to:
        conditions.append("(effective_date IS NULL OR effective_date <= ?)")
        params.append(date_to)

    cursor = connection.execute(
        f"DELETE FROM transactions WHERE {' AND '.join(conditions)} "
        f"AND dedup_key NOT IN (SELECT dedup_key FROM _seen_keys)",
        params,
    )
    removed = cursor.rowcount
    connection.execute("DELETE FROM _seen_keys")
    return max(removed, 0)


def transaction_stats(
    connection: sqlite3.Connection, user_id: str, account_id: int
) -> sqlite3.Row:
    return connection.execute(
        """
        SELECT
            COUNT(*)                                          AS total,
            SUM(CASE WHEN is_pending = 1 THEN 1 ELSE 0 END)   AS pending,
            MIN(effective_date)                               AS first_date,
            MAX(effective_date)                               AS last_date,
            SUM(CASE WHEN amount_minor < 0 THEN amount_minor ELSE 0 END) AS outflow_minor,
            SUM(CASE WHEN amount_minor > 0 THEN amount_minor ELSE 0 END) AS inflow_minor
        FROM transactions
        WHERE user_id = ? AND account_id = ?
        """,
        (user_id, account_id),
    ).fetchone()


def dedup_source_breakdown(
    connection: sqlite3.Connection, user_id: str, account_id: int
) -> list[sqlite3.Row]:
    return connection.execute(
        "SELECT dedup_source, COUNT(*) AS n FROM transactions "
        "WHERE user_id = ? AND account_id = ? GROUP BY dedup_source ORDER BY n DESC",
        (user_id, account_id),
    ).fetchall()
