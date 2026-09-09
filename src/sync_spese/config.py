"""Caricamento e validazione della configurazione da `.env`.

Nessun valore sensibile è presente nel codice: tutto arriva da variabili
d'ambiente. La chiave privata non viene mai letta qui — si conserva solo il
percorso, e il contenuto viene caricato al momento della firma.
"""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .errors import ConfigError

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _get(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _require(name: str) -> str:
    value = _get(name)
    if not value:
        raise ConfigError(
            f"Variabile d'ambiente {name} mancante o vuota. "
            f"Copia .env.example in .env e compilala."
        )
    return value


def _int(name: str, default: int) -> int:
    raw = _get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} deve essere un numero intero, trovato {raw!r}") from exc


def _optional_int(name: str) -> int | None:
    raw = _get(name)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} deve essere un numero intero, trovato {raw!r}") from exc


@dataclass(frozen=True)
class Settings:
    application_id: str
    private_key_path: Path
    api_origin: str
    redirect_url: str
    aspsp_name: str | None
    aspsp_country: str | None
    psu_type: str
    language: str
    consent_days: int | None
    psu_ip_address: str | None
    psu_user_agent: str | None
    user_id: str
    database_path: Path
    http_timeout: float
    log_level: str

    @property
    def psu_headers(self) -> dict[str, str]:
        """Header PSU per le chiamate "online".

        Regola dell'API: o si mandano tutti quelli richiesti dalla banca, o
        nessuno. Fornirne solo una parte produce 422 PSU_HEADER_NOT_PROVIDED,
        quindi qui li includiamo solo se sono configurati entrambi.
        """
        if self.psu_ip_address and self.psu_user_agent:
            return {
                "psu-ip-address": self.psu_ip_address,
                "psu-user-agent": self.psu_user_agent,
            }
        return {}

    def read_private_key(self) -> bytes:
        path = self.private_key_path
        if not path.is_file():
            raise ConfigError(
                f"Chiave privata non trovata in {path}. "
                f"Controlla EB_PRIVATE_KEY_PATH nel file .env."
            )
        try:
            mode = path.stat().st_mode
        except OSError:  # pragma: no cover - dipende dal filesystem
            mode = 0
        if mode & (stat.S_IRGRP | stat.S_IROTH):
            # Non è fatale, ma va detto: è la chiave che autentica l'app.
            print(
                f"ATTENZIONE: {path} è leggibile da altri utenti del sistema. "
                f"Esegui: chmod 600 {path}"
            )
        return path.read_bytes()


def load_settings(env_file: Path | str | None = None) -> Settings:
    """Legge `.env` (se presente) e costruisce le impostazioni.

    Le variabili già presenti nell'ambiente hanno la precedenza sul file.
    """
    candidate = Path(env_file) if env_file else PROJECT_ROOT / ".env"
    if candidate.is_file():
        load_dotenv(candidate, override=False)

    database_path = Path(_get("DATABASE_PATH", "data/spese.sqlite3") or "data/spese.sqlite3")
    if not database_path.is_absolute():
        database_path = PROJECT_ROOT / database_path

    private_key_path = Path(_require("EB_PRIVATE_KEY_PATH")).expanduser()
    if not private_key_path.is_absolute():
        private_key_path = (PROJECT_ROOT / private_key_path).resolve()

    psu_type = (_get("EB_PSU_TYPE", "personal") or "personal").lower()
    if psu_type not in {"personal", "business"}:
        raise ConfigError(f"EB_PSU_TYPE deve essere 'personal' o 'business', trovato {psu_type!r}")

    consent_days = _optional_int("EB_CONSENT_DAYS")
    if consent_days is not None and consent_days < 1:
        raise ConfigError("EB_CONSENT_DAYS deve essere >= 1 (o vuoto per usare il massimo).")

    country = _get("EB_ASPSP_COUNTRY")

    return Settings(
        application_id=_require("EB_APPLICATION_ID"),
        private_key_path=private_key_path,
        api_origin=(_get("EB_API_ORIGIN", "https://api.enablebanking.com") or "").rstrip("/"),
        redirect_url=_get("EB_REDIRECT_URL", "http://localhost:8080/auth_redirect")
        or "http://localhost:8080/auth_redirect",
        aspsp_name=_get("EB_ASPSP_NAME"),
        aspsp_country=country.upper() if country else None,
        psu_type=psu_type,
        language=(_get("EB_LANGUAGE", "IT") or "IT").upper(),
        consent_days=consent_days,
        psu_ip_address=_get("EB_PSU_IP_ADDRESS"),
        psu_user_agent=_get("EB_PSU_USER_AGENT"),
        user_id=_get("APP_USER_ID", "local") or "local",
        database_path=database_path,
        http_timeout=float(_int("HTTP_TIMEOUT", 60)),
        log_level=(_get("LOG_LEVEL", "INFO") or "INFO").upper(),
    )
