"""Client dell'API: paginazione, errori, firma."""

from __future__ import annotations

import httpx
import pytest
from helpers import load_fixture

from sync_spese.eb.client import MAX_PAGES, EnableBankingClient
from sync_spese.errors import ApiError


class SignerFinto:
    def authorization_header(self) -> dict[str, str]:
        return {"Authorization": "Bearer finto"}


def make_client(handler) -> EnableBankingClient:
    transport = httpx.MockTransport(handler)
    return EnableBankingClient(
        api_origin="https://api.enablebanking.test",
        signer=SignerFinto(),
        client=httpx.Client(transport=transport),
        max_retries=1,
    )


PAGINE = {
    None: load_fixture("transactions_page_1.json"),
    "PAGINA-2": load_fixture("transactions_page_2.json"),
    "PAGINA-3": load_fixture("transactions_page_3.json"),
}


def handler_paginato(request: httpx.Request) -> httpx.Response:
    key = request.url.params.get("continuation_key")
    return httpx.Response(200, json=PAGINE[key])


class TestPaginazione:
    def test_scorre_tutte_le_pagine(self):
        with make_client(handler_paginato) as client:
            pagine = list(client.iter_transaction_pages("uid-1", strategy="longest"))
        assert [numero for numero, _, _ in pagine] == [1, 2, 3]
        assert sum(len(pagina.transactions) for _, _, pagina in pagine) == 5

    def test_una_pagina_vuota_non_ferma_lo_scarico(self):
        # Con strategy=longest l'API può restituire zero movimenti e un
        # continuation key valido: fermarsi lì troncherebbe lo storico.
        with make_client(handler_paginato) as client:
            pagine = list(client.iter_transaction_pages("uid-1", strategy="longest"))
        assert len(pagine[1][2].transactions) == 0
        assert pagine[1][2].continuation_key == "PAGINA-3"
        assert len(pagine) == 3

    def test_si_ferma_solo_senza_continuation_key(self):
        with make_client(handler_paginato) as client:
            *_, ultima = client.iter_transaction_pages("uid-1", strategy="longest")
        assert ultima[2].continuation_key is None

    def test_continuation_key_ripetuto_interrompe(self):
        def sempre_uguale(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"transactions": [], "continuation_key": "SEMPRE"})

        with make_client(sempre_uguale) as client:
            with pytest.raises(ApiError, match="REPEATED_CONTINUATION_KEY"):
                list(client.iter_transaction_pages("uid-1"))

    def test_tetto_massimo_di_pagine(self):
        contatore = {"n": 0}

        def sempre_nuovo(request: httpx.Request) -> httpx.Response:
            contatore["n"] += 1
            return httpx.Response(
                200, json={"transactions": [], "continuation_key": f"K{contatore['n']}"}
            )

        with make_client(sempre_nuovo) as client:
            with pytest.raises(ApiError, match="TOO_MANY_PAGES"):
                list(client.iter_transaction_pages("uid-1"))
        assert contatore["n"] == MAX_PAGES


class TestParametri:
    def test_i_parametri_vuoti_non_vengono_inviati(self):
        visti = {}

        def cattura(request: httpx.Request) -> httpx.Response:
            visti.update(dict(request.url.params))
            return httpx.Response(200, json={"transactions": [], "continuation_key": None})

        with make_client(cattura) as client:
            client.get_transactions_page("uid-1", date_from="2025-01-01", strategy="longest")

        assert visti == {"date_from": "2025-01-01", "strategy": "longest"}
        assert "date_to" not in visti and "continuation_key" not in visti

    def test_le_date_diventano_stringhe_iso(self):
        from datetime import date

        visti = {}

        def cattura(request: httpx.Request) -> httpx.Response:
            visti.update(dict(request.url.params))
            return httpx.Response(200, json={"transactions": [], "continuation_key": None})

        with make_client(cattura) as client:
            client.get_transactions_page("uid-1", date_from=date(2025, 3, 1))
        assert visti["date_from"] == "2025-03-01"

    def test_gli_header_psu_solo_dove_servono(self):
        header_visti = []

        def cattura(request: httpx.Request) -> httpx.Response:
            header_visti.append(dict(request.headers))
            return httpx.Response(200, json={"aspsps": []})

        transport = httpx.MockTransport(cattura)
        client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=transport),
            psu_headers={"psu-ip-address": "1.2.3.4", "psu-user-agent": "test"},
        )
        with client:
            client.get_aspsps(country="IT")
        assert "psu-ip-address" not in header_visti[0]


class TestErrori:
    def test_periodo_rifiutato(self):
        corpo = {
            "code": 422,
            "message": "Wrong transactions period requested",
            "detail": {"message": "Requested time period out of bound."},
            "error": "WRONG_TRANSACTIONS_PERIOD",
        }

        with make_client(lambda r: httpx.Response(422, json=corpo)) as client:
            with pytest.raises(ApiError) as info:
                client.get_transactions_page("uid-1")
        assert info.value.is_wrong_period
        assert info.value.status_code == 422

    def test_rate_limit(self):
        corpo = {"code": 429, "error": "ASPSP_RATE_LIMIT_EXCEEDED", "message": "Too many"}
        with make_client(lambda r: httpx.Response(429, json=corpo)) as client:
            with pytest.raises(ApiError) as info:
                client.get_transactions_page("uid-1")
        assert info.value.is_rate_limited

    def test_sessione_scaduta(self):
        corpo = {"code": 401, "error": "EXPIRED_SESSION", "message": "Session expired"}
        with make_client(lambda r: httpx.Response(401, json=corpo)) as client:
            with pytest.raises(ApiError) as info:
                client.get_session("s-1")
        assert info.value.is_expired_session

    def test_errore_senza_json(self):
        with make_client(lambda r: httpx.Response(500, text="Bad gateway")) as client:
            with pytest.raises(ApiError) as info:
                client.get_application()
        assert info.value.status_code == 500

    def test_i_5xx_vengono_ritentati(self):
        tentativi = {"n": 0}

        def instabile(request: httpx.Request) -> httpx.Response:
            tentativi["n"] += 1
            if tentativi["n"] == 1:
                return httpx.Response(503, json={"error": "UNAVAILABLE"})
            return httpx.Response(200, json={"aspsps": []})

        transport = httpx.MockTransport(instabile)
        client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=transport),
            max_retries=2,
        )
        with client:
            assert client.get_aspsps(country="IT") == []
        assert tentativi["n"] == 2


class TestFirma:
    def test_il_token_viene_riusato_finche_e_valido(self):
        import jwt as pyjwt
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        from sync_spese.eb.jwt_auth import JwtSigner

        chiave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = chiave.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        letture = {"n": 0}

        def leggi():
            letture["n"] += 1
            return pem

        signer = JwtSigner("app-id", leggi, lifetime_seconds=3600)
        primo = signer.token()
        assert signer.token() == primo
        assert letture["n"] == 1, "la chiave privata è stata riletta senza motivo"

        intestazione = pyjwt.get_unverified_header(primo)
        assert intestazione["alg"] == "RS256"
        assert intestazione["kid"] == "app-id"

        payload = pyjwt.decode(
            primo, chiave.public_key(), algorithms=["RS256"], audience="api.enablebanking.com"
        )
        assert payload["iss"] == "enablebanking.com"
        assert payload["exp"] - payload["iat"] == 3600

    def test_il_token_viene_rigenerato_alla_scadenza(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        from sync_spese.eb.jwt_auth import JwtSigner

        chiave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = chiave.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        orologio = {"t": 1_700_000_000.0}
        signer = JwtSigner(
            "app-id",
            lambda: pem,
            lifetime_seconds=600,
            refresh_margin_seconds=60,
            clock=lambda: orologio["t"],
        )
        primo = signer.token()
        orologio["t"] += 100
        assert signer.token() == primo
        orologio["t"] += 500  # oltre 600 - 60
        assert signer.token() != primo
