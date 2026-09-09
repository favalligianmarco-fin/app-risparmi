-- Schema iniziale.
--
-- Convenzioni:
--  * ogni tabella di dati ha `user_id` fin dal primo giorno, anche se oggi
--    l'utente è uno solo. Aggiungerlo dopo significherebbe riscrivere tutto;
--  * tutti i timestamp sono ISO 8601 in UTC, salvati come TEXT (SQLite non ha
--    un tipo data nativo e il testo ISO si ordina correttamente);
--  * tutti gli importi sono interi nell'unità minore della valuta, con segno
--    (negativo = uscita). Mai float.

CREATE TABLE users (
    user_id     TEXT PRIMARY KEY,
    label       TEXT,
    created_at  TEXT NOT NULL
);

-- Una riga per ogni consenso ottenuto tramite SCA.
-- Le banche italiane ammettono un solo consenso attivo per intermediario:
-- ottenerne uno nuovo invalida il precedente, che qui viene marcato
-- 'SUPERSEDED'.
CREATE TABLE bank_sessions (
    session_id          TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users (user_id),
    aspsp_name          TEXT NOT NULL,
    aspsp_country       TEXT NOT NULL,
    psu_type            TEXT NOT NULL,
    authorization_id    TEXT,
    psu_id_hash         TEXT,
    access_valid_until  TEXT NOT NULL,
    access_json         TEXT,
    status              TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | SUPERSEDED | REVOKED | EXPIRED
    created_at          TEXT NOT NULL,
    closed_at           TEXT,
    CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED', 'EXPIRED'))
);

CREATE INDEX idx_bank_sessions_user_status ON bank_sessions (user_id, status);

-- L'`uid` di un conto è legato alla sessione: cambia a ogni nuovo consenso.
-- L'identificativo stabile nel tempo è `identification_hash`, ed è su quello
-- che poggia la chiave naturale del conto.
CREATE TABLE accounts (
    id                    INTEGER PRIMARY KEY,
    user_id               TEXT NOT NULL REFERENCES users (user_id),
    identification_hash   TEXT NOT NULL,
    aspsp_name            TEXT NOT NULL,
    aspsp_country         TEXT NOT NULL,
    iban                  TEXT,
    other_identification  TEXT,
    name                  TEXT,
    product               TEXT,
    details               TEXT,
    currency              TEXT NOT NULL,
    cash_account_type     TEXT,
    usage                 TEXT,
    current_uid           TEXT,
    current_session_id    TEXT REFERENCES bank_sessions (session_id),
    raw_json              TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    UNIQUE (user_id, identification_hash)
);

CREATE INDEX idx_accounts_user ON accounts (user_id);

CREATE TABLE balances (
    id                  INTEGER PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users (user_id),
    account_id          INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    balance_type        TEXT NOT NULL,
    name                TEXT,
    amount_minor        INTEGER NOT NULL,
    currency            TEXT NOT NULL,
    reference_date      TEXT,
    last_change_date_time TEXT,
    observed_at         TEXT NOT NULL,
    raw_json            TEXT
);

CREATE INDEX idx_balances_account ON balances (account_id, observed_at);

CREATE TABLE sync_runs (
    id             INTEGER PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (user_id),
    account_id     INTEGER REFERENCES accounts (id) ON DELETE CASCADE,
    session_id     TEXT REFERENCES bank_sessions (session_id),
    kind           TEXT NOT NULL,    -- backfill | incremental | reingest
    strategy       TEXT,             -- longest | default
    date_from      TEXT,
    date_to        TEXT,
    status         TEXT NOT NULL,    -- running | fetched | completed | failed
    pages          INTEGER NOT NULL DEFAULT 0,
    fetched        INTEGER NOT NULL DEFAULT 0,
    inserted       INTEGER NOT NULL DEFAULT 0,
    updated        INTEGER NOT NULL DEFAULT 0,
    removed        INTEGER NOT NULL DEFAULT 0,
    started_at     TEXT NOT NULL,
    finished_at    TEXT,
    error          TEXT
);

CREATE INDEX idx_sync_runs_account ON sync_runs (user_id, account_id, started_at);

-- Ogni chiamata all'endpoint transazioni viene salvata grezza PRIMA di essere
-- interpretata. Lo storico completo è disponibile solo per circa un'ora dopo
-- il consenso: se il parsing fallisce, i dati scaricati non devono andare
-- persi insieme all'errore. Da qui si può sempre rifare l'ingestione offline
-- con `sync-spese reingest`.
CREATE TABLE raw_transaction_pages (
    id                 INTEGER PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users (user_id),
    account_id         INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    sync_run_id        INTEGER NOT NULL REFERENCES sync_runs (id) ON DELETE CASCADE,
    page_number        INTEGER NOT NULL,
    request_json       TEXT NOT NULL,
    payload_json       TEXT NOT NULL,
    transaction_count  INTEGER NOT NULL,
    continuation_key   TEXT,
    fetched_at         TEXT NOT NULL,
    ingested_at        TEXT
);

CREATE INDEX idx_raw_pages_run ON raw_transaction_pages (sync_run_id, page_number);
CREATE INDEX idx_raw_pages_pending ON raw_transaction_pages (ingested_at);

CREATE TABLE transactions (
    id                     INTEGER PRIMARY KEY,
    user_id                TEXT NOT NULL REFERENCES users (user_id),
    account_id             INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,

    -- Chiave di deduplica e sua provenienza:
    -- 'transaction_id' | 'entry_reference' | 'fingerprint'.
    dedup_key              TEXT NOT NULL,
    dedup_source           TEXT NOT NULL,

    transaction_id         TEXT,
    entry_reference        TEXT,

    amount_minor           INTEGER NOT NULL,   -- con segno: < 0 = uscita
    amount_raw             TEXT NOT NULL,      -- stringa originale dell'API
    currency               TEXT NOT NULL,
    currency_exponent      INTEGER NOT NULL,
    credit_debit_indicator TEXT,
    status                 TEXT,
    is_pending             INTEGER NOT NULL DEFAULT 0,

    booking_date           TEXT,
    value_date             TEXT,
    transaction_date       TEXT,
    effective_date         TEXT,               -- booking > value > transaction

    counterparty_name      TEXT,
    counterparty_account   TEXT,
    remittance_information TEXT,
    reference_number       TEXT,
    merchant_category_code TEXT,
    bank_transaction_code  TEXT,
    note                   TEXT,

    balance_after_minor    INTEGER,
    balance_after_currency TEXT,

    raw_json               TEXT NOT NULL,
    first_seen_at          TEXT NOT NULL,
    last_seen_at           TEXT NOT NULL,

    UNIQUE (user_id, account_id, dedup_key)
);

CREATE INDEX idx_transactions_date ON transactions (user_id, account_id, effective_date);
CREATE INDEX idx_transactions_pending ON transactions (user_id, account_id, is_pending);
CREATE INDEX idx_transactions_counterparty ON transactions (user_id, counterparty_name);
