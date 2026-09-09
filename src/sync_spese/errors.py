"""Eccezioni dell'applicazione.

Tutto ciò che l'utente deve poter leggere e capire senza traceback eredita da
`SyncSpeseError`: la CLI le intercetta e stampa solo il messaggio.
"""

from __future__ import annotations


class SyncSpeseError(Exception):
    """Errore atteso, con messaggio pensato per l'utente finale."""


class ConfigError(SyncSpeseError):
    """Configurazione mancante o non valida."""


class ApiError(SyncSpeseError):
    """Risposta di errore dell'API Enable Banking.

    Il corpo degli errori ha la forma::

        {"code": 422,
         "message": "Wrong transactions period requested",
         "detail": {"message": "Requested time period out of bound."},
         "error": "WRONG_TRANSACTIONS_PERIOD"}
    """

    def __init__(
        self,
        status_code: int,
        error_code: str | None = None,
        message: str | None = None,
        detail: object = None,
        request_id: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.detail = detail
        self.request_id = request_id
        parts = [f"HTTP {status_code}"]
        if error_code:
            parts.append(error_code)
        if message:
            parts.append(str(message))
        if detail:
            parts.append(f"detail={detail!r}")
        if request_id:
            parts.append(f"request_id={request_id}")
        super().__init__(" | ".join(parts))

    @property
    def is_expired_session(self) -> bool:
        return self.error_code in {"EXPIRED_SESSION", "SESSION_EXPIRED"} or (
            self.status_code == 401 and self.error_code == "UNAUTHORIZED_ACCESS"
        )

    @property
    def is_session_gone(self) -> bool:
        return self.error_code in {"SESSION_NOT_FOUND", "WRONG_SESSION_STATUS"}

    @property
    def is_rate_limited(self) -> bool:
        return self.status_code == 429 or self.error_code == "ASPSP_RATE_LIMIT_EXCEEDED"

    @property
    def is_wrong_period(self) -> bool:
        return self.error_code == "WRONG_TRANSACTIONS_PERIOD"


class ConsentError(SyncSpeseError):
    """Il consenso è scaduto, revocato o non ancora ottenuto."""


class MigrationError(SyncSpeseError):
    """Il database non è nello stato atteso."""
