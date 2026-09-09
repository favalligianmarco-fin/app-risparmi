"""Normalizzazione degli importi.

L'API restituisce gli importi come **stringhe** decimali senza segno
(es. ``{"currency": "EUR", "amount": "5.20"}``) e mette la direzione in un
campo separato, ``credit_debit_indicator`` (``DBIT`` = uscita,
``CRDT`` = entrata).

In database non salviamo float: un float binario non rappresenta esattamente
0.10 e sommare qualche migliaio di movimenti produce errori visibili. Salviamo
un intero nella valuta minore (centesimi per l'euro), con segno:

* negativo = soldi usciti dal conto
* positivo = soldi entrati

La stringa originale viene comunque conservata, così la conversione resta
sempre verificabile a posteriori.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

DEBIT = "DBIT"
CREDIT = "CRDT"

# Esponente ISO 4217 (numero di decimali) per le valute che non usano 2 cifre.
# Tutto il resto vale 2, che è il caso di EUR.
_MINOR_UNIT_EXCEPTIONS: dict[str, int] = {
    "BHD": 3, "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "IQD": 3, "ISK": 0,
    "JOD": 3, "JPY": 0, "KMF": 0, "KRW": 0, "KWD": 3, "LYD": 3, "OMR": 3,
    "PYG": 0, "RWF": 0, "TND": 3, "UGX": 0, "UYW": 4, "VND": 0, "VUV": 0,
    "XAF": 0, "XOF": 0, "XPF": 0,
}


def minor_units(currency: str) -> int:
    """Numero di decimali della valuta (2 per l'euro)."""
    return _MINOR_UNIT_EXCEPTIONS.get((currency or "").strip().upper(), 2)


def to_decimal(amount: str | int | float | Decimal) -> Decimal:
    """Converte in ``Decimal`` un importo che arriva dall'API.

    Accetta stringhe (il caso normale), interi e ``Decimal``. I float sono
    accettati ma passano da ``str`` per evitare code binarie del tipo
    ``5.2000000000000002``.
    """
    if isinstance(amount, Decimal):
        return amount
    if isinstance(amount, bool):  # bool è sottoclasse di int: escludilo esplicitamente
        raise ValueError(f"Importo non valido: {amount!r}")
    if isinstance(amount, int):
        return Decimal(amount)
    if isinstance(amount, float):
        return Decimal(repr(amount))
    if isinstance(amount, str):
        # Spazi normali, non-breaking e narrow no-break usati come separatori.
        cleaned = amount.strip()
        for space in (" ", "\u00a0", "\u202f", "\u2009", "_"):
            cleaned = cleaned.replace(space, "")
        if not cleaned:
            raise ValueError("Importo vuoto")
        # Alcune banche usano la virgola come separatore decimale.
        if "," in cleaned and "." in cleaned:
            # Il separatore decimale è l'ultimo che compare.
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        try:
            return Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError(f"Importo non riconosciuto: {amount!r}") from exc
    raise ValueError(f"Tipo di importo non supportato: {type(amount).__name__}")


def to_minor_units(amount: str | int | float | Decimal, currency: str) -> int:
    """Converte un importo nella sua unità minore (centesimi per l'euro).

    Il segno dell'input viene mantenuto. Per applicare il segno a partire da
    ``credit_debit_indicator`` usa :func:`signed_minor_units`.
    """
    value = to_decimal(amount)
    exponent = minor_units(currency)
    quantum = Decimal(1).scaleb(-exponent)
    scaled = value.quantize(quantum, rounding=ROUND_HALF_UP).scaleb(exponent)
    return int(scaled)


def signed_minor_units(
    amount: str | int | float | Decimal,
    currency: str,
    credit_debit_indicator: str | None,
) -> int:
    """Importo in unità minori, con segno derivato dalla direzione.

    ``DBIT`` produce un valore negativo, ``CRDT`` positivo. L'eventuale segno
    già presente nella stringa viene ignorato quando l'indicatore c'è: le due
    informazioni sono ridondanti e alcune banche le forniscono entrambe, per
    cui moltiplicarle darebbe un movimento invertito.

    Se l'indicatore manca o è sconosciuto si tiene il segno dell'importo.
    """
    magnitude = to_minor_units(amount, currency)
    indicator = (credit_debit_indicator or "").strip().upper()
    if indicator == DEBIT:
        return -abs(magnitude)
    if indicator == CREDIT:
        return abs(magnitude)
    return magnitude


def format_minor_units(value: int, currency: str) -> str:
    """Rappresentazione leggibile di un importo salvato in unità minori."""
    exponent = minor_units(currency)
    amount = (Decimal(value).scaleb(-exponent)).quantize(Decimal(1).scaleb(-exponent))
    return f"{amount} {currency.upper()}"
