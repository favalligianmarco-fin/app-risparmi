"""Da payload dell'API a riga di database."""

from __future__ import annotations

import json

import pytest
from helpers import load_fixture

from sync_spese.domain.normalize import (
    best_date,
    counterparty,
    is_pending,
    normalize_transaction,
)


def normalizza(movimento, **kwargs):
    parametri = {
        "dedup_key": "eref:X",
        "dedup_source": "entry_reference",
        "account_id": 1,
        "user_id": "test-user",
    }
    parametri.update(kwargs)
    return normalize_transaction(movimento, **parametri)


@pytest.fixture
def pagina():
    return load_fixture("transactions_page_1.json")["transactions"]


class TestUscita:
    def test_campi_principali(self, pagina):
        riga = normalizza(pagina[0])
        assert riga["amount_minor"] == -1250
        assert riga["amount_raw"] == "12.50"
        assert riga["currency"] == "EUR"
        assert riga["currency_exponent"] == 2
        assert riga["credit_debit_indicator"] == "DBIT"
        assert riga["status"] == "BOOK"
        assert riga["is_pending"] == 0
        assert riga["counterparty_name"] == "BAR CENTRALE SRL"
        assert riga["remittance_information"] == "POS 14/03/25 BAR CENTRALE MILANO"
        assert riga["merchant_category_code"] == "5812"
        assert riga["bank_transaction_code"] == "PAGAMENTO CARTA DI DEBITO"
        assert riga["effective_date"] == "2025-03-14"

    def test_il_payload_grezzo_e_conservato(self, pagina):
        riga = normalizza(pagina[0])
        assert json.loads(riga["raw_json"])["entry_reference"] == "202503140000123456"


class TestEntrata:
    def test_stipendio(self, pagina):
        riga = normalizza(pagina[1])
        assert riga["amount_minor"] == 185000
        assert riga["counterparty_name"] == "AZIENDA SPA"
        assert riga["counterparty_account"] == "IT60X0542811101000000123456"
        assert riga["balance_after_minor"] == 243177
        assert riga["balance_after_currency"] == "EUR"
        assert riga["reference_number"] == "STIP032025"


class TestControparte:
    def test_su_uscita_e_il_creditore(self):
        nome, conto = counterparty(
            {"credit_debit_indicator": "DBIT", "creditor": {"name": "NEGOZIO"},
             "debtor": {"name": "IO"}}
        )
        assert nome == "NEGOZIO"

    def test_su_entrata_e_il_debitore(self):
        nome, _ = counterparty(
            {"credit_debit_indicator": "CRDT", "creditor": {"name": "IO"},
             "debtor": {"name": "DATORE"}}
        )
        assert nome == "DATORE"

    def test_ripiega_sull_altro_campo_se_vuoto(self):
        # Alcune banche popolano solo `creditor`, a prescindere dalla direzione.
        nome, _ = counterparty({"credit_debit_indicator": "CRDT", "creditor": {"name": "TIZIO"}})
        assert nome == "TIZIO"

    def test_identificativo_non_iban(self):
        _, conto = counterparty(
            {
                "credit_debit_indicator": "DBIT",
                "creditor_account": {"other": {"identification": "1234567890"}},
            }
        )
        assert conto == "1234567890"

    def test_nessuna_controparte(self):
        assert counterparty({"credit_debit_indicator": "DBIT"}) == (None, None)


class TestDataEffettiva:
    def test_preferisce_la_contabilizzazione(self):
        assert best_date(
            {"booking_date": "2025-03-14", "value_date": "2025-03-12"}
        ) == "2025-03-14"

    def test_ripiega_su_valuta(self):
        assert best_date({"booking_date": None, "value_date": "2025-03-12"}) == "2025-03-12"

    def test_ripiega_su_data_operazione(self):
        assert best_date({"transaction_date": "2025-03-01"}) == "2025-03-01"

    def test_nessuna_data(self):
        assert best_date({}) is None


class TestStatoProvvisorio:
    @pytest.mark.parametrize("stato", ["PDNG", "pdng", "SCHD"])
    def test_provvisori(self, stato):
        assert is_pending(stato) is True

    @pytest.mark.parametrize("stato", ["BOOK", "INFO", None, ""])
    def test_definitivi(self, stato):
        assert is_pending(stato) is False

    def test_riga_provvisoria(self):
        pagina = load_fixture("transactions_page_3.json")["transactions"]
        riga = normalizza(pagina[2])
        assert riga["is_pending"] == 1
        assert riga["status"] == "PDNG"
        assert riga["effective_date"] == "2025-03-01"


class TestDatiIncompleti:
    def test_senza_valuta_e_un_errore(self):
        with pytest.raises(ValueError, match="valuta"):
            normalizza({"transaction_amount": {"amount": "1.00"}})

    def test_senza_importo_e_un_errore(self):
        with pytest.raises(ValueError, match="importo"):
            normalizza({"transaction_amount": {"currency": "EUR"}})

    def test_campi_facoltativi_assenti(self):
        riga = normalizza(
            {
                "transaction_amount": {"currency": "EUR", "amount": "1.00"},
                "credit_debit_indicator": "DBIT",
                "status": "BOOK",
                "booking_date": "2025-01-01",
            }
        )
        assert riga["counterparty_name"] is None
        assert riga["remittance_information"] is None
        assert riga["balance_after_minor"] is None
