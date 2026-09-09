"""Ottenimento del consenso e salvataggio della sessione."""

from __future__ import annotations

import contextlib
import logging
import sqlite3
import uuid
import webbrowser
from dataclasses import dataclass
from datetime import datetime, timezone

from .. import repository
from ..config import Settings
from ..db.connection import transaction
from ..domain.consent import requested_valid_until, status_for
from ..eb.client import EnableBankingClient
from ..eb.models import AspspInfo, Session, StartAuthorizationResponse
from ..errors import ConfigError, SyncSpeseError
from ..redirect_server import AuthorizationCallback, extract_code, wait_for_code

logger = logging.getLogger(__name__)


@dataclass
class AuthorizationOutcome:
    session: Session
    account_ids: list[int]
    superseded: int


def resolve_aspsp(
    client: EnableBankingClient, *, name: str, country: str, psu_type: str
) -> AspspInfo:
    """Trova la banca fra quelle disponibili, confrontando i nomi senza badare
    a maiuscole e spazi.

    Il nome va usato esattamente come lo restituisce l'API: se non combacia,
    l'errore elenca i candidati più simili invece di lasciare un 404 opaco.
    """
    aspsps = client.get_aspsps(country=country, psu_type=psu_type)
    wanted = name.strip().casefold()

    for aspsp in aspsps:
        if aspsp.name.strip().casefold() == wanted:
            return aspsp

    partial = [aspsp.name for aspsp in aspsps if wanted in aspsp.name.casefold()]
    hint = ", ".join(sorted(partial)[:10]) if partial else None
    raise ConfigError(
        f"Nessuna banca chiamata {name!r} in {country} per psu_type={psu_type}. "
        + (
            f"Forse intendevi: {hint}. "
            if hint
            else "Esegui `sync-spese banks` per vedere l'elenco esatto. "
        )
        + "Il nome in EB_ASPSP_NAME deve coincidere carattere per carattere."
    )


def check_application(client: EnableBankingClient, settings: Settings) -> None:
    """Controlli preliminari sull'applicazione registrata.

    Sono avvisi, non errori: l'API resta la fonte di verità e non vale la pena
    bloccare l'autorizzazione per una discrepanza in questa diagnostica.
    """
    try:
        app = client.get_application()
    except SyncSpeseError as exc:
        logger.warning("Impossibile leggere i dati dell'applicazione: %s", exc)
        return

    if app.redirect_urls and settings.redirect_url not in app.redirect_urls:
        logger.warning(
            "EB_REDIRECT_URL (%s) non è fra quelli registrati per l'applicazione (%s). "
            "La banca rifiuterà il redirect.",
            settings.redirect_url,
            ", ".join(app.redirect_urls),
        )
    if app.active is False:
        logger.warning(
            "L'applicazione risulta non attiva. In modalità restricted production "
            "va prima collegato almeno un conto dal control panel di Enable Banking."
        )


def start_authorization(
    client: EnableBankingClient,
    settings: Settings,
    *,
    aspsp: AspspInfo,
    now: datetime | None = None,
) -> tuple[StartAuthorizationResponse, str]:
    """Avvia l'autorizzazione. Restituisce ``(risposta, state)``."""
    moment = now or datetime.now(timezone.utc)
    valid_until = requested_valid_until(
        now=moment,
        maximum_consent_validity_seconds=aspsp.maximum_consent_validity,
        requested_days=settings.consent_days,
    )
    state = str(uuid.uuid4())

    response = client.start_authorization(
        aspsp_name=aspsp.name,
        aspsp_country=aspsp.country,
        valid_until=valid_until.isoformat(),
        redirect_url=settings.redirect_url,
        state=state,
        psu_type=settings.psu_type,
        language=settings.language,
    )
    logger.info(
        "Consenso richiesto fino al %s (massimo concesso da %s: %s secondi).",
        valid_until.isoformat(timespec="seconds"),
        aspsp.name,
        aspsp.maximum_consent_validity,
    )
    return response, state


def collect_code(
    auth_url: str,
    settings: Settings,
    *,
    expected_state: str,
    open_browser: bool = True,
    timeout: float = 300.0,
) -> str:
    """Porta l'utente sulla pagina della banca e recupera il codice."""
    print()
    print("Apri questo indirizzo e autenticati sul sito della banca:")
    print(f"  {auth_url}")
    print()

    if open_browser:
        # Su una macchina senza ambiente grafico non c'è browser da aprire:
        # l'URL è comunque stampato sopra.
        with contextlib.suppress(Exception):
            webbrowser.open(auth_url)

    callback: AuthorizationCallback | None = None
    print(f"In attesa del redirect su {settings.redirect_url} …")
    print("(se non arriva, incolla qui sotto l'URL su cui sei stato reindirizzato)")
    callback = wait_for_code(settings.redirect_url, timeout=timeout)

    if callback is None:
        pasted = input("URL di redirect: ").strip()
        if not pasted:
            raise SyncSpeseError("Nessun URL fornito: autorizzazione annullata.")
        callback = extract_code(pasted)

    if callback.error:
        raise SyncSpeseError(f"La banca ha rifiutato l'autorizzazione: {callback.error}")
    if not callback.code:
        raise SyncSpeseError("Il redirect non conteneva il parametro `code`.")
    if callback.state and callback.state != expected_state:
        # Lo `state` lega la risposta alla richiesta partita da qui.
        raise SyncSpeseError(
            "Lo `state` restituito non corrisponde a quello inviato: "
            "risposta scartata per sicurezza."
        )
    return callback.code


def persist_session(
    connection: sqlite3.Connection,
    settings: Settings,
    session: Session,
    *,
    authorization_id: str | None = None,
    psu_id_hash: str | None = None,
) -> AuthorizationOutcome:
    """Salva sessione e conti in una sola transazione."""
    if session.access is None or not session.access.valid_until:
        raise SyncSpeseError(
            "La sessione non riporta la data di scadenza del consenso: "
            "impossibile sapere quando andrà rinnovato."
        )

    aspsp_name = session.aspsp.name if session.aspsp else (settings.aspsp_name or "")
    aspsp_country = session.aspsp.country if session.aspsp else (settings.aspsp_country or "")

    with transaction(connection):
        repository.ensure_user(connection, settings.user_id)
        superseded = repository.supersede_active_sessions(connection, settings.user_id)
        repository.insert_session(
            connection,
            session_id=session.session_id,
            user_id=settings.user_id,
            aspsp_name=aspsp_name,
            aspsp_country=aspsp_country,
            psu_type=session.psu_type or settings.psu_type,
            authorization_id=authorization_id,
            psu_id_hash=psu_id_hash,
            access_valid_until=session.access.valid_until,
            access=session.access.model_dump(),
        )

        account_ids: list[int] = []
        for account in session.accounts:
            identification = account.account_id
            other = None
            if identification and identification.other:
                other = identification.other.get("identification")
            account_ids.append(
                repository.upsert_account(
                    connection,
                    user_id=settings.user_id,
                    identification_hash=account.identification_hash,
                    aspsp_name=aspsp_name,
                    aspsp_country=aspsp_country,
                    iban=identification.iban if identification else None,
                    other_identification=other,
                    name=account.name,
                    product=account.product,
                    details=account.details,
                    currency=account.currency,
                    cash_account_type=account.cash_account_type,
                    usage=account.usage,
                    current_uid=account.uid,
                    current_session_id=session.session_id,
                    raw=account.model_dump(),
                )
            )

    return AuthorizationOutcome(
        session=session, account_ids=account_ids, superseded=superseded
    )


def authorize(
    connection: sqlite3.Connection,
    client: EnableBankingClient,
    settings: Settings,
    *,
    aspsp_name: str | None = None,
    aspsp_country: str | None = None,
    open_browser: bool = True,
    timeout: float = 300.0,
) -> AuthorizationOutcome:
    """Flusso completo: banca → SCA → sessione salvata."""
    name = aspsp_name or settings.aspsp_name
    country = aspsp_country or settings.aspsp_country
    if not name or not country:
        raise ConfigError(
            "Banca non configurata: imposta EB_ASPSP_NAME e EB_ASPSP_COUNTRY nel .env "
            "oppure passa --bank e --country."
        )

    check_application(client, settings)
    aspsp = resolve_aspsp(client, name=name, country=country, psu_type=settings.psu_type)

    if aspsp.required_psu_headers and not settings.psu_headers:
        logger.info(
            "%s dichiara di richiedere gli header PSU (%s) per il fetch online. "
            "Senza di essi le chiamate valgono come 'unattended' e la banca può "
            "limitarle a poche al giorno.",
            aspsp.name,
            ", ".join(aspsp.required_psu_headers),
        )

    auth_response, state = start_authorization(client, settings, aspsp=aspsp)
    code = collect_code(
        auth_response.url,
        settings,
        expected_state=state,
        open_browser=open_browser,
        timeout=timeout,
    )

    session = client.authorize_session(code)
    outcome = persist_session(
        connection,
        settings,
        session,
        authorization_id=auth_response.authorization_id,
        psu_id_hash=auth_response.psu_id_hash,
    )

    if session.access and session.access.valid_until:
        consent = status_for(session.access.valid_until)
        logger.info("Consenso ottenuto, %s.", consent.describe())

    return outcome
