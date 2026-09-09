"""Chiave di deduplica dei movimenti.

Rieseguire il sync dieci volte non deve creare duplicati né perdere nulla.
Serve quindi una chiave stabile fra un fetch e l'altro.

**Perché non basta `transaction_id`.** L'API espone il campo, ma è opzionale:
in pratica moltissime banche lo restituiscono ``null`` (lo si vede anche nelle
response di esempio pubblicate da Enable Banking). Usarlo da solo come chiave
significherebbe non avere nessuna chiave per la maggior parte dei movimenti.

Si usa quindi una catena di fallback, dalla più forte alla più debole:

1. ``transaction_id`` — identificativo del movimento, quando c'è.
2. ``entry_reference`` — riferimento di scrittura contabile assegnato dalla
   banca. Stabile per i movimenti contabilizzati; è quello che UniCredit e la
   maggior parte delle banche italiane popolano davvero.
3. **impronta** — SHA-256 di un insieme di campi che identificano il movimento
   (data, importo con segno, valuta, controparte, causale, riferimento). È il
   caso residuo: serve per le banche che non danno né l'uno né l'altro.

Il livello effettivamente usato viene salvato accanto alla chiave
(``dedup_source``), così è sempre possibile sapere quanto è affidabile la
deduplica di una certa riga.

**Movimenti identici nello stesso giorno.** Due caffè da 1,20 € lo stesso
giorno producono la stessa impronta. Non è un errore da correggere: sono
davvero indistinguibili. Vengono quindi numerati (``#0``, ``#1``, …) in base a
quanti ne compaiono nello stesso lotto. La numerazione è deterministica perché
gli elementi del gruppo sono, per costruzione, identici fra loro: l'ordine in
cui arrivano non cambia l'insieme di chiavi prodotto. E poiché membri dello
stesso gruppo condividono la stessa data, una finestra temporale non può
spezzare un gruppo a metà.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from .money import signed_minor_units

SOURCE_TRANSACTION_ID = "transaction_id"
SOURCE_ENTRY_REFERENCE = "entry_reference"
SOURCE_FINGERPRINT = "fingerprint"

_WHITESPACE = re.compile(r"\s+")


def _clean(value: Any) -> str:
    """Normalizza un valore testuale per renderlo confrontabile."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return _clean(" ".join(str(item) for item in value if item is not None))
    return _WHITESPACE.sub(" ", str(value)).strip().upper()


def _party_name(party: Any) -> str:
    if isinstance(party, Mapping):
        return _clean(party.get("name"))
    return ""


def _account_identifier(account: Any) -> str:
    if isinstance(account, Mapping):
        if account.get("iban"):
            return _clean(account["iban"])
        other = account.get("other")
        if isinstance(other, Mapping):
            return _clean(other.get("identification"))
    return ""


def remittance_text(value: Any) -> str:
    """Causale in forma leggibile: la lista dell'API diventa una stringa."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (list, tuple)):
        return "\n".join(str(item).strip() for item in value if item is not None).strip()
    return str(value).strip()


def bank_transaction_code_text(value: Any) -> str:
    """Appiattisce ``bank_transaction_code`` in una stringa comparabile."""
    if not isinstance(value, Mapping):
        return _clean(value)
    parts = [value.get("code"), value.get("sub_code"), value.get("description")]
    return " / ".join(_clean(part) for part in parts if part)


def fingerprint(transaction: Mapping[str, Any], *, account_key: str) -> str:
    """Impronta stabile del movimento, indipendente dall'ordine dei campi."""
    amount = transaction.get("transaction_amount") or {}
    currency = _clean(amount.get("currency"))
    try:
        signed = signed_minor_units(
            amount.get("amount", "0"),
            amount.get("currency") or "EUR",
            transaction.get("credit_debit_indicator"),
        )
    except ValueError:
        # Importo illeggibile: si conserva comunque il valore grezzo, così due
        # movimenti diversi non collassano sulla stessa impronta.
        signed = _clean(amount.get("amount"))

    material: Sequence[Any] = (
        account_key,
        _clean(transaction.get("booking_date")),
        _clean(transaction.get("value_date")),
        _clean(transaction.get("transaction_date")),
        signed,
        currency,
        _clean(transaction.get("credit_debit_indicator")),
        _clean(transaction.get("status")),
        _party_name(transaction.get("creditor")),
        _party_name(transaction.get("debtor")),
        _account_identifier(transaction.get("creditor_account")),
        _account_identifier(transaction.get("debtor_account")),
        _clean(remittance_text(transaction.get("remittance_information"))),
        _clean(transaction.get("reference_number")),
        _clean(transaction.get("merchant_category_code")),
        bank_transaction_code_text(transaction.get("bank_transaction_code")),
    )
    payload = json.dumps(list(material), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def base_key(transaction: Mapping[str, Any], *, account_key: str) -> tuple[str, str]:
    """Chiave di deduplica non ancora disambiguata, con la sua provenienza."""
    transaction_id = (transaction.get("transaction_id") or "").strip() if isinstance(
        transaction.get("transaction_id"), str
    ) else ""
    if transaction_id:
        return f"tid:{transaction_id}", SOURCE_TRANSACTION_ID

    entry_reference = (transaction.get("entry_reference") or "").strip() if isinstance(
        transaction.get("entry_reference"), str
    ) else ""
    if entry_reference:
        return f"eref:{entry_reference}", SOURCE_ENTRY_REFERENCE

    return f"fp:{fingerprint(transaction, account_key=account_key)}", SOURCE_FINGERPRINT


def assign_keys(
    transactions: Iterable[Mapping[str, Any]],
    *,
    account_key: str,
) -> list[tuple[str, str]]:
    """Assegna a ogni movimento del lotto la sua chiave definitiva.

    Restituisce una lista ``(chiave, provenienza)`` parallela all'input. Le
    collisioni vengono numerate con un suffisso ``#n``; il primo elemento di un
    gruppo resta senza suffisso, così le chiavi già scritte in database non
    cambiano quando in futuro compare un secondo movimento identico.
    """
    seen: Counter[str] = Counter()
    keys: list[tuple[str, str]] = []
    for transaction in transactions:
        key, source = base_key(transaction, account_key=account_key)
        occurrence = seen[key]
        seen[key] += 1
        keys.append((key if occurrence == 0 else f"{key}#{occurrence}", source))
    return keys
