"""Da risposta API a riga di database.

Funzione pura: prende il dizionario di un movimento così come arriva
dall'API e restituisce il dizionario dei campi da scrivere in tabella.
Non tocca né la rete né il database, quindi è interamente testabile.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from .dedup import bank_transaction_code_text, remittance_text
from .money import minor_units, signed_minor_units, to_minor_units

# Stati in cui un movimento è ancora provvisorio: può cambiare importo, data o
# sparire del tutto quando la banca lo contabilizza. Va trattato come volatile.
PENDING_STATUSES = frozenset({"PDNG", "SCHD"})


def is_pending(status: str | None) -> bool:
    return (status or "").strip().upper() in PENDING_STATUSES


def _party(value: Any) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _account_identification(value: Any) -> str | None:
    if not isinstance(value, Mapping):
        return None
    if value.get("iban"):
        return str(value["iban"]).strip() or None
    other = value.get("other")
    if isinstance(other, Mapping) and other.get("identification"):
        return str(other["identification"]).strip() or None
    return None


def counterparty(transaction: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """Nome e identificativo di conto della controparte.

    Su un'uscita (``DBIT``) la controparte è il creditore, su un'entrata
    (``CRDT``) il debitore. Se il campo atteso è vuoto si prova l'altro: alcune
    banche popolano solo uno dei due a prescindere dalla direzione.
    """
    indicator = (transaction.get("credit_debit_indicator") or "").strip().upper()
    creditor, debtor = _party(transaction.get("creditor")), _party(transaction.get("debtor"))
    creditor_account = transaction.get("creditor_account")
    debtor_account = transaction.get("debtor_account")

    if indicator == "CRDT":
        primary, secondary = debtor, creditor
        primary_account, secondary_account = debtor_account, creditor_account
    else:
        primary, secondary = creditor, debtor
        primary_account, secondary_account = creditor_account, debtor_account

    name = None
    for party in (primary, secondary):
        if party and party.get("name"):
            name = str(party["name"]).strip() or None
            if name:
                break

    account = _account_identification(primary_account) or _account_identification(secondary_account)
    return name, account


def best_date(transaction: Mapping[str, Any]) -> str | None:
    """Data da usare per ordinare e filtrare i movimenti.

    Si preferisce la data di contabilizzazione; se manca si ripiega su data
    valuta e infine sulla data dell'operazione.
    """
    for field in ("booking_date", "value_date", "transaction_date"):
        value = transaction.get(field)
        if value:
            return str(value).strip()
    return None


def normalize_transaction(
    transaction: Mapping[str, Any],
    *,
    dedup_key: str,
    dedup_source: str,
    account_id: int,
    user_id: str,
) -> dict[str, Any]:
    """Costruisce la riga da inserire in ``transactions``."""
    amount = transaction.get("transaction_amount") or {}
    raw_amount = amount.get("amount")
    currency = str(amount.get("currency") or "").strip().upper()
    if not currency:
        raise ValueError("Movimento senza valuta: impossibile normalizzare l'importo")
    if raw_amount is None:
        raise ValueError("Movimento senza importo")

    indicator = (transaction.get("credit_debit_indicator") or "").strip().upper() or None
    status = (transaction.get("status") or "").strip().upper() or None

    balance_after = transaction.get("balance_after_transaction")
    balance_after_minor = None
    balance_after_currency = None
    if isinstance(balance_after, Mapping) and balance_after.get("amount") is not None:
        balance_after_currency = str(balance_after.get("currency") or currency).strip().upper()
        balance_after_minor = to_minor_units(balance_after["amount"], balance_after_currency)

    name, account_identification = counterparty(transaction)

    return {
        "user_id": user_id,
        "account_id": account_id,
        "dedup_key": dedup_key,
        "dedup_source": dedup_source,
        "transaction_id": (transaction.get("transaction_id") or None),
        "entry_reference": (transaction.get("entry_reference") or None),
        "amount_minor": signed_minor_units(raw_amount, currency, indicator),
        "amount_raw": str(raw_amount),
        "currency": currency,
        "currency_exponent": minor_units(currency),
        "credit_debit_indicator": indicator,
        "status": status,
        "is_pending": 1 if is_pending(status) else 0,
        "booking_date": (transaction.get("booking_date") or None),
        "value_date": (transaction.get("value_date") or None),
        "transaction_date": (transaction.get("transaction_date") or None),
        "effective_date": best_date(transaction),
        "counterparty_name": name,
        "counterparty_account": account_identification,
        "remittance_information": remittance_text(transaction.get("remittance_information")) or None,
        "reference_number": (transaction.get("reference_number") or None),
        "merchant_category_code": (transaction.get("merchant_category_code") or None),
        "bank_transaction_code": bank_transaction_code_text(
            transaction.get("bank_transaction_code")
        ) or None,
        "note": (transaction.get("note") or None),
        "balance_after_minor": balance_after_minor,
        "balance_after_currency": balance_after_currency,
        "raw_json": json.dumps(transaction, ensure_ascii=False, sort_keys=True),
    }
