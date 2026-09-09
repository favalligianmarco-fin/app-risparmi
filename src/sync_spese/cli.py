"""Interfaccia a riga di comando.

Un comando per ogni operazione che ha senso come atto separato:

* ``init``       prepara il database
* ``banks``      elenca le banche disponibili (per trovare il nome esatto)
* ``auth``       ottiene il consenso con SCA e salva la sessione
* ``backfill``   scarico iniziale dello storico più lungo disponibile
* ``sync``       aggiornamento incrementale
* ``status``     quanto manca alla scadenza del consenso, e cosa c'è in database
* ``accounts``   conti collegati
* ``show``       ultimi movimenti, per verificare a colpo d'occhio
* ``reingest``   ri-elabora le pagine grezze già scaricate
* ``logout``     chiude la sessione presso la banca
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from datetime import date

from . import repository
from .config import Settings, load_settings
from .db import connect, migrate, pending_migrations
from .domain.consent import status_for
from .domain.money import format_minor_units
from .eb.client import EnableBankingClient
from .eb.jwt_auth import JwtSigner
from .errors import SyncSpeseError
from .services import authorize as authorize_service
from .services import ingest as ingest_service

logger = logging.getLogger("sync_spese")


# --- infrastruttura ----------------------------------------------------------


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _open_database(settings: Settings, *, require_migrated: bool = True) -> sqlite3.Connection:
    connection = connect(settings.database_path)
    if require_migrated and pending_migrations(connection):
        connection.close()
        raise SyncSpeseError(
            "Il database non è aggiornato. Esegui prima `sync-spese init`."
        )
    return connection


def _make_client(settings: Settings) -> EnableBankingClient:
    signer = JwtSigner(settings.application_id, settings.read_private_key)
    return EnableBankingClient(
        api_origin=settings.api_origin,
        signer=signer,
        timeout=settings.http_timeout,
        psu_headers=settings.psu_headers,
    )


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SyncSpeseError(f"Data non valida: {value!r}. Usa il formato AAAA-MM-GG.") from exc


def _selected_accounts(
    connection: sqlite3.Connection, settings: Settings, account_id: int | None
) -> list[sqlite3.Row]:
    accounts = repository.list_accounts(connection, settings.user_id)
    if not accounts:
        raise SyncSpeseError(
            "Nessun conto collegato. Esegui prima `sync-spese auth`."
        )
    if account_id is None:
        return accounts
    chosen = [account for account in accounts if int(account["id"]) == account_id]
    if not chosen:
        available = ", ".join(str(account["id"]) for account in accounts)
        raise SyncSpeseError(f"Conto {account_id} inesistente. Disponibili: {available}.")
    return chosen


def _active_session_or_fail(
    connection: sqlite3.Connection, settings: Settings
) -> sqlite3.Row:
    session = repository.get_active_session(connection, settings.user_id)
    if session is None:
        raise SyncSpeseError("Nessun consenso attivo. Esegui `sync-spese auth`.")
    consent = status_for(session["access_valid_until"])
    if consent.is_expired:
        repository.mark_session_status(connection, session["session_id"], "EXPIRED")
        raise SyncSpeseError(
            f"Il consenso è scaduto ({consent.describe()}). "
            f"Serve una nuova autenticazione: `sync-spese auth`."
        )
    if consent.needs_attention:
        logger.warning("Attenzione: il consenso è %s.", consent.describe())
    return session


def _print_result(result: ingest_service.SyncResult) -> None:
    print(
        f"  {result.account_label}: {result.fetched} movimenti letti in {result.pages} pagine "
        f"→ {result.inserted} nuovi, {result.updated} aggiornati"
        + (f", {result.removed} provvisori rimossi" if result.removed else "")
    )
    for warning in result.warnings:
        print(f"    ! {warning}")


# --- comandi -----------------------------------------------------------------


def cmd_init(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings, require_migrated=False)
    try:
        applied = migrate(connection)
        repository.ensure_user(connection, settings.user_id)
        if applied:
            print(f"Migrazioni applicate: {', '.join(applied)}")
        else:
            print("Database già aggiornato.")
        print(f"Database: {settings.database_path}")
        print(f"Utente:   {settings.user_id}")
    finally:
        connection.close()
    return 0


def cmd_banks(args: argparse.Namespace, settings: Settings) -> int:
    country = (args.country or settings.aspsp_country or "IT").upper()
    with _make_client(settings) as client:
        aspsps = client.get_aspsps(country=country, psu_type=settings.psu_type)

    needle = (args.search or "").casefold()
    matches = [a for a in aspsps if needle in a.name.casefold()] if needle else aspsps
    if not matches:
        print(f"Nessuna banca trovata in {country} per {args.search!r}.")
        return 1

    print(f"{len(matches)} banche in {country} (psu_type={settings.psu_type}):\n")
    for aspsp in sorted(matches, key=lambda a: a.name):
        validity = aspsp.maximum_consent_validity
        days = f"{validity // 86400} gg" if validity else "n/d"
        flags = []
        if aspsp.beta:
            flags.append("beta")
        if aspsp.required_psu_headers:
            flags.append("header PSU: " + ",".join(aspsp.required_psu_headers))
        suffix = f"  [{'; '.join(flags)}]" if flags else ""
        print(f"  {aspsp.name:<40} consenso max {days:>7}{suffix}")
    print(
        "\nCopia il nome esatto in EB_ASPSP_NAME: deve coincidere carattere per carattere."
    )
    return 0


def cmd_auth(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        existing = repository.get_active_session(connection, settings.user_id)
        if existing and not args.yes:
            consent = status_for(existing["access_valid_until"])
            print(
                f"Esiste già un consenso attivo per {existing['aspsp_name']} "
                f"({consent.describe()})."
            )
            print(
                "Le banche italiane ammettono un solo consenso attivo per intermediario: "
                "aprirne uno nuovo invaliderà quello esistente."
            )
            if input("Procedere comunque? [s/N] ").strip().lower() not in {"s", "si", "sì"}:
                print("Annullato.")
                return 1

        with _make_client(settings) as client:
            outcome = authorize_service.authorize(
                connection,
                client,
                settings,
                aspsp_name=args.bank,
                aspsp_country=args.country,
                open_browser=not args.no_browser,
                timeout=args.timeout,
            )

            consent = status_for(outcome.session.access.valid_until)
            print()
            print(f"Consenso ottenuto. Sessione {outcome.session.session_id}")
            print(f"Scadenza: {consent.valid_until.isoformat()} ({consent.describe()})")
            print(f"Conti collegati: {len(outcome.account_ids)}")
            if outcome.superseded:
                print(f"Sessioni precedenti marcate come superate: {outcome.superseded}")

            print()
            print("=" * 72)
            print("ADESSO, NON FRA UN'ORA: esegui il backfill.")
            print("Lo storico completo è esposto dalla banca solo per circa un'ora")
            print("dopo il consenso; dopo si torna a ~90 giorni.")
            print("    sync-spese backfill")
            print("=" * 72)

            if args.backfill:
                print()
                return _run_backfill(connection, client, settings, args)
    finally:
        connection.close()
    return 0


def _run_backfill(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    args: argparse.Namespace,
) -> int:
    session = _active_session_or_fail(connection, settings)
    accounts = _selected_accounts(connection, settings, getattr(args, "account", None))
    date_from = _parse_date(getattr(args, "date_from", None))
    date_to = _parse_date(getattr(args, "date_to", None))

    print(f"Backfill di {len(accounts)} conto/i (strategy=longest)…")
    failures = 0
    for account in accounts:
        try:
            result = ingest_service.backfill(
                connection,
                client,
                settings,
                account=account,
                session_id=session["session_id"],
                date_from=date_from,
                date_to=date_to,
            )
            _print_result(result)
        except SyncSpeseError as exc:
            failures += 1
            print(f"  ERRORE su {account['iban'] or account['id']}: {exc}", file=sys.stderr)
    return 1 if failures else 0


def cmd_backfill(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        with _make_client(settings) as client:
            return _run_backfill(connection, client, settings, args)
    finally:
        connection.close()


def cmd_sync(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        session = _active_session_or_fail(connection, settings)
        accounts = _selected_accounts(connection, settings, args.account)
        print(f"Sync incrementale, ultimi {args.days} giorni…")
        failures = 0
        with _make_client(settings) as client:
            for account in accounts:
                try:
                    result = ingest_service.incremental(
                        connection,
                        client,
                        settings,
                        account=account,
                        session_id=session["session_id"],
                        days=args.days,
                    )
                    _print_result(result)
                except SyncSpeseError as exc:
                    failures += 1
                    print(
                        f"  ERRORE su {account['iban'] or account['id']}: {exc}",
                        file=sys.stderr,
                    )
        return 1 if failures else 0
    finally:
        connection.close()


def cmd_status(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        print(f"Database: {settings.database_path}")
        print(f"Utente:   {settings.user_id}")
        print()

        sessions = repository.list_sessions(connection, settings.user_id)
        if not sessions:
            print("Nessun consenso registrato. Esegui `sync-spese auth`.")
            return 1

        # Il codice di uscita dice se serve intervenire: 1 quando il consenso
        # manca o è scaduto, così `status` è utilizzabile in uno script.
        needs_action = False

        active = repository.get_active_session(connection, settings.user_id)
        if active is None:
            print("Nessun consenso ATTIVO. Esegui `sync-spese auth`.")
            needs_action = True
        else:
            consent = status_for(active["access_valid_until"])
            marker = "!!" if consent.needs_attention or consent.is_expired else "  "
            print("CONSENSO")
            print(f"{marker} Banca:    {active['aspsp_name']} ({active['aspsp_country']})")
            print(f"{marker} Sessione: {active['session_id']}")
            print(f"{marker} Scadenza: {consent.valid_until.isoformat()}")
            print(f"{marker} Stato:    {consent.describe()}")
            if consent.is_expired:
                print("   → serve una nuova autenticazione: `sync-spese auth`")
                needs_action = True
            elif consent.needs_attention:
                print("   → conviene rinnovarlo a breve: `sync-spese auth`")
            print()

        accounts = repository.list_accounts(connection, settings.user_id)
        print(f"CONTI ({len(accounts)})")
        for account in accounts:
            stats = repository.transaction_stats(
                connection, settings.user_id, int(account["id"])
            )
            total = stats["total"] or 0
            label = account["iban"] or account["name"] or account["identification_hash"][:16]
            print(f"  [{account['id']}] {label}  {account['currency']}")
            if total:
                print(
                    f"      {total} movimenti "
                    f"({stats['pending'] or 0} provvisori) "
                    f"dal {stats['first_date']} al {stats['last_date']}"
                )
                print(
                    f"      entrate {format_minor_units(stats['inflow_minor'] or 0, account['currency'])}"
                    f"  |  uscite {format_minor_units(stats['outflow_minor'] or 0, account['currency'])}"
                )
                sources = repository.dedup_source_breakdown(
                    connection, settings.user_id, int(account["id"])
                )
                detail = ", ".join(f"{row['dedup_source']}={row['n']}" for row in sources)
                print(f"      chiavi di deduplica: {detail}")
            else:
                print("      nessun movimento — esegui `sync-spese backfill`")

            balances = repository.latest_balances(
                connection, settings.user_id, int(account["id"])
            )
            for balance in balances:
                print(
                    f"      saldo {balance['balance_type']}: "
                    f"{format_minor_units(balance['amount_minor'], balance['currency'])} "
                    f"(al {balance['observed_at']})"
                )

            last_run = repository.last_successful_run(
                connection, settings.user_id, int(account["id"])
            )
            if last_run:
                print(
                    f"      ultimo sync riuscito: {last_run['kind']} "
                    f"il {last_run['finished_at']}"
                )

        stale = repository.runs_with_uningested_pages(connection, settings.user_id)
        if stale:
            print()
            print("ATTENZIONE: ci sono pagine scaricate ma non ancora ingerite.")
            for run in stale:
                print(
                    f"  esecuzione {run['id']} ({run['kind']}, {run['status']}): "
                    f"{run['pending_pages']} pagine"
                )
            print("  Recuperabili senza richiamare la banca: `sync-spese reingest`")
            needs_action = True
        return 1 if needs_action else 0
    finally:
        connection.close()


def cmd_accounts(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        accounts = repository.list_accounts(connection, settings.user_id)
        if not accounts:
            print("Nessun conto collegato. Esegui `sync-spese auth`.")
            return 1
        for account in accounts:
            print(f"[{account['id']}] {account['name'] or '(senza nome)'}")
            print(f"     IBAN:     {account['iban'] or account['other_identification'] or '-'}")
            print(f"     Banca:    {account['aspsp_name']} ({account['aspsp_country']})")
            print(f"     Valuta:   {account['currency']}")
            print(f"     Prodotto: {account['product'] or '-'}")
            print(f"     uid (di sessione): {account['current_uid'] or '-'}")
            print(f"     hash stabile:      {account['identification_hash'][:24]}…")
        return 0
    finally:
        connection.close()


def cmd_show(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        rows = connection.execute(
            """
            SELECT t.*, a.iban FROM transactions t
            JOIN accounts a ON a.id = t.account_id
            WHERE t.user_id = ?
            ORDER BY COALESCE(t.effective_date, '') DESC, t.id DESC
            LIMIT ?
            """,
            (settings.user_id, args.limit),
        ).fetchall()
        if not rows:
            print("Nessun movimento in database.")
            return 0
        for row in rows:
            flag = "~" if row["is_pending"] else " "
            amount = format_minor_units(row["amount_minor"], row["currency"])
            party = row["counterparty_name"] or (row["remittance_information"] or "")[:40] or "-"
            print(f"{flag} {row['effective_date'] or '????-??-??'}  {amount:>16}  {party}")
        return 0
    finally:
        connection.close()


def cmd_reingest(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        if args.run:
            run_ids = [args.run]
        else:
            run_ids = [
                int(run["id"])
                for run in repository.runs_with_uningested_pages(connection, settings.user_id)
            ]
        if not run_ids:
            print("Nessuna pagina grezza in attesa di ingestione.")
            return 0

        for run_id in run_ids:
            inserted, updated, removed = ingest_service.ingest_run(
                connection, settings, run_id=run_id
            )
            repository.update_sync_run(
                connection,
                run_id,
                status="completed",
                inserted=inserted,
                updated=updated,
                removed=removed,
                error=None,
            )
            print(
                f"Esecuzione {run_id}: {inserted} nuovi, {updated} aggiornati"
                + (f", {removed} provvisori rimossi" if removed else "")
            )
        return 0
    finally:
        connection.close()


def cmd_logout(args: argparse.Namespace, settings: Settings) -> int:
    connection = _open_database(settings)
    try:
        session = repository.get_active_session(connection, settings.user_id)
        if session is None:
            print("Nessun consenso attivo da chiudere.")
            return 0
        with _make_client(settings) as client:
            try:
                client.delete_session(session["session_id"])
            except SyncSpeseError as exc:
                logger.warning("La banca non ha confermato la chiusura: %s", exc)
        repository.mark_session_status(connection, session["session_id"], "REVOKED")
        print(f"Sessione {session['session_id']} chiusa. I dati già scaricati restano.")
        return 0
    finally:
        connection.close()


# --- parser ------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sync-spese",
        description="Scarica i movimenti bancari via Enable Banking in un SQLite locale.",
    )
    parser.add_argument("--env-file", help="Percorso di un .env alternativo.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init", help="Crea il database e applica le migrazioni.")

    banks = subparsers.add_parser("banks", help="Elenca le banche disponibili.")
    banks.add_argument("--country", help="Codice paese ISO (default: EB_ASPSP_COUNTRY).")
    banks.add_argument("--search", help="Filtra per parte del nome.")

    auth = subparsers.add_parser("auth", help="Ottieni il consenso con SCA.")
    auth.add_argument("--bank", help="Nome della banca (default: EB_ASPSP_NAME).")
    auth.add_argument("--country", help="Paese della banca (default: EB_ASPSP_COUNTRY).")
    auth.add_argument("--no-browser", action="store_true", help="Non aprire il browser.")
    auth.add_argument(
        "--timeout", type=float, default=300.0, help="Secondi di attesa del redirect."
    )
    auth.add_argument("--yes", action="store_true", help="Non chiedere conferma.")
    auth.add_argument(
        "--backfill",
        action="store_true",
        help="Esegui subito il backfill, senza uscire dalla finestra utile.",
    )
    auth.add_argument("--account", type=int, help=argparse.SUPPRESS)
    auth.add_argument("--from", dest="date_from", help=argparse.SUPPRESS)
    auth.add_argument("--to", dest="date_to", help=argparse.SUPPRESS)

    backfill = subparsers.add_parser(
        "backfill", help="Scarico iniziale dello storico più lungo disponibile."
    )
    backfill.add_argument("--account", type=int, help="Solo questo conto (id interno).")
    backfill.add_argument("--from", dest="date_from", help="Data iniziale AAAA-MM-GG.")
    backfill.add_argument("--to", dest="date_to", help="Data finale AAAA-MM-GG.")

    sync = subparsers.add_parser("sync", help="Aggiornamento incrementale.")
    sync.add_argument("--account", type=int, help="Solo questo conto (id interno).")
    sync.add_argument(
        "--days", type=int, default=14, help="Giorni all'indietro da rileggere (default 14)."
    )

    subparsers.add_parser("status", help="Scadenza del consenso e stato del database.")
    subparsers.add_parser("accounts", help="Conti collegati.")

    show = subparsers.add_parser("show", help="Ultimi movimenti salvati.")
    show.add_argument("--limit", type=int, default=20)

    reingest = subparsers.add_parser(
        "reingest", help="Ri-elabora le pagine grezze già scaricate."
    )
    reingest.add_argument("--run", type=int, help="Solo questa esecuzione.")

    subparsers.add_parser("logout", help="Chiude la sessione presso la banca.")

    return parser


COMMANDS = {
    "init": cmd_init,
    "banks": cmd_banks,
    "auth": cmd_auth,
    "backfill": cmd_backfill,
    "sync": cmd_sync,
    "status": cmd_status,
    "accounts": cmd_accounts,
    "show": cmd_show,
    "reingest": cmd_reingest,
    "logout": cmd_logout,
}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        settings = load_settings(args.env_file)
    except SyncSpeseError as exc:
        print(f"Errore di configurazione: {exc}", file=sys.stderr)
        return 2

    _setup_logging(settings.log_level)

    try:
        return COMMANDS[args.command](args, settings)
    except SyncSpeseError as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrotto.", file=sys.stderr)
        return 130


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
