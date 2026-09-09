# sync-spese

Scarica i movimenti del tuo conto bancario e li scrive in un database SQLite
locale, passando da [Enable Banking](https://enablebanking.com) — un
intermediario PSD2 licenziato.

Questa è la **Fase 0**: solo la pipeline di ingestione dati. Nessuna interfaccia
grafica, nessun grafico, nessuna categorizzazione. La UI arriva dopo, e potrà
poggiare su un database già pulito e affidabile.

```
la tua macchina                    Enable Banking              la tua banca
┌───────────────┐   JWT RS256    ┌──────────────┐    PSD2    ┌────────────┐
│  sync-spese   │ ─────────────► │   API TPP    │ ─────────► │  UniCredit │
│               │                └──────────────┘            └────────────┘
│  SQLite       │                                                   ▲
└───────────────┘                                                   │
        │                          il tuo browser ──── SCA ─────────┘
        └── i movimenti restano qui
```

Le credenziali della banca **non passano mai** da questa applicazione:
l'autenticazione forte (SCA) avviene sul sito della banca, e questa
applicazione riceve solo un codice di autorizzazione.

---

## 1. La parte da fare su Enable Banking

Questi passaggi si fanno una volta sola, dal browser. Servono a ottenere le due
cose che l'applicazione locale non può generare da sé: un **ID applicazione** e
una **chiave privata RSA**.

### 1.1 Registra un account e un'applicazione

1. Vai su <https://enablebanking.com> e crea un account sviluppatore
   ("Get started").
2. Apri il control panel: <https://enablebanking.com/cp/applications>.
3. Crea una nuova applicazione e scegli l'ambiente **Production**
   (non Sandbox: la sandbox espone banche finte, non il tuo conto).
4. Come **redirect URL** metti esattamente:

   ```
   http://localhost:8080/auth_redirect
   ```

   È l'indirizzo su cui la banca rimanda il browser a fine autenticazione, e su
   cui `sync-spese auth` mette in ascolto un piccolo server locale per catturare
   il codice. Deve coincidere carattere per carattere con `EB_REDIRECT_URL` nel
   `.env`.
5. Lascia che il control panel **generi la chiave privata nel browser**: verrà
   scaricato un file `.pem` il cui nome è l'ID dell'applicazione, per esempio
   `0377783c-3414-4bb1-a7d4-0c3eb54cd4b0.pem`.

   Quel file **non è recuperabile**: Enable Banking non ne conserva copia. Se lo
   perdi devi registrare una nuova applicazione.

### 1.2 Metti al sicuro la chiave

Spostala **fuori** dalla cartella del progetto e restringine i permessi:

```bash
mkdir -p ~/.config/sync-spese
mv ~/Downloads/0377783c-....pem ~/.config/sync-spese/enablebanking.pem
chmod 600 ~/.config/sync-spese/enablebanking.pem
```

Il `.gitignore` esclude già `*.pem` e `.env`, ma la regola vera è che la chiave
non deve stare nella cartella di un repository, punto.

### 1.3 Attiva la modalità *restricted production* collegando il tuo conto

Un'applicazione Production appena creata è **inattiva**. Per usarla senza un
contratto commerciale e senza certificati eIDAS, Enable Banking offre la
modalità *restricted production*: l'applicazione funziona solo sui conti che hai
collegato personalmente.

Nel control panel, sull'applicazione (Inactive), premi **"Activate by linking
accounts"**, scegli la tua banca, autenticati con la tua SCA e approva. Da quel
momento:

* l'applicazione risulta attiva;
* l'API restituisce **soltanto** i conti collegati in questo modo;
* non serve alcun contratto, ed è gratuita.

È una modalità pensata per i propri conti, non per offrire un servizio ad altri.

### 1.4 Riassunto di cosa ti serve dopo questi passaggi

| Cosa | Dove finisce |
|---|---|
| ID applicazione (UUID) | `EB_APPLICATION_ID` nel `.env` |
| File `.pem` con la chiave privata | percorso in `EB_PRIVATE_KEY_PATH` |
| Redirect URL registrato | `EB_REDIRECT_URL` nel `.env` |
| Conto collegato dal control panel | niente da configurare, l'API lo espone |

---

## 2. Setup locale

Serve Python 3.12+ e [uv](https://docs.astral.sh/uv/).

```bash
git clone <questo-repo> app-risparmi
cd app-risparmi

uv sync                     # crea .venv e installa le dipendenze
cp .env.example .env        # poi apri .env e compilalo
```

Compila almeno queste voci nel `.env`:

```dotenv
EB_APPLICATION_ID=0377783c-3414-4bb1-a7d4-0c3eb54cd4b0
EB_PRIVATE_KEY_PATH=/home/tuoutente/.config/sync-spese/enablebanking.pem
EB_REDIRECT_URL=http://localhost:8080/auth_redirect
EB_ASPSP_NAME=UniCredit
EB_ASPSP_COUNTRY=IT
EB_PSU_TYPE=personal
```

Poi prepara il database:

```bash
uv run sync-spese init
```

Tutti i comandi si invocano con `uv run sync-spese …` (oppure `sync-spese …`
dopo aver attivato `.venv`).

---

## 3. Uso, nell'ordine in cui serve

### Passo 1 — trova il nome esatto della banca

Il nome in `EB_ASPSP_NAME` deve coincidere **carattere per carattere** con
quello che restituisce l'API. Non tirare a indovinare:

```bash
uv run sync-spese banks --country IT --search unicredit
```

L'elenco mostra anche la durata massima del consenso concessa da ogni banca e
se richiede gli header PSU.

### Passo 2 — ottieni il consenso (SCA)

```bash
uv run sync-spese auth
```

Il comando apre il browser sulla pagina della banca, aspetta il redirect,
scambia il codice per una sessione e salva conti e scadenza del consenso.

> **Un solo consenso alla volta.** Le banche italiane ammettono un consenso
> attivo per intermediario: eseguire di nuovo `auth` invalida quello
> precedente. Il comando lo dice e chiede conferma.

### Passo 3 — backfill, **subito**

```bash
uv run sync-spese backfill
```

Non rimandare: **lo storico completo è esposto solo per circa un'ora dopo il
consenso**. Passata quella finestra la banca torna a dare ~90 giorni, e i mesi
precedenti non si recuperano più fino alla prossima SCA.

Se vuoi essere sicuro di non perdere tempo, concatena i due passi:

```bash
uv run sync-spese auth --backfill
```

### Passo 4 — poi, periodicamente

```bash
uv run sync-spese sync              # ultimi 14 giorni
uv run sync-spese sync --days 30    # finestra più larga
```

Il sync è idempotente: eseguirlo dieci volte non crea duplicati e non perde
nulla. Puoi metterlo in cron senza pensarci — tenendo però conto dei limiti al
punto 6.

### Controllo dello stato

```bash
uv run sync-spese status
```

Mostra quanto manca alla scadenza del consenso, quanti movimenti ci sono per
conto, il periodo coperto, i saldi e se ci sono pagine scaricate ma non ancora
ingerite.

### Gli altri comandi

| Comando | Cosa fa |
|---|---|
| `init` | Crea il database e applica le migrazioni |
| `banks` | Elenca le banche disponibili per paese |
| `auth` | Ottiene il consenso via SCA e salva la sessione |
| `backfill` | Scarico iniziale, `strategy=longest` |
| `sync` | Aggiornamento incrementale, `strategy=default` |
| `status` | Scadenza del consenso e stato del database |
| `accounts` | Conti collegati, con id interni |
| `show` | Ultimi movimenti salvati |
| `reingest` | Ri-elabora le pagine grezze già scaricate |
| `logout` | Chiude la sessione presso la banca |

---

## 4. Schema del database

```
users ──┬── bank_sessions ──── (un consenso alla volta per banca)
        │
        ├── accounts ──┬── transactions        i movimenti, deduplicati
        │              ├── balances            fotografie del saldo
        │              └── raw_transaction_pages   risposte grezze dell'API
        │
        └── sync_runs                          storico delle esecuzioni
```

Ogni tabella di dati ha `user_id` fin dalla prima migrazione, anche se per ora
l'utente è uno solo. Nessun conto è hardcodato da nessuna parte: i conti
arrivano dalla sessione e vengono identificati dal loro hash stabile.

Punti dello schema che vale la pena conoscere:

* **`transactions.amount_minor`** — intero con segno nell'unità minore della
  valuta (centesimi per l'euro). Negativo = uscita. Mai float: sommare qualche
  migliaio di float produce errori visibili in fondo alla colonna.
  `amount_raw` conserva comunque la stringa esatta ricevuta dall'API.
* **`transactions.dedup_key` + `dedup_source`** — la chiave di deduplica e da
  dove viene (vedi punto 5).
* **`accounts.identification_hash`** — chiave naturale del conto, stabile fra
  un consenso e l'altro. `current_uid` è invece l'handle di sessione, che
  **cambia a ogni nuovo consenso**: non è utilizzabile come identificatore.
* **`raw_transaction_pages`** — ogni risposta dell'API salvata così com'è.

Le migrazioni sono file `.sql` numerati in
`src/sync_spese/db/migrations/`, applicati una volta sola, ciascuno nella
propria transazione. Il checksum di ogni migrazione applicata viene registrato:
se un file già eseguito viene modificato, `init` si rifiuta di procedere invece
di lasciare due database con lo stesso numero di versione e schemi diversi.

---

## 5. Decisioni di progetto

### La deduplica non può basarsi su `transaction_id`

L'API espone `transaction_id`, ma è opzionale e in pratica moltissime banche lo
restituiscono `null` — si vede anche nelle risposte di esempio pubblicate da
Enable Banking. Usarlo da solo significherebbe non avere nessuna chiave per la
maggior parte dei movimenti.

La chiave è quindi una catena di fallback:

1. `transaction_id`, quando c'è;
2. `entry_reference`, il riferimento contabile della banca — è quello che le
   banche italiane popolano davvero;
3. un'**impronta** SHA-256 di data, importo con segno, valuta, controparte,
   causale e riferimento.

Il livello effettivamente usato finisce in `dedup_source`, così `status`
può dirti quanto è solida la deduplica dei tuoi dati.

Due movimenti davvero identici lo stesso giorno (due caffè da 1,20 €) hanno la
stessa impronta: non è un errore, sono indistinguibili. Vengono numerati
(`#1`, `#2`, …) in base a quanti ne compaiono nello stesso lotto, e il primo
resta senza suffisso perché la chiave già scritta non cambi quando in futuro ne
arriva un altro uguale.

### Scarico e ingestione sono due fasi separate

La risorsa scarsa è la finestra di un'ora dopo il consenso, non il tempo di CPU.
Perciò:

1. ogni pagina viene salvata **grezza** in `raw_transaction_pages`, con una
   commit per pagina;
2. solo dopo si normalizza e si scrive in `transactions`, in un'unica
   transazione.

Se il parsing fallisce — un campo inatteso, una banca che manda qualcosa di
nuovo — i dati scaricati sono già su disco. Si corregge il codice e si esegue
`sync-spese reingest`: nessuna nuova SCA, nessuna finestra bruciata. Se invece
fallisce l'ingestione, la tabella `transactions` resta esattamente com'era: o
l'esecuzione entra intera, o non entra affatto.

### Paginazione: fermarsi sulla pagina vuota tronca lo storico

Con `strategy=longest` l'API può restituire una pagina con **zero movimenti e un
`continuation_key` valorizzato**, perché sta ancora risalendo indietro nel tempo
dentro i sistemi della banca. L'unica condizione di uscita corretta è l'assenza
del continuation key.

### I movimenti provvisori non sono dati definitivi

Un movimento `PDNG` può cambiare importo, cambiare data o sparire, e quando la
banca lo contabilizza spesso ricompare come `BOOK` con un `entry_reference`
diverso. Per questo, a ogni sync, i provvisori della finestra coperta che non
vengono più restituiti sono **eliminati**, mentre i contabilizzati non vengono
cancellati mai. Senza questa regola ogni spesa comparirebbe due volte.

### Se la banca rifiuta il periodo richiesto

Alcune banche rispondono `422 WRONG_TRANSACTIONS_PERIOD` se la finestra chiesta
è più lunga di quanto sopportano. Il backfill non si arrende: riprova con
finestre via via più corte (730, 365, 180, 90 giorni). Meglio 90 giorni che
niente.

---

## 6. Cose da sapere prima di mettere il sync in cron

**Rate limit.** Sotto PSD2 le banche possono limitare a **4 accessi al giorno
per conto** le richieste effettuate senza l'utente presente (*unattended*).
Un `sync` una o due volte al giorno sta comodamente dentro; uno ogni ora no.
Se la banca risponde `429`, il comando lo dice in chiaro.

Alcune banche allentano il limite se vengono forniti gli header PSU
(`EB_PSU_IP_ADDRESS`, `EB_PSU_USER_AGENT`), che dichiarano una richiesta fatta
con l'utente presente. **O si forniscono tutti gli header richiesti dalla banca,
o nessuno**: mandarne una parte causa un `422 PSU_HEADER_NOT_PROVIDED`. Per
questo la configurazione li considera solo se sono valorizzati entrambi.

**Scadenza del consenso.** Al massimo 180 giorni, spesso meno; il massimo
effettivo lo decide la banca ed è visibile con `sync-spese banks`.
`sync-spese status` mostra il tempo che resta e avvisa sotto i 7 giorni.
Alla scadenza serve una nuova SCA con `sync-spese auth` — e con essa una nuova
finestra di un'ora, se ti serve recuperare storico.

---

## 7. Sviluppo

```bash
uv run pytest                # tutti i test
uv run pytest -q --no-header # più compatto
```

I test coprono le parti pure — normalizzazione degli importi, deduplica,
mappatura dei campi, aritmetica delle scadenze — e usano un finto trasporto
HTTP per verificare paginazione, gestione degli errori e, soprattutto, che
eseguire il sync dieci volte di fila lasci il database identico.

```
src/sync_spese/
├── cli.py              i comandi
├── config.py           lettura del .env, nessun valore sensibile nel codice
├── errors.py           eccezioni con messaggi leggibili
├── repository.py       tutte le query, in un posto solo
├── redirect_server.py  cattura del codice di autorizzazione
├── domain/             logica pura: importi, deduplica, normalizzazione, scadenze
├── eb/                 client dell'API: firma JWT, modelli, chiamate
├── db/                 connessione e migrazioni
└── services/           orchestrazione: autorizzazione, scarico, ingestione
```

---

## 8. Cosa questo progetto non fa

* Non fa scraping delle notifiche push né parsing di email.
* Non usa API dirette di UniCredit (richiederebbero una licenza AISP).
* Non dispone pagamenti: solo lettura dei movimenti.
* Non categorizza le spese e non produce grafici: è la fase successiva.
