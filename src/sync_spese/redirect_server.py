"""Server locale che cattura il redirect dopo l'autenticazione in banca.

Dopo la SCA la banca rimanda il browser al `redirect_url` registrato,
aggiungendo in query string il parametro `code`. Il codice serve subito, e
copiarlo a mano da un URL lungo è il punto in cui è facile sbagliare proprio
mentre la finestra utile allo storico completo sta scorrendo.

Questo modulo mette in ascolto un server HTTP sulla porta del redirect,
raccoglie il codice e si spegne. Se il redirect non arriva (porta occupata,
autenticazione su un altro dispositivo) resta sempre possibile incollare
l'URL a mano: vedi `wait_for_code`.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

_PAGE = """<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>{title}</title>
<style>
 body {{ font-family: system-ui, -apple-system, sans-serif; background: #f6f6f4;
        color: #1c1c1a; display: grid; place-items: center; height: 100vh; margin: 0; }}
 main {{ max-width: 32rem; padding: 2rem; background: #fff; border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,.12); }}
 h1 {{ font-size: 1.25rem; margin: 0 0 .5rem; }}
 p {{ margin: 0; color: #55524c; line-height: 1.5; }}
</style></head>
<body><main><h1>{title}</h1><p>{message}</p></main></body></html>
"""


@dataclass
class AuthorizationCallback:
    code: str | None = None
    state: str | None = None
    error: str | None = None


class _Handler(BaseHTTPRequestHandler):
    result: AuthorizationCallback
    expected_path: str
    done: threading.Event

    def do_GET(self) -> None:  # noqa: N802 - nome imposto da BaseHTTPRequestHandler
        parsed = urlparse(self.path)
        if parsed.path != self.expected_path:
            self._respond(404, "Non trovato", "Questo indirizzo non fa parte del flusso.")
            return

        query = parse_qs(parsed.query)
        code = (query.get("code") or [None])[0]
        state = (query.get("state") or [None])[0]
        error = (query.get("error") or query.get("error_description") or [None])[0]

        type(self).result = AuthorizationCallback(code=code, state=state, error=error)

        if code:
            self._respond(
                200,
                "Autorizzazione completata",
                "Puoi chiudere questa scheda e tornare al terminale.",
            )
        else:
            self._respond(
                400,
                "Autorizzazione non riuscita",
                f"La banca non ha restituito un codice. Dettaglio: {error or 'nessuno'}.",
            )
        type(self).done.set()

    def _respond(self, status: int, title: str, message: str) -> None:
        body = _PAGE.format(title=title, message=message).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        """Silenzia il log su stderr del server di sviluppo."""


def wait_for_code(
    redirect_url: str, *, timeout: float = 300.0
) -> AuthorizationCallback | None:
    """Attende il redirect della banca. `None` se il server non si avvia.

    Restituendo `None` invece di sollevare un'eccezione si lascia al chiamante
    la possibilità di ripiegare sull'inserimento manuale dell'URL, che è
    sempre l'ultima rete di sicurezza.
    """
    parsed = urlparse(redirect_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"

    handler = type("_BoundHandler", (_Handler,), {})
    handler.result = AuthorizationCallback()
    handler.expected_path = path
    handler.done = threading.Event()

    try:
        server = HTTPServer((host, port), handler)
    except OSError:
        return None

    server.timeout = 1.0
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2})
    thread.daemon = True
    thread.start()
    try:
        handler.done.wait(timeout)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    return handler.result if (handler.result.code or handler.result.error) else None


def extract_code(redirected_url: str) -> AuthorizationCallback:
    """Estrae codice e stato da un URL di redirect incollato a mano."""
    query = parse_qs(urlparse(redirected_url.strip()).query)
    return AuthorizationCallback(
        code=(query.get("code") or [None])[0],
        state=(query.get("state") or [None])[0],
        error=(query.get("error") or query.get("error_description") or [None])[0],
    )
