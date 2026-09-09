"""Configurazione e interfaccia a riga di comando."""

from __future__ import annotations

from pathlib import Path

import pytest

from sync_spese.cli import build_parser, main
from sync_spese.config import load_settings
from sync_spese.errors import ConfigError

ENV_MINIMO = """
EB_APPLICATION_ID=app-abc
EB_PRIVATE_KEY_PATH={key}
DATABASE_PATH={db}
APP_USER_ID=tester
LOG_LEVEL=WARNING
"""


@pytest.fixture
def env_file(tmp_path: Path, monkeypatch) -> Path:
    # Le variabili già nell'ambiente vincono sul file: vanno ripulite.
    for nome in list(dict(__import__("os").environ)):
        if nome.startswith(("EB_", "APP_", "DATABASE_", "HTTP_", "LOG_")):
            monkeypatch.delenv(nome, raising=False)
    chiave = tmp_path / "chiave.pem"
    chiave.write_text("-- non serve una chiave vera per questi comandi --")
    percorso = tmp_path / ".env"
    percorso.write_text(
        ENV_MINIMO.format(key=chiave, db=tmp_path / "spese.sqlite3")
    )
    return percorso


class TestConfigurazione:
    def test_valori_predefiniti(self, env_file):
        settings = load_settings(env_file)
        assert settings.api_origin == "https://api.enablebanking.com"
        assert settings.psu_type == "personal"
        assert settings.user_id == "tester"
        assert settings.consent_days is None

    def test_variabile_obbligatoria_mancante(self, tmp_path, monkeypatch):
        monkeypatch.delenv("EB_APPLICATION_ID", raising=False)
        monkeypatch.delenv("EB_PRIVATE_KEY_PATH", raising=False)
        vuoto = tmp_path / ".env"
        vuoto.write_text("EB_APPLICATION_ID=x\n")
        with pytest.raises(ConfigError, match="EB_PRIVATE_KEY_PATH"):
            load_settings(vuoto)

    def test_psu_type_non_valido(self, tmp_path, env_file):
        env_file.write_text(env_file.read_text() + "\nEB_PSU_TYPE=aziendale\n")
        with pytest.raises(ConfigError, match="EB_PSU_TYPE"):
            load_settings(env_file)

    def test_header_psu_parziali_vengono_ignorati(self, env_file):
        # Mandarne solo una parte causa un 422: o tutti o nessuno.
        env_file.write_text(env_file.read_text() + "\nEB_PSU_IP_ADDRESS=1.2.3.4\n")
        assert load_settings(env_file).psu_headers == {}

    def test_header_psu_completi(self, env_file):
        env_file.write_text(
            env_file.read_text()
            + "\nEB_PSU_IP_ADDRESS=1.2.3.4\nEB_PSU_USER_AGENT=Mozilla/5.0\n"
        )
        assert load_settings(env_file).psu_headers == {
            "psu-ip-address": "1.2.3.4",
            "psu-user-agent": "Mozilla/5.0",
        }

    def test_chiave_privata_mancante(self, env_file, tmp_path):
        settings = load_settings(env_file)
        settings.private_key_path.unlink()
        with pytest.raises(ConfigError, match="Chiave privata non trovata"):
            settings.read_private_key()


class TestParser:
    def test_tutti_i_comandi_sono_registrati(self):
        parser = build_parser()
        for comando in (
            "init", "banks", "auth", "backfill", "sync",
            "status", "accounts", "show", "reingest", "logout",
        ):
            assert parser.parse_args([comando]).command == comando

    def test_comando_obbligatorio(self):
        with pytest.raises(SystemExit):
            build_parser().parse_args([])

    def test_opzioni_del_backfill(self):
        args = build_parser().parse_args(
            ["backfill", "--account", "3", "--from", "2024-01-01"]
        )
        assert args.account == 3
        assert args.date_from == "2024-01-01"


class TestComandiLocali:
    def test_init_crea_il_database(self, env_file, capsys):
        assert main(["--env-file", str(env_file), "init"]) == 0
        assert load_settings(env_file).database_path.exists()
        assert "Migrazioni applicate" in capsys.readouterr().out

    def test_init_e_ripetibile(self, env_file, capsys):
        main(["--env-file", str(env_file), "init"])
        capsys.readouterr()
        assert main(["--env-file", str(env_file), "init"]) == 0
        assert "già aggiornato" in capsys.readouterr().out

    def test_i_comandi_richiedono_init(self, env_file, capsys):
        assert main(["--env-file", str(env_file), "status"]) == 1
        assert "sync-spese init" in capsys.readouterr().err

    def test_status_senza_consenso(self, env_file, capsys):
        main(["--env-file", str(env_file), "init"])
        capsys.readouterr()
        assert main(["--env-file", str(env_file), "status"]) == 1
        assert "Nessun consenso" in capsys.readouterr().out

    def test_show_senza_movimenti(self, env_file, capsys):
        main(["--env-file", str(env_file), "init"])
        capsys.readouterr()
        assert main(["--env-file", str(env_file), "show"]) == 0
        assert "Nessun movimento" in capsys.readouterr().out

    def test_accounts_senza_conti(self, env_file, capsys):
        main(["--env-file", str(env_file), "init"])
        capsys.readouterr()
        assert main(["--env-file", str(env_file), "accounts"]) == 1

    def test_configurazione_incompleta_esce_con_2(self, tmp_path, capsys, monkeypatch):
        monkeypatch.delenv("EB_APPLICATION_ID", raising=False)
        monkeypatch.delenv("EB_PRIVATE_KEY_PATH", raising=False)
        vuoto = tmp_path / "vuoto.env"
        vuoto.write_text("")
        assert main(["--env-file", str(vuoto), "status"]) == 2
        assert "Errore di configurazione" in capsys.readouterr().err


class TestCodiciDiUscita:
    """`status` deve poter essere usato in uno script: 1 = serve intervenire."""

    def test_senza_consenso_esce_con_1(self, env_file):
        main(["--env-file", str(env_file), "init"])
        assert main(["--env-file", str(env_file), "status"]) == 1

    def test_con_consenso_valido_esce_con_0(self, env_file):
        from sync_spese import repository
        from sync_spese.db import connect

        main(["--env-file", str(env_file), "init"])
        settings = load_settings(env_file)
        conn = connect(settings.database_path)
        repository.insert_session(
            conn,
            session_id="s-1",
            user_id=settings.user_id,
            aspsp_name="UniCredit",
            aspsp_country="IT",
            psu_type="personal",
            authorization_id=None,
            psu_id_hash=None,
            access_valid_until="2099-01-01T00:00:00+00:00",
            access=None,
        )
        conn.close()
        assert main(["--env-file", str(env_file), "status"]) == 0

    def test_con_consenso_scaduto_esce_con_1(self, env_file, capsys):
        from sync_spese import repository
        from sync_spese.db import connect

        main(["--env-file", str(env_file), "init"])
        settings = load_settings(env_file)
        conn = connect(settings.database_path)
        repository.insert_session(
            conn,
            session_id="s-2",
            user_id=settings.user_id,
            aspsp_name="UniCredit",
            aspsp_country="IT",
            psu_type="personal",
            authorization_id=None,
            psu_id_hash=None,
            access_valid_until="2020-01-01T00:00:00+00:00",
            access=None,
        )
        conn.close()
        capsys.readouterr()
        assert main(["--env-file", str(env_file), "status"]) == 1
        assert "SCADUTO" in capsys.readouterr().out
