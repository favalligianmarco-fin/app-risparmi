"""Cattura del redirect dopo l'autenticazione in banca."""

from __future__ import annotations

import socket
import threading
import time

import httpx

from sync_spese.redirect_server import extract_code, wait_for_code


def porta_libera() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TestEstrazioneManuale:
    def test_url_con_codice(self):
        risultato = extract_code(
            "http://localhost:8080/auth_redirect?code=ABC-123&state=S-1"
        )
        assert risultato.code == "ABC-123"
        assert risultato.state == "S-1"
        assert risultato.error is None

    def test_url_con_errore(self):
        risultato = extract_code("http://localhost:8080/auth_redirect?error=access_denied")
        assert risultato.code is None
        assert risultato.error == "access_denied"

    def test_url_senza_parametri(self):
        risultato = extract_code("http://localhost:8080/auth_redirect")
        assert risultato.code is None

    def test_spazi_intorno_all_url(self):
        assert extract_code("  http://x/y?code=Z  ").code == "Z"


class TestServerLocale:
    def test_cattura_il_codice(self):
        porta = porta_libera()
        redirect = f"http://127.0.0.1:{porta}/auth_redirect"
        risultato: list = []

        def ascolta():
            risultato.append(wait_for_code(redirect, timeout=10))

        thread = threading.Thread(target=ascolta)
        thread.start()

        for _ in range(50):
            try:
                risposta = httpx.get(f"{redirect}?code=CODICE-OK&state=S-9", timeout=2)
                break
            except httpx.TransportError:
                time.sleep(0.05)
        else:  # pragma: no cover
            raise AssertionError("il server non si è avviato")

        thread.join(timeout=10)
        assert risposta.status_code == 200
        assert "Autorizzazione completata" in risposta.text
        assert risultato[0].code == "CODICE-OK"
        assert risultato[0].state == "S-9"

    def test_porta_occupata_restituisce_none(self):
        # Restituire None invece di sollevare lascia al chiamante la
        # possibilità di ripiegare sull'incolla manuale dell'URL.
        porta = porta_libera()
        with socket.socket() as occupata:
            occupata.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            occupata.bind(("127.0.0.1", porta))
            occupata.listen(1)
            assert wait_for_code(f"http://127.0.0.1:{porta}/auth_redirect", timeout=1) is None
