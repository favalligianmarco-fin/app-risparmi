"""Client HTTP dell'API Enable Banking."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx

from ..errors import ApiError
from .jwt_auth import JwtSigner
from .models import (
    ApplicationInfo,
    AspspsResponse,
    BalancesResponse,
    Session,
    StartAuthorizationResponse,
    TransactionsPage,
)

logger = logging.getLogger(__name__)

# Oltre questo numero di pagine si smette e si segnala: significa quasi
# sicuramente che la banca sta restituendo sempre lo stesso continuation key.
MAX_PAGES = 500


class EnableBankingClient:
    """Chiamate all'API, con retry sui guasti transitori.

    Il client non conosce il database: restituisce i payload così come
    arrivano, in modo che chi chiama possa salvarli grezzi prima di
    interpretarli.
    """

    def __init__(
        self,
        *,
        api_origin: str,
        signer: JwtSigner,
        timeout: float = 60.0,
        psu_headers: dict[str, str] | None = None,
        max_retries: int = 3,
        client: httpx.Client | None = None,
    ) -> None:
        self._origin = api_origin.rstrip("/")
        self._signer = signer
        self._timeout = timeout
        self._psu_headers = psu_headers or {}
        self._max_retries = max_retries
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    # -- ciclo di vita ------------------------------------------------------

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> EnableBankingClient:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # -- livello di trasporto ----------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        with_psu_headers: bool = False,
    ) -> dict[str, Any]:
        url = f"{self._origin}{path}"
        clean_params = (
            {k: v for k, v in params.items() if v is not None} if params else None
        )

        last_error: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            headers = {
                **self._signer.authorization_header(),
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            if with_psu_headers:
                headers.update(self._psu_headers)

            try:
                response = self._client.request(
                    method, url, params=clean_params, json=json_body, headers=headers
                )
            except httpx.TransportError as exc:
                last_error = exc
                if attempt == self._max_retries:
                    raise ApiError(0, "NETWORK_ERROR", str(exc)) from exc
                self._sleep_backoff(attempt, reason=f"errore di rete: {exc}")
                continue

            if response.status_code < 400:
                if not response.content:
                    return {}
                try:
                    return response.json()
                except ValueError as exc:
                    raise ApiError(
                        response.status_code,
                        "INVALID_JSON",
                        "La risposta non è JSON valido",
                        detail=response.text[:500],
                    ) from exc

            error = self._build_error(response)

            # 5xx: guasto momentaneo lato banca o gateway, si riprova.
            if response.status_code >= 500 and attempt < self._max_retries:
                last_error = error
                self._sleep_backoff(attempt, reason=f"HTTP {response.status_code}")
                continue

            raise error

        raise ApiError(0, "RETRIES_EXHAUSTED", str(last_error))  # pragma: no cover

    @staticmethod
    def _build_error(response: httpx.Response) -> ApiError:
        payload: dict[str, Any] = {}
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                payload = parsed
        except ValueError:
            payload = {}
        return ApiError(
            status_code=response.status_code,
            error_code=payload.get("error") or payload.get("code_name"),
            message=payload.get("message") or (response.text[:300] or None),
            detail=payload.get("detail"),
            request_id=response.headers.get("x-request-id"),
        )

    @staticmethod
    def _sleep_backoff(attempt: int, *, reason: str) -> None:
        delay = 2.0**attempt
        logger.warning("Tentativo %s fallito (%s). Riprovo fra %.0fs.", attempt, reason, delay)
        time.sleep(delay)

    # -- endpoint -----------------------------------------------------------

    def get_application(self) -> ApplicationInfo:
        return ApplicationInfo.model_validate(self._request("GET", "/application"))

    def get_aspsps(self, *, country: str | None = None, psu_type: str | None = None):
        payload = self._request(
            "GET", "/aspsps", params={"country": country, "psu_type": psu_type}
        )
        return AspspsResponse.model_validate(payload).aspsps

    def start_authorization(
        self,
        *,
        aspsp_name: str,
        aspsp_country: str,
        valid_until: str,
        redirect_url: str,
        state: str,
        psu_type: str,
        language: str | None = None,
    ) -> StartAuthorizationResponse:
        body: dict[str, Any] = {
            "access": {"valid_until": valid_until},
            "aspsp": {"name": aspsp_name, "country": aspsp_country},
            "state": state,
            "redirect_url": redirect_url,
            "psu_type": psu_type,
        }
        if language:
            body["language"] = language
        return StartAuthorizationResponse.model_validate(
            self._request("POST", "/auth", json_body=body)
        )

    def authorize_session(self, code: str) -> Session:
        return Session.model_validate(self._request("POST", "/sessions", json_body={"code": code}))

    def get_session(self, session_id: str) -> Session:
        return Session.model_validate(self._request("GET", f"/sessions/{session_id}"))

    def delete_session(self, session_id: str) -> None:
        self._request("DELETE", f"/sessions/{session_id}", with_psu_headers=True)

    def get_account_details(self, account_uid: str) -> dict[str, Any]:
        return self._request("GET", f"/accounts/{account_uid}/details", with_psu_headers=True)

    def get_account_balances(self, account_uid: str) -> BalancesResponse:
        payload = self._request("GET", f"/accounts/{account_uid}/balances", with_psu_headers=True)
        return BalancesResponse.model_validate(payload)

    def get_transactions_page(
        self,
        account_uid: str,
        *,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
        strategy: str | None = None,
        continuation_key: str | None = None,
    ) -> tuple[dict[str, Any], TransactionsPage]:
        """Una singola pagina di movimenti.

        Restituisce ``(parametri_richiesta, pagina)``: i parametri servono a
        registrare in database con quale richiesta è stato ottenuto il payload
        grezzo.
        """
        params = {
            "date_from": _as_date_string(date_from),
            "date_to": _as_date_string(date_to),
            "strategy": strategy,
            "continuation_key": continuation_key,
        }
        payload = self._request(
            "GET",
            f"/accounts/{account_uid}/transactions",
            params=params,
            with_psu_headers=True,
        )
        return params, TransactionsPage.model_validate(payload)

    def iter_transaction_pages(
        self,
        account_uid: str,
        *,
        date_from: date | str | None = None,
        date_to: date | str | None = None,
        strategy: str | None = None,
    ) -> Iterator[tuple[int, dict[str, Any], TransactionsPage]]:
        """Scorre tutte le pagine di movimenti.

        Attenzione al criterio di uscita: con ``strategy=longest`` l'API può
        restituire una pagina con **zero movimenti** e un ``continuation_key``
        valorizzato, perché sta ancora risalendo indietro nel tempo dentro i
        sistemi della banca. Fermarsi sulla lista vuota significa troncare lo
        storico. L'unica condizione di fine è l'assenza del continuation key.
        """
        continuation_key: str | None = None
        seen_keys: set[str] = set()
        page_number = 0

        while True:
            page_number += 1
            if page_number > MAX_PAGES:
                raise ApiError(
                    0,
                    "TOO_MANY_PAGES",
                    f"Superate {MAX_PAGES} pagine per il conto {account_uid}: "
                    f"la banca continua a restituire un continuation key.",
                )

            params, page = self.get_transactions_page(
                account_uid,
                date_from=date_from,
                date_to=date_to,
                strategy=strategy,
                continuation_key=continuation_key,
            )
            yield page_number, params, page

            next_key = page.continuation_key
            if not next_key:
                return
            if next_key in seen_keys:
                raise ApiError(
                    0,
                    "REPEATED_CONTINUATION_KEY",
                    "La banca ha restituito due volte lo stesso continuation key: "
                    "interrotto per non ciclare all'infinito.",
                )
            seen_keys.add(next_key)
            continuation_key = next_key


def _as_date_string(value: date | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value)
