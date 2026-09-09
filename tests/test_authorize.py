"""Flusso di autorizzazione, dal /auth alla sessione salvata."""

from __future__ import annotations

import dataclasses
import socket
import threading
import time

import httpx
import pytest

from sync_spese import repository
from sync_spese.eb.client import EnableBankingClient
from sync_spese.errors import ConfigError, SyncSpeseError
from sync_spese.services import authorize as authorize_service

APPLICATION = {
    "name": "sync-spese",
    "active": True,
    "redirect_urls": ["http://127.0.0.1:PORTA/auth_redirect"],
}

ASPSPS = {
    "aspsps": [
        {
            "name": "UniCredit",
            "country": "IT",
            "maximum_consent_validity": 90 * 86400,
            "psu_types": ["personal"],
            "required_psu_headers": ["psu-ip-address", "psu-user-agent"],
        },
        {"name": "Intesa Sanpaolo", "country": "IT", "maximum_consent_validity": 180 * 86400},
    ]
}

SESSIONE = {
    "session_id": "sess-nuova",
    "psu_type": "personal",
    "aspsp": {"name": "UniCredit", "country": "IT"},
    "access": {"valid_until": "2025-06-12T10:00:00Z", "balances": True, "transactions": True},
    "accounts": [
        {
            "uid": "uid-nuovo",
            "currency": "EUR",
            "identification_hash": "hash-stabile-1",
            "identification_hashes": ["hash-stabile-1"],
            "account_id": {"iban": "IT60X0542811101000000999999", "other": None},
            "name": "MARIO ROSSI",
            "product": "Genius Card",
            "usage": "PRIV",
            "cash_account_type": "CACC",
        }
    ],
}


class SignerFinto:
    def authorization_header(self) -> dict[str, str]:
        return {"Authorization": "Bearer finto"}


def porta_libera() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def settings_locali(settings):
    porta = porta_libera()
    return dataclasses.replace(
        settings, redirect_url=f"http://127.0.0.1:{porta}/auth_redirect"
    )


def banca_che_reindirizza(redirect_url: str, *, stato_sbagliato: bool = False):
    """API finta che, appena riceve /auth, simula il ritorno dal browser."""
    visto: dict = {}

    def bussa(url: str) -> None:
        for _ in range(100):
            try:
                httpx.get(url, timeout=2)
                return
            except httpx.TransportError:
                time.sleep(0.05)

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/application":
            return httpx.Response(200, json={**APPLICATION, "redirect_urls": [redirect_url]})
        if path == "/aspsps":
            visto["aspsps_params"] = dict(request.url.params)
            return httpx.Response(200, json=ASPSPS)
        if path == "/auth":
            import json

            corpo = json.loads(request.content)
            visto["auth_body"] = corpo
            stato = "STATO-SBAGLIATO" if stato_sbagliato else corpo["state"]
            ritorno = f"{redirect_url}?code=CODICE-1&state={stato}"
            threading.Thread(target=bussa, args=(ritorno,), daemon=True).start()
            return httpx.Response(
                200,
                json={
                    "url": "https://banca.example/sca",
                    "authorization_id": "auth-1",
                    "psu_id_hash": "hash-psu",
                },
            )
        if path == "/sessions":
            visto["code"] = __import__("json").loads(request.content)["code"]
            return httpx.Response(200, json=SESSIONE)
        raise AssertionError(f"percorso inatteso: {path}")

    return handler, visto


def client_per(handler) -> EnableBankingClient:
    return EnableBankingClient(
        api_origin="https://api.enablebanking.test",
        signer=SignerFinto(),
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


class TestRisoluzioneBanca:
    def test_trova_la_banca(self):
        with client_per(banca_che_reindirizza("http://x/y")[0]) as client:
            aspsp = authorize_service.resolve_aspsp(
                client, name="unicredit", country="IT", psu_type="personal"
            )
        assert aspsp.name == "UniCredit"
        assert aspsp.maximum_consent_validity == 90 * 86400

    def test_nome_sbagliato_suggerisce_i_candidati(self):
        with client_per(banca_che_reindirizza("http://x/y")[0]) as client:
            with pytest.raises(ConfigError, match="Intesa Sanpaolo"):
                authorize_service.resolve_aspsp(
                    client, name="intesa", country="IT", psu_type="personal"
                )

    def test_nome_inesistente(self):
        with client_per(banca_che_reindirizza("http://x/y")[0]) as client:
            with pytest.raises(ConfigError, match="sync-spese banks"):
                authorize_service.resolve_aspsp(
                    client, name="Banca Inventata", country="IT", psu_type="personal"
                )


class TestFlussoCompleto:
    def test_dal_consenso_al_database(self, connection, settings_locali):
        handler, visto = banca_che_reindirizza(settings_locali.redirect_url)
        with client_per(handler) as client:
            esito = authorize_service.authorize(
                connection, client, settings_locali, open_browser=False, timeout=15
            )

        assert esito.session.session_id == "sess-nuova"
        assert visto["code"] == "CODICE-1"

        sessione = repository.get_active_session(connection, settings_locali.user_id)
        assert sessione["session_id"] == "sess-nuova"
        assert sessione["access_valid_until"] == "2025-06-12T10:00:00Z"
        assert sessione["authorization_id"] == "auth-1"
        assert sessione["psu_id_hash"] == "hash-psu"

        conti = repository.list_accounts(connection, settings_locali.user_id)
        assert len(conti) == 1
        assert conti[0]["iban"] == "IT60X0542811101000000999999"
        assert conti[0]["current_uid"] == "uid-nuovo"
        assert conti[0]["identification_hash"] == "hash-stabile-1"

    def test_la_durata_richiesta_rispetta_il_massimo_della_banca(
        self, connection, settings_locali
    ):
        handler, visto = banca_che_reindirizza(settings_locali.redirect_url)
        with client_per(handler) as client:
            authorize_service.authorize(
                connection, client, settings_locali, open_browser=False, timeout=15
            )

        from datetime import datetime, timedelta, timezone

        from sync_spese.domain.consent import parse_timestamp

        richiesta = parse_timestamp(visto["auth_body"]["access"]["valid_until"])
        assert richiesta - datetime.now(timezone.utc) <= timedelta(days=90)
        assert visto["auth_body"]["aspsp"] == {"name": "UniCredit", "country": "IT"}
        assert visto["auth_body"]["psu_type"] == "personal"
        assert visto["auth_body"]["redirect_url"] == settings_locali.redirect_url

    def test_uno_state_diverso_viene_rifiutato(self, connection, settings_locali):
        handler, _ = banca_che_reindirizza(
            settings_locali.redirect_url, stato_sbagliato=True
        )
        with client_per(handler) as client:
            with pytest.raises(SyncSpeseError, match="state"):
                authorize_service.authorize(
                    connection, client, settings_locali, open_browser=False, timeout=15
                )
        assert repository.get_active_session(connection, settings_locali.user_id) is None

    def test_un_secondo_consenso_supera_il_primo(self, connection, settings_locali):
        handler, _ = banca_che_reindirizza(settings_locali.redirect_url)
        with client_per(handler) as client:
            authorize_service.authorize(
                connection, client, settings_locali, open_browser=False, timeout=15
            )
            esito = authorize_service.authorize(
                connection, client, settings_locali, open_browser=False, timeout=15
            )

        assert esito.superseded == 1
        sessioni = repository.list_sessions(connection, settings_locali.user_id)
        assert len(sessioni) == 1  # stessa session_id: riattivata, non duplicata
        # Il conto non viene duplicato: l'hash stabile è lo stesso.
        assert len(repository.list_accounts(connection, settings_locali.user_id)) == 1
