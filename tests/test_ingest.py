"""Ingestione end-to-end: è qui che si verifica l'idempotenza."""

from __future__ import annotations

import sqlite3

import httpx
import pytest
from helpers import load_fixture

from sync_spese import repository
from sync_spese.config import Settings
from sync_spese.eb.client import EnableBankingClient
from sync_spese.errors import ApiError, SyncSpeseError
from sync_spese.services import ingest as ingest_service

PAGINE = {
    None: load_fixture("transactions_page_1.json"),
    "PAGINA-2": load_fixture("transactions_page_2.json"),
    "PAGINA-3": load_fixture("transactions_page_3.json"),
}

SALDI = {
    "balances": [
        {
            "name": "Saldo contabile",
            "balance_amount": {"currency": "EUR", "amount": "2431.77"},
            "balance_type": "CLBD",
            "reference_date": "2025-03-14",
        }
    ]
}


class SignerFinto:
    def authorization_header(self) -> dict[str, str]:
        return {"Authorization": "Bearer finto"}


class BancaFinta:
    """Risponde come l'API, e conta le chiamate."""

    def __init__(self, pagine=None, saldi=None):
        self.pagine = pagine if pagine is not None else PAGINE
        self.saldi = saldi if saldi is not None else SALDI
        self.chiamate: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.chiamate.append(str(request.url))
        if request.url.path.endswith("/balances"):
            return httpx.Response(200, json=self.saldi)
        key = request.url.params.get("continuation_key")
        return httpx.Response(200, json=self.pagine[key])


@pytest.fixture
def banca() -> BancaFinta:
    return BancaFinta()


@pytest.fixture
def client(banca: BancaFinta) -> EnableBankingClient:
    return EnableBankingClient(
        api_origin="https://api.enablebanking.test",
        signer=SignerFinto(),
        client=httpx.Client(transport=httpx.MockTransport(banca)),
    )


@pytest.fixture
def account(connection: sqlite3.Connection, settings: Settings, account_id: int):
    return repository.get_account(connection, settings.user_id, account_id)


def conta_movimenti(connection: sqlite3.Connection) -> int:
    return connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]


class TestBackfill:
    def test_scarica_e_scrive_tutto(self, connection, client, settings, account):
        risultato = ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        assert risultato.pages == 3
        assert risultato.fetched == 5
        assert risultato.inserted == 5
        assert risultato.updated == 0
        assert conta_movimenti(connection) == 5

    def test_usa_la_strategia_longest(self, connection, client, settings, account, banca):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        assert any("strategy=longest" in url for url in banca.chiamate)

    def test_i_dati_grezzi_restano_su_disco(self, connection, client, settings, account):
        risultato = ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        pagine = repository.raw_pages_for_run(connection, risultato.run_id)
        assert len(pagine) == 3
        assert all(pagina["ingested_at"] is not None for pagina in pagine)

    def test_gli_importi_hanno_il_segno_giusto(self, connection, client, settings, account):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        righe = connection.execute(
            "SELECT amount_minor, counterparty_name FROM transactions "
            "ORDER BY effective_date DESC"
        ).fetchall()
        importi = {riga["counterparty_name"]: riga["amount_minor"] for riga in righe}
        assert importi["BAR CENTRALE SRL"] == -1250
        assert importi["AZIENDA SPA"] == 185000

    def test_registra_i_saldi(self, connection, client, settings, account, account_id):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        saldi = repository.latest_balances(connection, settings.user_id, account_id)
        assert len(saldi) == 1
        assert saldi[0]["amount_minor"] == 243177


class TestIdempotenza:
    def test_dieci_esecuzioni_non_creano_duplicati(
        self, connection, client, settings, account
    ):
        # Il requisito, alla lettera: rieseguire dieci volte non deve creare
        # duplicati né perdere nulla.
        for _ in range(10):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )
        assert conta_movimenti(connection) == 5

    def test_la_seconda_esecuzione_aggiorna_e_non_inserisce(
        self, connection, client, settings, account
    ):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        seconda = ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        assert seconda.inserted == 0
        assert seconda.updated == 5

    def test_first_seen_at_non_cambia(self, connection, client, settings, account):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        prima = dict(
            connection.execute(
                "SELECT dedup_key, first_seen_at FROM transactions"
            ).fetchall()[0]
        )
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        dopo = connection.execute(
            "SELECT first_seen_at FROM transactions WHERE dedup_key = ?",
            (prima["dedup_key"],),
        ).fetchone()
        assert dopo["first_seen_at"] == prima["first_seen_at"]

    def test_movimenti_identici_restano_due(self, connection, client, settings, account):
        # Due caffè uguali lo stesso giorno sono due spese, non una.
        for _ in range(3):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )
        caffe = connection.execute(
            "SELECT COUNT(*) FROM transactions WHERE counterparty_name = ?",
            ("CAFFETTERIA DEL CORSO",),
        ).fetchone()[0]
        assert caffe == 2

    def test_la_provenienza_della_chiave_e_tracciata(
        self, connection, client, settings, account, account_id
    ):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        fonti = {
            riga["dedup_source"]: riga["n"]
            for riga in repository.dedup_source_breakdown(
                connection, settings.user_id, account_id
            )
        }
        assert fonti == {"entry_reference": 3, "fingerprint": 2}


class TestMovimentiProvvisori:
    def test_un_provvisorio_che_sparisce_viene_rimosso(
        self, connection, client, settings, account
    ):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        assert connection.execute(
            "SELECT COUNT(*) FROM transactions WHERE is_pending = 1"
        ).fetchone()[0] == 1

        # La banca contabilizza il movimento: sparisce dai provvisori e
        # ricompare come BOOK con un altro riferimento.
        contabilizzato = dict(PAGINE["PAGINA-3"])
        movimenti = [dict(m) for m in contabilizzato["transactions"]]
        movimenti[2] = {
            **movimenti[2],
            "entry_reference": "202503010000999999",
            "status": "BOOK",
            "booking_date": "2025-03-02",
        }
        nuove_pagine = {**PAGINE, "PAGINA-3": {**contabilizzato, "transactions": movimenti}}

        nuovo_client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=httpx.MockTransport(BancaFinta(nuove_pagine))),
        )
        with nuovo_client:
            ingest_service.backfill(
                connection, nuovo_client, settings, account=account, session_id="sess-1"
            )

        assert connection.execute(
            "SELECT COUNT(*) FROM transactions WHERE is_pending = 1"
        ).fetchone()[0] == 0
        # Non è rimasto un doppione fra provvisorio e contabilizzato.
        q8 = connection.execute(
            "SELECT COUNT(*) FROM transactions WHERE counterparty_name = ?",
            ("DISTRIBUTORE Q8",),
        ).fetchone()[0]
        assert q8 == 1

    def test_i_contabilizzati_non_vengono_mai_cancellati(
        self, connection, client, settings, account, account_id
    ):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        vuoto = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(
                transport=httpx.MockTransport(
                    BancaFinta({None: {"transactions": [], "continuation_key": None}})
                )
            ),
        )
        with vuoto:
            ingest_service.backfill(
                connection, vuoto, settings, account=account, session_id="sess-1"
            )
        assert connection.execute(
            "SELECT COUNT(*) FROM transactions WHERE is_pending = 0"
        ).fetchone()[0] == 4


class TestRecuperoDopoErrore:
    def test_se_l_ingestione_fallisce_i_dati_grezzi_restano(
        self, connection, client, settings, account, monkeypatch
    ):
        # Lo scarico è la risorsa scarsa: un errore di parsing non deve
        # costringere a rifare la SCA.
        def esplode(*args, **kwargs):
            raise ValueError("campo inatteso")

        monkeypatch.setattr(ingest_service, "normalize_transaction", esplode)

        with pytest.raises(SyncSpeseError, match="reingest"):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )

        assert conta_movimenti(connection) == 0
        in_attesa = repository.runs_with_uningested_pages(connection, settings.user_id)
        assert len(in_attesa) == 1
        assert in_attesa[0]["pending_pages"] == 3

    def test_reingest_recupera_senza_richiamare_la_banca(
        self, connection, client, settings, account, banca, monkeypatch
    ):
        def esplode(*args, **kwargs):
            raise ValueError("campo inatteso")

        monkeypatch.setattr(ingest_service, "normalize_transaction", esplode)
        with pytest.raises(SyncSpeseError):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )
        monkeypatch.undo()

        chiamate_prima = len(banca.chiamate)
        run_id = repository.runs_with_uningested_pages(connection, settings.user_id)[0]["id"]
        inseriti, aggiornati, _ = ingest_service.ingest_run(
            connection, settings, run_id=int(run_id)
        )

        assert inseriti == 5
        assert aggiornati == 0
        assert conta_movimenti(connection) == 5
        assert len(banca.chiamate) == chiamate_prima, "la banca non deve essere richiamata"
        assert repository.runs_with_uningested_pages(connection, settings.user_id) == []


class TestSyncIncrementale:
    def test_usa_la_strategia_default_e_una_finestra_corta(
        self, connection, client, settings, account, banca
    ):
        ingest_service.incremental(
            connection, client, settings, account=account, session_id="sess-1", days=7
        )
        assert any("strategy=default" in url for url in banca.chiamate)
        assert any("date_from=" in url for url in banca.chiamate)

    def test_dopo_un_backfill_non_duplica(self, connection, client, settings, account):
        ingest_service.backfill(
            connection, client, settings, account=account, session_id="sess-1"
        )
        ingest_service.incremental(
            connection, client, settings, account=account, session_id="sess-1", days=3650
        )
        assert conta_movimenti(connection) == 5


class TestPeriodoRifiutato:
    def test_ripiega_su_una_finestra_piu_corta(self, connection, settings, account):
        # Molte banche espongono al massimo ~90 giorni: se rifiutano il
        # periodo, chiedere meno è meglio che non scaricare niente.
        richieste: list[str | None] = []

        def severa(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/balances"):
                return httpx.Response(200, json=SALDI)
            date_from = request.url.params.get("date_from")
            richieste.append(date_from)
            if date_from is None or date_from < "2000-01-01":
                return httpx.Response(
                    422,
                    json={
                        "code": 422,
                        "message": "Wrong transactions period requested",
                        "detail": {"message": "Requested time period out of bound."},
                        "error": "WRONG_TRANSACTIONS_PERIOD",
                    },
                )
            return httpx.Response(200, json={"transactions": [], "continuation_key": None})

        client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=httpx.MockTransport(severa)),
        )
        with client:
            risultato = ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )

        assert richieste[0] is None, "il primo tentativo chiede tutto lo storico"
        assert richieste[1] is not None, "il secondo ripiega su una finestra"
        assert risultato.date_from is not None

    def test_le_finestre_sono_sempre_piu_strette(self, connection, settings, account):
        richieste: list[str | None] = []

        def sempre_no(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/balances"):
                return httpx.Response(200, json=SALDI)
            richieste.append(request.url.params.get("date_from"))
            return httpx.Response(
                422, json={"code": 422, "error": "WRONG_TRANSACTIONS_PERIOD"}
            )

        client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=httpx.MockTransport(sempre_no)),
        )
        with client, pytest.raises(ApiError):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )

        date_richieste = [d for d in richieste if d]
        assert date_richieste == sorted(date_richieste)
        assert len(richieste) == 1 + len(ingest_service.PERIOD_FALLBACK_DAYS)

    def test_l_esecuzione_fallita_viene_registrata(self, connection, settings, account):
        def sempre_no(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, json={"code": 429, "error": "ASPSP_RATE_LIMIT_EXCEEDED"})

        client = EnableBankingClient(
            api_origin="https://api.enablebanking.test",
            signer=SignerFinto(),
            client=httpx.Client(transport=httpx.MockTransport(sempre_no)),
        )
        with client, pytest.raises(SyncSpeseError, match="rate limit"):
            ingest_service.backfill(
                connection, client, settings, account=account, session_id="sess-1"
            )

        run = connection.execute(
            "SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert run["status"] == "failed"
        assert "rate limit" in run["error"]
