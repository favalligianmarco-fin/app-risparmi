"""Calcoli sulla scadenza del consenso.

Il consenso ha una durata massima decisa dalla banca (al massimo 180 giorni,
spesso meno) e scaduto quello serve una nuova SCA. Qui c'è solo aritmetica su
date: nessun I/O, così è verificabile con un orologio finto.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# Tetto regolamentare: nessuna banca può concedere più di 180 giorni.
MAX_CONSENT_DAYS = 180
# Sotto questa soglia conviene già programmare la ri-autenticazione.
WARNING_DAYS = 7


def parse_timestamp(value: str) -> datetime:
    """Interpreta un timestamp ISO 8601 dell'API, normalizzandolo a UTC.

    L'API usa sia il suffisso ``Z`` sia l'offset esplicito; ``fromisoformat``
    prima di Python 3.11 non accettava il primo, quindi lo si converte.
    """
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def requested_valid_until(
    *,
    now: datetime,
    maximum_consent_validity_seconds: int | None,
    requested_days: int | None = None,
    safety_margin_seconds: int = 60,
) -> datetime:
    """Data di scadenza da chiedere alla banca.

    Si prende il minimo fra quanto chiesto in configurazione e quanto la banca
    dichiara di poter concedere (``maximum_consent_validity``, in secondi, dal
    campo restituito da ``/aspsps``). Chiedere più del massimo fa fallire la
    richiesta, quindi si tronca. Il margine di sicurezza copre il tempo che
    passa fra il calcolo e l'arrivo della richiesta alla banca.
    """
    ceiling = timedelta(days=MAX_CONSENT_DAYS)
    if maximum_consent_validity_seconds and maximum_consent_validity_seconds > 0:
        ceiling = min(ceiling, timedelta(seconds=maximum_consent_validity_seconds))

    wanted = timedelta(days=requested_days) if requested_days else ceiling
    duration = min(wanted, ceiling)

    if duration > timedelta(seconds=safety_margin_seconds):
        duration -= timedelta(seconds=safety_margin_seconds)
    return now + duration


@dataclass(frozen=True)
class ConsentStatus:
    valid_until: datetime
    now: datetime

    @property
    def remaining(self) -> timedelta:
        return self.valid_until - self.now

    @property
    def is_expired(self) -> bool:
        return self.remaining.total_seconds() <= 0

    @property
    def needs_attention(self) -> bool:
        return self.remaining <= timedelta(days=WARNING_DAYS)

    @property
    def days_left(self) -> int:
        """Giorni interi mancanti (0 se è già scaduto)."""
        return max(0, self.remaining.days)

    def describe(self) -> str:
        if self.is_expired:
            overdue = -self.remaining
            return f"SCADUTO da {format_duration(overdue)}"
        return f"valido ancora per {format_duration(self.remaining)}"


def format_duration(delta: timedelta) -> str:
    """Durata in italiano leggibile: '12 giorni, 3 ore'."""
    total_seconds = int(abs(delta).total_seconds())
    days, remainder = divmod(total_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes = remainder // 60

    parts: list[str] = []
    if days:
        parts.append(f"{days} giorno" if days == 1 else f"{days} giorni")
    if hours:
        parts.append(f"{hours} ora" if hours == 1 else f"{hours} ore")
    if minutes and not days:
        parts.append(f"{minutes} minuto" if minutes == 1 else f"{minutes} minuti")
    if not parts:
        parts.append("meno di un minuto")
    return ", ".join(parts)


def status_for(valid_until: str, *, now: datetime | None = None) -> ConsentStatus:
    return ConsentStatus(
        valid_until=parse_timestamp(valid_until),
        now=now or datetime.now(timezone.utc),
    )
