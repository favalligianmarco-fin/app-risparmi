"""Normalizzazione degli importi."""

from __future__ import annotations

from decimal import Decimal

import pytest

from sync_spese.domain.money import (
    format_minor_units,
    minor_units,
    signed_minor_units,
    to_decimal,
    to_minor_units,
)


class TestToDecimal:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("5.20", Decimal("5.20")),
            ("0.01", Decimal("0.01")),
            ("1752.38", Decimal("1752.38")),
            ("-3.00", Decimal("-3.00")),
            (12, Decimal(12)),
            (Decimal("7.77"), Decimal("7.77")),
        ],
    )
    def test_formati_dell_api(self, raw, expected):
        assert to_decimal(raw) == expected

    def test_virgola_decimale(self):
        assert to_decimal("1234,56") == Decimal("1234.56")

    def test_separatore_migliaia_con_punto(self):
        assert to_decimal("1.234,56") == Decimal("1234.56")

    def test_separatore_migliaia_con_virgola(self):
        assert to_decimal("1,234.56") == Decimal("1234.56")

    def test_spazi_non_separatori(self):
        assert to_decimal(" 1 234.56 ") == Decimal("1234.56")

    def test_float_non_porta_code_binarie(self):
        # 5.2 in binario non è esatto: passare da repr evita 5.2000000000000002
        assert to_decimal(5.2) == Decimal("5.2")

    @pytest.mark.parametrize("raw", ["", "   ", "abc", None, True])
    def test_valori_rifiutati(self, raw):
        with pytest.raises(ValueError):
            to_decimal(raw)


class TestMinorUnits:
    def test_euro_ha_due_decimali(self):
        assert minor_units("EUR") == 2

    def test_yen_non_ha_decimali(self):
        assert minor_units("JPY") == 0

    def test_dinaro_ha_tre_decimali(self):
        assert minor_units("TND") == 3

    def test_valuta_sconosciuta_usa_due(self):
        assert minor_units("ZZZ") == 2

    @pytest.mark.parametrize(
        ("raw", "currency", "expected"),
        [
            ("5.20", "EUR", 520),
            ("0.01", "EUR", 1),
            ("1752.38", "EUR", 175238),
            ("1000", "JPY", 1000),
            ("1.234", "TND", 1234),
        ],
    )
    def test_conversione(self, raw, currency, expected):
        assert to_minor_units(raw, currency) == expected

    def test_niente_errori_di_virgola_mobile(self):
        # 0.1 + 0.2 in float fa 0.30000000000000004; qui deve fare esattamente 30.
        assert to_minor_units("0.10", "EUR") + to_minor_units("0.20", "EUR") == 30


class TestSegno:
    def test_addebito_diventa_negativo(self):
        assert signed_minor_units("12.50", "EUR", "DBIT") == -1250

    def test_accredito_resta_positivo(self):
        assert signed_minor_units("1850.00", "EUR", "CRDT") == 185000

    def test_segno_gia_presente_non_raddoppia(self):
        # Alcune banche mandano sia il segno sia l'indicatore: l'indicatore
        # vince, altrimenti l'uscita diventerebbe un'entrata.
        assert signed_minor_units("-12.50", "EUR", "DBIT") == -1250
        assert signed_minor_units("-12.50", "EUR", "CRDT") == 1250

    def test_senza_indicatore_si_tiene_il_segno_dell_importo(self):
        assert signed_minor_units("-12.50", "EUR", None) == -1250
        assert signed_minor_units("12.50", "EUR", "") == 1250

    def test_indicatore_case_insensitive(self):
        assert signed_minor_units("1.00", "EUR", "dbit") == -100


class TestFormattazione:
    def test_euro(self):
        assert format_minor_units(-1250, "EUR") == "-12.50 EUR"

    def test_yen(self):
        assert format_minor_units(1000, "JPY") == "1000 JPY"

    def test_andata_e_ritorno(self):
        assert format_minor_units(to_minor_units("1752.38", "EUR"), "EUR") == "1752.38 EUR"
