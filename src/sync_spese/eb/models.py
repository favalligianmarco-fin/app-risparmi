"""Modelli delle risposte dell'API.

I modelli sono volutamente **permissivi** (``extra="allow"``, quasi tutto
opzionale): ogni banca popola un sottoinsieme diverso dei campi e l'API
aggiunge campi nel tempo. Un modello rigido qui significherebbe che il
backfill si interrompe — dentro la finestra di un'ora in cui lo storico
completo è disponibile — per un campo che non ci serviva.

Per lo stesso motivo il payload grezzo viene sempre conservato in database:
i modelli servono a leggere ciò che serve adesso, non a decidere cosa è
lecito ricevere.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class Amount(ApiModel):
    # L'API restituisce l'importo come stringa decimale ("5.20"): si tiene
    # tale e quale e si converte con Decimal al momento della normalizzazione.
    currency: str
    amount: str | float | int


class AccountIdentification(ApiModel):
    iban: str | None = None
    other: dict[str, Any] | None = None


class Aspsp(ApiModel):
    name: str
    country: str


class AspspInfo(Aspsp):
    logo: str | None = None
    bic: str | None = None
    beta: bool = False
    # Durata massima del consenso in secondi, decisa dalla banca.
    maximum_consent_validity: int | None = None
    psu_types: list[str] = Field(default_factory=list)
    required_psu_headers: list[str] = Field(default_factory=list)
    auth_methods: list[dict[str, Any]] = Field(default_factory=list)


class AspspsResponse(ApiModel):
    aspsps: list[AspspInfo] = Field(default_factory=list)


class ApplicationInfo(ApiModel):
    name: str | None = None
    kid: str | None = None
    environment: str | None = None
    active: bool | None = None
    redirect_urls: list[str] = Field(default_factory=list)


class Access(ApiModel):
    valid_until: str
    balances: bool | None = None
    transactions: bool | None = None
    accounts: list[AccountIdentification] | None = None


class StartAuthorizationResponse(ApiModel):
    url: str
    authorization_id: str
    psu_id_hash: str | None = None


class Account(ApiModel):
    # `uid` è l'handle da usare nelle chiamate, ma è legato alla sessione:
    # cambia a ogni nuovo consenso. L'identificativo stabile nel tempo è
    # `identification_hash`.
    uid: str
    currency: str
    identification_hash: str
    identification_hashes: list[str] = Field(default_factory=list)
    account_id: AccountIdentification | None = None
    all_account_ids: list[dict[str, Any]] = Field(default_factory=list)
    name: str | None = None
    product: str | None = None
    details: str | None = None
    usage: str | None = None
    cash_account_type: str | None = None


class Session(ApiModel):
    session_id: str
    accounts: list[Account] = Field(default_factory=list)
    aspsp: Aspsp | None = None
    psu_type: str | None = None
    access: Access | None = None
    status: str | None = None
    created: str | None = None
    authorized: str | None = None


class BalanceResource(ApiModel):
    balance_amount: Amount
    balance_type: str
    name: str | None = None
    reference_date: str | None = None
    last_change_date_time: str | None = None
    last_committed_transaction: str | None = None


class BalancesResponse(ApiModel):
    balances: list[BalanceResource] = Field(default_factory=list)


class TransactionsPage(ApiModel):
    # I movimenti restano dizionari grezzi: la normalizzazione avviene in
    # `domain.normalize`, che è puro e testabile senza rete.
    transactions: list[dict[str, Any]] = Field(default_factory=list)
    continuation_key: str | None = None
