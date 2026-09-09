"""Firma delle richieste.

Ogni chiamata all'API viaggia con un JWT firmato RS256 con la chiave privata
dell'applicazione; l'`kid` nell'header è l'ID dell'applicazione. Non esiste un
endpoint di login: il token *è* la credenziale.

La chiave privata non viene mai serializzata, loggata o inviata da nessuna
parte: resta in memoria per il tempo della firma e il suo percorso arriva da
una variabile d'ambiente.
"""

from __future__ import annotations

import time
from collections.abc import Callable

import jwt as pyjwt

ISSUER = "enablebanking.com"
AUDIENCE = "api.enablebanking.com"


class JwtSigner:
    """Genera e riusa il JWT finché è valido."""

    def __init__(
        self,
        application_id: str,
        private_key_loader: Callable[[], bytes],
        *,
        lifetime_seconds: int = 3600,
        refresh_margin_seconds: int = 120,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if lifetime_seconds <= refresh_margin_seconds:
            raise ValueError("lifetime_seconds deve essere maggiore di refresh_margin_seconds")
        self._application_id = application_id
        self._load_key = private_key_loader
        self._lifetime = lifetime_seconds
        self._margin = refresh_margin_seconds
        self._clock = clock
        self._token: str | None = None
        self._expires_at: float = 0.0

    def token(self) -> str:
        """Token valido, rigenerato quando sta per scadere."""
        now = self._clock()
        if self._token is not None and now < self._expires_at - self._margin:
            return self._token

        issued_at = int(now)
        expires_at = issued_at + self._lifetime
        self._token = pyjwt.encode(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "iat": issued_at,
                "exp": expires_at,
            },
            self._load_key(),
            algorithm="RS256",
            headers={"kid": self._application_id},
        )
        self._expires_at = float(expires_at)
        return self._token

    def authorization_header(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token()}"}
