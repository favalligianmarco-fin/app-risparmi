"""Scadenza del consenso."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from sync_spese.domain.consent import (
    MAX_CONSENT_DAYS,
    format_duration,
    parse_timestamp,
    requested_valid_until,
    status_for,
)

ADESSO = datetime(2025, 3, 14, 12, 0, 0, tzinfo=timezone.utc)


class TestParsing:
    def test_suffisso_z(self):
        assert parse_timestamp("2024-11-26T05:16:41Z") == datetime(
            2024, 11, 26, 5, 16, 41, tzinfo=timezone.utc
        )

    def test_offset_esplicito(self):
        assert parse_timestamp("2024-11-26T06:16:41+01:00") == datetime(
            2024, 11, 26, 5, 16, 41, tzinfo=timezone.utc
        )

    def test_con_microsecondi(self):
        assert parse_timestamp("2024-11-26T05:16:41.977681Z").microsecond == 977681

    def test_senza_fuso_si_assume_utc(self):
        assert parse_timestamp("2024-11-26T05:16:41").tzinfo == timezone.utc


class TestDurataRichiesta:
    def test_usa_il_massimo_della_banca_se_non_specificato(self):
        scadenza = requested_valid_until(
            now=ADESSO, maximum_consent_validity_seconds=90 * 86400
        )
        assert (scadenza - ADESSO) == timedelta(days=90) - timedelta(seconds=60)

    def test_tronca_al_massimo_della_banca(self):
        # Chiedere più del consentito fa fallire la richiesta: si tronca.
        scadenza = requested_valid_until(
            now=ADESSO, maximum_consent_validity_seconds=90 * 86400, requested_days=180
        )
        assert (scadenza - ADESSO) <= timedelta(days=90)

    def test_rispetta_una_richiesta_piu_corta(self):
        scadenza = requested_valid_until(
            now=ADESSO, maximum_consent_validity_seconds=180 * 86400, requested_days=30
        )
        assert (scadenza - ADESSO) == timedelta(days=30) - timedelta(seconds=60)

    def test_mai_oltre_il_tetto_regolamentare(self):
        scadenza = requested_valid_until(
            now=ADESSO, maximum_consent_validity_seconds=None, requested_days=365
        )
        assert (scadenza - ADESSO) <= timedelta(days=MAX_CONSENT_DAYS)

    def test_massimo_assente_usa_il_tetto(self):
        scadenza = requested_valid_until(now=ADESSO, maximum_consent_validity_seconds=0)
        assert (scadenza - ADESSO) == timedelta(days=MAX_CONSENT_DAYS) - timedelta(seconds=60)


class TestStato:
    def test_consenso_valido(self):
        stato = status_for("2025-06-14T12:00:00Z", now=ADESSO)
        assert not stato.is_expired
        assert not stato.needs_attention
        assert stato.days_left == 92

    def test_consenso_in_scadenza(self):
        stato = status_for("2025-03-18T12:00:00Z", now=ADESSO)
        assert not stato.is_expired
        assert stato.needs_attention
        assert stato.days_left == 4

    def test_consenso_scaduto(self):
        stato = status_for("2025-03-01T12:00:00Z", now=ADESSO)
        assert stato.is_expired
        assert stato.days_left == 0
        assert "SCADUTO" in stato.describe()

    def test_descrizione_leggibile(self):
        stato = status_for("2025-03-26T15:00:00Z", now=ADESSO)
        assert stato.describe() == "valido ancora per 12 giorni, 3 ore"


class TestFormattazioneDurata:
    @pytest.mark.parametrize(
        ("delta", "atteso"),
        [
            (timedelta(days=1), "1 giorno"),
            (timedelta(days=2, hours=5), "2 giorni, 5 ore"),
            (timedelta(hours=1), "1 ora"),
            (timedelta(minutes=30), "30 minuti"),
            (timedelta(seconds=5), "meno di un minuto"),
            (timedelta(days=-3), "3 giorni"),
        ],
    )
    def test_casi(self, delta, atteso):
        assert format_duration(delta) == atteso
