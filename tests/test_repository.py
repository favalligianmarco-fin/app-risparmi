"""Livello di persistenza."""

from __future__ import annotations

from sync_spese import repository

RIGA_BASE = {
    "dedup_source": "entry_reference",
    "transaction_id": None,
    "entry_reference": "E-1",
    "amount_minor": -1250,
    "amount_raw": "12.50",
    "currency": "EUR",
    "currency_exponent": 2,
    "credit_debit_indicator": "DBIT",
    "status": "BOOK",
    "is_pending": 0,
    "booking_date": "2025-03-14",
    "value_date": "2025-03-14",
    "transaction_date": "2025-03-14",
    "effective_date": "2025-03-14",
    "counterparty_name": "NEGOZIO",
    "counterparty_account": None,
    "remittance_information": None,
    "reference_number": None,
    "merchant_category_code": None,
    "bank_transaction_code": None,
    "note": None,
    "balance_after_minor": None,
    "balance_after_currency": None,
    "raw_json": "{}",
}


def riga(user_id: str, account_id: int, dedup_key: str, **extra):
    return {
        **RIGA_BASE,
        "user_id": user_id,
        "account_id": account_id,
        "dedup_key": dedup_key,
        **extra,
    }


class TestUpsert:
    def test_conta_inserimenti_e_aggiornamenti(self, connection, settings, account_id):
        righe = [riga(settings.user_id, account_id, f"k{i}") for i in range(3)]
        assert repository.upsert_transactions(connection, righe) == (3, 0)
        assert repository.upsert_transactions(connection, righe) == (0, 3)

    def test_lotto_vuoto(self, connection):
        assert repository.upsert_transactions(connection, []) == (0, 0)

    def test_l_aggiornamento_sovrascrive_i_campi(self, connection, settings, account_id):
        repository.upsert_transactions(
            connection, [riga(settings.user_id, account_id, "k1", status="PDNG", is_pending=1)]
        )
        repository.upsert_transactions(
            connection, [riga(settings.user_id, account_id, "k1", status="BOOK", is_pending=0)]
        )
        salvata = connection.execute("SELECT * FROM transactions").fetchone()
        assert salvata["status"] == "BOOK"
        assert salvata["is_pending"] == 0

    def test_la_chiave_univoca_impedisce_i_duplicati(
        self, connection, settings, account_id
    ):
        doppia = [
            riga(settings.user_id, account_id, "stessa"),
            riga(settings.user_id, account_id, "stessa"),
        ]
        repository.upsert_transactions(connection, doppia)
        assert connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 1


class TestProvvisori:
    def test_rimuove_solo_quelli_non_piu_visti(self, connection, settings, account_id):
        repository.upsert_transactions(
            connection,
            [
                riga(settings.user_id, account_id, "book", is_pending=0),
                riga(settings.user_id, account_id, "pend-1", is_pending=1),
                riga(settings.user_id, account_id, "pend-2", is_pending=1),
            ],
        )
        rimossi = repository.delete_stale_pending(
            connection,
            user_id=settings.user_id,
            account_id=account_id,
            date_from=None,
            date_to=None,
            seen_keys=["pend-1"],
        )
        assert rimossi == 1
        rimaste = {
            row["dedup_key"] for row in connection.execute("SELECT dedup_key FROM transactions")
        }
        assert rimaste == {"book", "pend-1"}

    def test_non_tocca_fuori_dalla_finestra(self, connection, settings, account_id):
        repository.upsert_transactions(
            connection,
            [
                riga(
                    settings.user_id, account_id, "vecchio",
                    is_pending=1, effective_date="2024-01-01",
                ),
                riga(
                    settings.user_id, account_id, "recente",
                    is_pending=1, effective_date="2025-03-14",
                ),
            ],
        )
        rimossi = repository.delete_stale_pending(
            connection,
            user_id=settings.user_id,
            account_id=account_id,
            date_from="2025-03-01",
            date_to="2025-03-31",
            seen_keys=[],
        )
        assert rimossi == 1
        assert connection.execute(
            "SELECT dedup_key FROM transactions"
        ).fetchone()["dedup_key"] == "vecchio"


class TestConti:
    def test_l_uid_di_sessione_si_aggiorna_senza_duplicare_il_conto(
        self, connection, settings, account_id
    ):
        # A ogni nuovo consenso l'uid cambia, ma il conto è lo stesso.
        nuovo = repository.upsert_account(
            connection,
            user_id=settings.user_id,
            identification_hash="hash-conto-stabile",
            aspsp_name="UniCredit",
            aspsp_country="IT",
            iban=None,
            other_identification=None,
            name=None,
            product=None,
            details=None,
            currency="EUR",
            cash_account_type=None,
            usage=None,
            current_uid="uid-sessione-2",
            current_session_id="sess-1",
            raw=None,
        )
        assert nuovo == account_id
        conto = repository.get_account(connection, settings.user_id, account_id)
        assert conto["current_uid"] == "uid-sessione-2"
        # I campi descrittivi già noti non vengono cancellati da una risposta
        # più povera.
        assert conto["iban"] == "IT60X0542811101000000999999"
        assert conto["name"] == "Conto personale"

    def test_utenti_diversi_non_si_vedono(self, connection, settings, account_id):
        repository.ensure_user(connection, "altro-utente")
        altro = repository.upsert_account(
            connection,
            user_id="altro-utente",
            identification_hash="hash-conto-stabile",
            aspsp_name="UniCredit",
            aspsp_country="IT",
            iban="IT00X0000000000000000000000",
            other_identification=None,
            name="Conto di un altro",
            product=None,
            details=None,
            currency="EUR",
            cash_account_type=None,
            usage=None,
            current_uid="uid-x",
            current_session_id=None,
            raw=None,
        )
        assert altro != account_id
        assert len(repository.list_accounts(connection, settings.user_id)) == 1


class TestSessioni:
    def test_un_nuovo_consenso_supera_il_precedente(self, connection, settings, account_id):
        # Le banche italiane ammettono un solo consenso attivo: il database
        # deve rispecchiarlo.
        repository.insert_session(
            connection,
            session_id="sess-2",
            user_id=settings.user_id,
            aspsp_name="UniCredit",
            aspsp_country="IT",
            psu_type="personal",
            authorization_id=None,
            psu_id_hash=None,
            access_valid_until="2099-06-01T00:00:00+00:00",
            access=None,
        )
        assert repository.supersede_active_sessions(connection, settings.user_id) == 2
        assert repository.get_active_session(connection, settings.user_id) is None

    def test_ultima_sessione_attiva(self, connection, settings, account_id):
        attiva = repository.get_active_session(connection, settings.user_id)
        assert attiva["session_id"] == "sess-1"


class TestEsecuzioni:
    def test_ciclo_di_vita(self, connection, settings, account_id):
        run_id = repository.start_sync_run(
            connection,
            user_id=settings.user_id,
            account_id=account_id,
            session_id="sess-1",
            kind="backfill",
            strategy="longest",
            date_from=None,
            date_to=None,
        )
        assert repository.last_successful_run(connection, settings.user_id, account_id) is None
        repository.finish_sync_run(connection, run_id, status="completed", inserted=5)
        ultima = repository.last_successful_run(connection, settings.user_id, account_id)
        assert ultima["inserted"] == 5
        assert ultima["finished_at"] is not None
