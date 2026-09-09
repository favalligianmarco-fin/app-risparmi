"""Scarico dei movimenti e loro ingestione in database.

L'operazione è divisa in due fasi distinte, e non è un dettaglio:

1. **fetch** — chiama la banca e salva ogni pagina *grezza* in
   ``raw_transaction_pages``, una commit per pagina;
2. **ingest** — rilegge quelle pagine, normalizza e scrive in
   ``transactions``, in un'unica transazione.

La risorsa scarsa è la finestra di circa un'ora dopo il consenso in cui la
banca espone tutto lo storico: passata quella si torna a ~90 giorni. Se
l'ingestione fallisse a metà con i dati solo in memoria, quella finestra
sarebbe bruciata. Separando le fasi, un errore di parsing costa una
`sync-spese reingest` — non una nuova SCA.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .. import repository
from ..config import Settings
from ..db.connection import transaction
from ..domain.dedup import assign_keys
from ..domain.money import to_minor_units
from ..domain.normalize import normalize_transaction
from ..eb.client import EnableBankingClient
from ..errors import ApiError, SyncSpeseError

logger = logging.getLogger(__name__)

STRATEGY_LONGEST = "longest"
STRATEGY_DEFAULT = "default"

# Se la banca rifiuta il periodo richiesto si riprova con finestre via via più
# corte, invece di arrendersi: meglio 90 giorni che niente.
PERIOD_FALLBACK_DAYS: tuple[int, ...] = (730, 365, 180, 90)


@dataclass
class SyncResult:
    account_id: int
    account_label: str
    run_id: int
    pages: int = 0
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    removed: int = 0
    date_from: str | None = None
    date_to: str | None = None
    warnings: list[str] = field(default_factory=list)


def _account_label(account: sqlite3.Row) -> str:
    return account["iban"] or account["name"] or account["identification_hash"][:12]


def _require_uid(account: sqlite3.Row) -> str:
    uid = account["current_uid"]
    if not uid:
        raise SyncSpeseError(
            f"Il conto {_account_label(account)} non ha un uid di sessione. "
            f"Esegui `sync-spese auth` per ottenere un consenso valido."
        )
    return str(uid)


# --- fase 1: scarico ---------------------------------------------------------


def fetch_pages(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    account: sqlite3.Row,
    run_id: int,
    date_from: date | None,
    date_to: date | None,
    strategy: str,
) -> tuple[int, int, date | None]:
    """Scarica tutte le pagine e le salva grezze.

    Restituisce ``(pagine, movimenti, date_from_effettiva)``. Ogni pagina
    viene committata appena arriva: un'interruzione a metà lascia comunque
    tutto ciò che era già stato scaricato.
    """
    uid = _require_uid(account)
    account_id = int(account["id"])
    attempts: list[date | None] = [date_from]
    if strategy == STRATEGY_LONGEST:
        today = date.today()
        for days in PERIOD_FALLBACK_DAYS:
            candidate = today - timedelta(days=days)
            if date_from is None or candidate > date_from:
                attempts.append(candidate)

    last_error: ApiError | None = None

    for attempt_index, attempt_from in enumerate(attempts):
        pages = 0
        fetched = 0
        try:
            for page_number, request, page in client.iter_transaction_pages(
                uid, date_from=attempt_from, date_to=date_to, strategy=strategy
            ):
                repository.save_raw_page(
                    connection,
                    user_id=settings.user_id,
                    account_id=account_id,
                    sync_run_id=run_id,
                    page_number=page_number,
                    request=request,
                    payload=page.model_dump(),
                    transaction_count=len(page.transactions),
                    continuation_key=page.continuation_key,
                )
                pages = page_number
                fetched += len(page.transactions)
                logger.info(
                    "Pagina %s: %s movimenti (totale %s)%s",
                    page_number,
                    len(page.transactions),
                    fetched,
                    " — continuo" if page.continuation_key else " — ultima",
                )
                repository.update_sync_run(
                    connection, run_id, pages=pages, fetched=fetched
                )
            return pages, fetched, attempt_from

        except ApiError as exc:
            last_error = exc
            # Periodo troppo ampio: si riprova più corti, ma solo se non è
            # già arrivato nulla (altrimenti si mescolerebbero due finestre).
            if exc.is_wrong_period and pages == 0 and attempt_index + 1 < len(attempts):
                logger.warning(
                    "La banca ha rifiutato il periodo richiesto (%s). Riprovo dal %s.",
                    exc.error_code,
                    attempts[attempt_index + 1],
                )
                continue
            if exc.is_rate_limited:
                raise SyncSpeseError(
                    "La banca ha applicato il rate limit (spesso 4 chiamate al giorno "
                    "per conto sulle richieste in background). Riprova più tardi, "
                    "oppure configura EB_PSU_IP_ADDRESS e EB_PSU_USER_AGENT per le "
                    "chiamate con utente presente."
                ) from exc
            if exc.is_expired_session or exc.is_session_gone:
                raise SyncSpeseError(
                    "Il consenso non è più valido: serve una nuova autenticazione "
                    "con `sync-spese auth`."
                ) from exc
            raise

    raise last_error or SyncSpeseError("Nessun periodo utilizzabile per lo scarico.")


# --- fase 2: ingestione ------------------------------------------------------


def ingest_run(
    connection: sqlite3.Connection,
    settings: Settings,
    *,
    run_id: int,
    prune_pending: bool = True,
) -> tuple[int, int, int]:
    """Normalizza e scrive le pagine grezze di una esecuzione.

    Restituisce ``(inseriti, aggiornati, rimossi)``. Tutto avviene in una sola
    transazione: o l'esecuzione entra intera, o non entra affatto.
    """
    run = connection.execute("SELECT * FROM sync_runs WHERE id = ?", (run_id,)).fetchone()
    if run is None:
        raise SyncSpeseError(f"Esecuzione {run_id} inesistente.")

    pages = repository.raw_pages_for_run(connection, run_id)
    if not pages:
        return (0, 0, 0)

    # I movimenti di tutte le pagine vanno trattati come un unico lotto: la
    # numerazione dei duplicati indistinguibili deve tener conto anche di
    # quelli che stanno su pagine diverse.
    by_account: dict[int, list[dict[str, Any]]] = {}
    for page in pages:
        payload = json.loads(page["payload_json"])
        account_id = int(page["account_id"])
        by_account.setdefault(account_id, []).extend(payload.get("transactions") or [])

    inserted = updated = removed = 0

    with transaction(connection):
        for account_id, raw_transactions in by_account.items():
            account = repository.get_account(connection, settings.user_id, account_id)
            if account is None:
                raise SyncSpeseError(f"Conto {account_id} non trovato in database.")

            account_key = account["identification_hash"]
            keys = assign_keys(raw_transactions, account_key=account_key)

            rows: list[dict[str, Any]] = []
            for raw, (dedup_key, dedup_source) in zip(raw_transactions, keys, strict=True):
                rows.append(
                    normalize_transaction(
                        raw,
                        dedup_key=dedup_key,
                        dedup_source=dedup_source,
                        account_id=account_id,
                        user_id=settings.user_id,
                    )
                )

            page_inserted, page_updated = repository.upsert_transactions(connection, rows)
            inserted += page_inserted
            updated += page_updated

            if prune_pending:
                removed += repository.delete_stale_pending(
                    connection,
                    user_id=settings.user_id,
                    account_id=account_id,
                    date_from=run["date_from"],
                    date_to=run["date_to"],
                    seen_keys=[row["dedup_key"] for row in rows],
                )

        repository.mark_pages_ingested(connection, run_id)

    return inserted, updated, removed


# --- saldi -------------------------------------------------------------------


def sync_balances(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    account: sqlite3.Row,
) -> int:
    """Registra una fotografia dei saldi. Utile per riconciliare i movimenti."""
    uid = _require_uid(account)
    response = client.get_account_balances(uid)
    entries = []
    for balance in response.balances:
        currency = balance.balance_amount.currency
        entries.append(
            {
                "balance_type": balance.balance_type,
                "name": balance.name,
                "amount_minor": to_minor_units(balance.balance_amount.amount, currency),
                "currency": currency,
                "reference_date": balance.reference_date,
                "last_change_date_time": balance.last_change_date_time,
                "raw": balance.model_dump(),
            }
        )
    with transaction(connection):
        return repository.insert_balances(
            connection,
            user_id=settings.user_id,
            account_id=int(account["id"]),
            balances=entries,
        )


# --- operazioni complete -----------------------------------------------------


def run_sync(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    account: sqlite3.Row,
    session_id: str | None,
    kind: str,
    strategy: str,
    date_from: date | None,
    date_to: date | None,
    with_balances: bool = True,
) -> SyncResult:
    """Esegue un ciclo completo scarico + ingestione per un conto."""
    account_id = int(account["id"])
    run_id = repository.start_sync_run(
        connection,
        user_id=settings.user_id,
        account_id=account_id,
        session_id=session_id,
        kind=kind,
        strategy=strategy,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
    )
    result = SyncResult(
        account_id=account_id, account_label=_account_label(account), run_id=run_id
    )

    try:
        pages, fetched, effective_from = fetch_pages(
            connection,
            client,
            settings,
            account=account,
            run_id=run_id,
            date_from=date_from,
            date_to=date_to,
            strategy=strategy,
        )
    except BaseException as exc:
        repository.finish_sync_run(connection, run_id, status="failed", error=str(exc))
        raise

    result.pages, result.fetched = pages, fetched
    result.date_from = effective_from.isoformat() if effective_from else None
    result.date_to = date_to.isoformat() if date_to else None
    repository.update_sync_run(
        connection,
        run_id,
        status="fetched",
        pages=pages,
        fetched=fetched,
        date_from=result.date_from,
    )

    if with_balances:
        try:
            sync_balances(connection, client, settings, account=account)
        except SyncSpeseError as exc:
            # I saldi sono un extra: non devono far fallire l'ingestione dei
            # movimenti, che è la cosa per cui esiste il comando.
            result.warnings.append(f"Saldi non recuperati: {exc}")
            logger.warning("Saldi non recuperati per %s: %s", result.account_label, exc)

    try:
        inserted, updated, removed = ingest_run(connection, settings, run_id=run_id)
    except BaseException as exc:
        repository.finish_sync_run(
            connection, run_id, status="failed", error=f"ingestione: {exc}"
        )
        raise SyncSpeseError(
            f"Lo scarico è riuscito ({fetched} movimenti salvati grezzi) ma "
            f"l'ingestione è fallita: {exc}\n"
            f"I dati non sono persi: correggi il problema ed esegui "
            f"`sync-spese reingest`."
        ) from exc

    result.inserted, result.updated, result.removed = inserted, updated, removed
    repository.finish_sync_run(
        connection,
        run_id,
        status="completed",
        inserted=inserted,
        updated=updated,
        removed=removed,
    )
    return result


def backfill(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    account: sqlite3.Row,
    session_id: str | None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> SyncResult:
    """Scarico iniziale: tutto lo storico che la banca è disposta a dare.

    Usa ``strategy=longest``, che è quella pensata per il primo scarico. Va
    lanciata subito dopo l'autorizzazione: la finestra in cui la banca espone
    più di 90 giorni dura circa un'ora.
    """
    return run_sync(
        connection,
        client,
        settings,
        account=account,
        session_id=session_id,
        kind="backfill",
        strategy=STRATEGY_LONGEST,
        date_from=date_from,
        date_to=date_to,
    )


def incremental(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    account: sqlite3.Row,
    session_id: str | None,
    days: int = 14,
    date_to: date | None = None,
) -> SyncResult:
    """Aggiornamento periodico: solo la coda recente, con ``strategy=default``.

    La finestra parte qualche giorno indietro rispetto all'ultimo movimento
    noto perché le banche contabilizzano in ritardo e possono riscrivere i
    movimenti provvisori.
    """
    start = date.today() - timedelta(days=max(days, 1))
    return run_sync(
        connection,
        client,
        settings,
        account=account,
        session_id=session_id,
        kind="incremental",
        strategy=STRATEGY_DEFAULT,
        date_from=start,
        date_to=date_to,
    )
