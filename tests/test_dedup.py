"""Chiave di deduplica: è ciò che rende il sync ripetibile."""

from __future__ import annotations

import copy

from sync_spese.domain.dedup import (
    SOURCE_ENTRY_REFERENCE,
    SOURCE_FINGERPRINT,
    SOURCE_TRANSACTION_ID,
    assign_keys,
    base_key,
    fingerprint,
    remittance_text,
)

ACCOUNT = "hash-conto"

MOVIMENTO = {
    "entry_reference": "202503140000123456",
    "transaction_id": None,
    "transaction_amount": {"currency": "EUR", "amount": "12.50"},
    "credit_debit_indicator": "DBIT",
    "status": "BOOK",
    "booking_date": "2025-03-14",
    "value_date": "2025-03-14",
    "creditor": {"name": "BAR CENTRALE SRL"},
    "remittance_information": ["POS 14/03/25"],
}


class TestPriorita:
    def test_usa_transaction_id_quando_c_e(self):
        movimento = {**MOVIMENTO, "transaction_id": "TX-9999"}
        key, source = base_key(movimento, account_key=ACCOUNT)
        assert source == SOURCE_TRANSACTION_ID
        assert key == "tid:TX-9999"

    def test_ripiega_su_entry_reference(self):
        key, source = base_key(MOVIMENTO, account_key=ACCOUNT)
        assert source == SOURCE_ENTRY_REFERENCE
        assert key == "eref:202503140000123456"

    def test_ultima_spiaggia_impronta(self):
        movimento = {**MOVIMENTO, "entry_reference": None}
        key, source = base_key(movimento, account_key=ACCOUNT)
        assert source == SOURCE_FINGERPRINT
        assert key.startswith("fp:")

    def test_stringhe_vuote_valgono_come_assenti(self):
        movimento = {**MOVIMENTO, "transaction_id": "  ", "entry_reference": ""}
        _, source = base_key(movimento, account_key=ACCOUNT)
        assert source == SOURCE_FINGERPRINT


class TestImpronta:
    def test_stabile_fra_chiamate(self):
        assert fingerprint(MOVIMENTO, account_key=ACCOUNT) == fingerprint(
            copy.deepcopy(MOVIMENTO), account_key=ACCOUNT
        )

    def test_indipendente_dall_ordine_delle_chiavi(self):
        rovesciato = dict(reversed(list(MOVIMENTO.items())))
        assert fingerprint(rovesciato, account_key=ACCOUNT) == fingerprint(
            MOVIMENTO, account_key=ACCOUNT
        )

    def test_importo_diverso_impronta_diversa(self):
        altro = {**MOVIMENTO, "transaction_amount": {"currency": "EUR", "amount": "12.51"}}
        assert fingerprint(altro, account_key=ACCOUNT) != fingerprint(
            MOVIMENTO, account_key=ACCOUNT
        )

    def test_direzione_diversa_impronta_diversa(self):
        altro = {**MOVIMENTO, "credit_debit_indicator": "CRDT"}
        assert fingerprint(altro, account_key=ACCOUNT) != fingerprint(
            MOVIMENTO, account_key=ACCOUNT
        )

    def test_conto_diverso_impronta_diversa(self):
        assert fingerprint(MOVIMENTO, account_key="altro-conto") != fingerprint(
            MOVIMENTO, account_key=ACCOUNT
        )

    def test_spazi_e_maiuscole_non_contano(self):
        variante = {
            **MOVIMENTO,
            "creditor": {"name": "  bar   centrale srl "},
            "remittance_information": ["pos  14/03/25"],
        }
        assert fingerprint(variante, account_key=ACCOUNT) == fingerprint(
            MOVIMENTO, account_key=ACCOUNT
        )

    def test_importo_illeggibile_non_fa_esplodere(self):
        rotto = {**MOVIMENTO, "transaction_amount": {"currency": "EUR", "amount": "n/d"}}
        assert fingerprint(rotto, account_key=ACCOUNT).startswith(("0", "1", "2", "3", "4",
                                                                  "5", "6", "7", "8", "9",
                                                                  "a", "b", "c", "d", "e", "f"))


class TestAssegnazione:
    def test_rieseguire_produce_le_stesse_chiavi(self):
        lotto = [MOVIMENTO, {**MOVIMENTO, "entry_reference": "AAA"}]
        assert assign_keys(lotto, account_key=ACCOUNT) == assign_keys(
            lotto, account_key=ACCOUNT
        )

    def test_movimenti_identici_vengono_numerati(self):
        caffe = {**MOVIMENTO, "entry_reference": None}
        chiavi = [key for key, _ in assign_keys([caffe, caffe, caffe], account_key=ACCOUNT)]
        assert len(set(chiavi)) == 3
        assert chiavi[0].startswith("fp:") and "#" not in chiavi[0]
        assert chiavi[1].endswith("#1")
        assert chiavi[2].endswith("#2")

    def test_il_primo_non_cambia_quando_ne_arriva_un_secondo(self):
        # La chiave già scritta in database non deve cambiare quando in futuro
        # compare un movimento identico: altrimenti si duplicherebbe.
        caffe = {**MOVIMENTO, "entry_reference": None}
        prima = assign_keys([caffe], account_key=ACCOUNT)
        dopo = assign_keys([caffe, caffe], account_key=ACCOUNT)
        assert prima[0] == dopo[0]

    def test_l_ordine_di_arrivo_non_cambia_l_insieme(self):
        a = {**MOVIMENTO, "entry_reference": None}
        b = {**MOVIMENTO, "entry_reference": None, "value_date": "2025-03-15"}
        avanti = {key for key, _ in assign_keys([a, b, a], account_key=ACCOUNT)}
        indietro = {key for key, _ in assign_keys([a, a, b], account_key=ACCOUNT)}
        assert avanti == indietro

    def test_lotto_vuoto(self):
        assert assign_keys([], account_key=ACCOUNT) == []


class TestCausale:
    def test_lista_diventa_testo(self):
        assert remittance_text(["riga uno", "riga due"]) == "riga uno\nriga due"

    def test_none_diventa_stringa_vuota(self):
        assert remittance_text(None) == ""

    def test_stringa_resta_stringa(self):
        assert remittance_text("  causale  ") == "causale"
