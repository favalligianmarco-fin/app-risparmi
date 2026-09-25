# Pubblicare "Attraversa, Nonna!" sull'App Store

Requisiti verificati a settembre 2026. Le regole di Apple cambiano spesso:
prima di inviare, ricontrolla i link in fondo.

## 1. Cosa ti serve

| Cosa | Dettagli | Stato |
|---|---|---|
| Account **Apple Developer Program** | 99 USD l'anno (in Italia circa 99 €). Iscrizione da persona fisica su developer.apple.com/programs | da fare |
| Un **Mac con Xcode 26** o successivo | Da aprile 2026 le app vanno compilate con Xcode 26 e l'SDK di iOS 26. Xcode 26 richiede macOS Sequoia 15.6 o successivo (le versioni 26.x più recenti chiedono macOS Tahoe). Senza Mac: un Mac in affitto nel cloud, oppure un servizio di build come Codemagic o GitHub Actions con runner macOS | da verificare |
| Un **iPhone** per provare il gioco | Obbligatorio di fatto: Apple rifiuta le app che vanno in crash o hanno problemi evidenti (regola 2.1) | |
| **Bundle ID** | Ora è `it.favalli.attraversanonna` (in `capacitor.config.ts` e nel progetto Xcode). Puoi cambiarlo, ma dopo la prima pubblicazione resta per sempre | da confermare |
| **URL della privacy policy** | Obbligatorio per tutte le app. Il testo è pronto in `docs/privacy.html`: va messo online (vedi sezione 5) | da fare |
| **URL di supporto** | Obbligatorio. Basta una pagina con un contatto email | da fare |
| Icona 1024×1024 | Pronta: `docs/icona-app-store.png`, già inserita nel progetto Xcode, senza trasparenza come richiesto | ✅ |
| Screenshot iPhone 6,9" | Pronti: 6 per lingua in `docs/screenshots/it` e `docs/screenshots/en` (1320×2868) | ✅ |
| Testi della scheda | Pronti in [scheda-app-store.md](scheda-app-store.md) | ✅ |

## 2. Cosa si può fare e cosa no: le regole che riguardano questo gioco

Le regole sono le [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
Qui ci sono solo quelle rilevanti per questo gioco, con il modo in cui il gioco
le rispetta già.

| Regola | Cosa dice | Come la rispetta il gioco |
|---|---|---|
| **1.1 Contenuti discutibili** | Niente contenuti offensivi, crudeli o "mean-spirited" verso gruppi di persone, e niente violenza realistica | La nonna è la protagonista, mai presa in giro. Nessuno viene investito: i veicoli inchiodano prima, lei agita l'ombrello e grida "Mascalzone!". Il tram, che non frena, non la tocca: lo scout la tira indietro in tempo. |
| **2.1 Completezza** | Niente crash, niente segnaposto, tutti i link funzionanti | Da verificare su iPhone reale e con TestFlight prima dell'invio. |
| **2.3 Metadati accurati** | Screenshot che mostrano il gioco vero, nessun nome o parola chiave di marchi altrui | Gli screenshot sono scene reali del gioco. Evitati nomi come "Vespa", "Ape", "Frogger" o "Crossy Road" nei testi e nelle parole chiave. |
| **2.5.2 App autosufficienti** | Il codice non si può scaricare da internet dopo la revisione | Tutto il gioco è dentro l'app, che non si collega mai alla rete. |
| **3.1.1 Acquisti in-app** | Livelli, valute di gioco e contenuti a pagamento solo con gli acquisti in-app di Apple | Oggi è tutto gratis; le caramelle si guadagnano solo giocando. Per vendere qualcosa in futuro serve StoreKit (vedi sezione 7). |
| **4.2 Funzionalità minima** | Un'app non può essere solo un sito web impacchettato | È un gioco completo e offline, con vibrazione nativa, salvataggi nativi e più di 40 livelli testati. |
| **4.3 Spam** | Non si accettano copie di giochi già diffusi | Il tema italiano (la nonna, lo scout, il tram, le commissioni), l'ombrello che ferma il traffico e il guardaroba lo distinguono dai cloni di "attraversa la strada". |
| **5.1.1 Privacy** | Privacy policy obbligatoria nella scheda e raggiungibile dentro l'app | Dentro l'app: Impostazioni → Privacy. Il link va inserito in App Store Connect. |
| **5.2 Proprietà intellettuale** | Solo contenuti tuoi o con licenza | Grafica e musica sono generate dal codice del gioco; il carattere Fredoka è sotto SIL Open Font License, citata in Impostazioni → Riconoscimenti. |

### Permessi di iOS

L'app **non chiede nessun permesso**: niente fotocamera, microfono, posizione,
contatti, notifiche o tracciamento (niente richiesta ATT). Per questo il file
`Info.plist` non contiene nessuna voce `NS…UsageDescription`.

Cosa è già configurato nel progetto iOS:

- `PrivacyInfo.xcprivacy` (manifest della privacy, obbligatorio): dichiara
  "nessun tracciamento, nessun dato raccolto" e l'uso di `UserDefaults` con
  motivo `CA92.1`, perché i salvataggi passano da lì.
- `ITSAppUsesNonExemptEncryption = NO`: evita la domanda sull'esportazione
  della crittografia a ogni caricamento.
- Solo iPhone, solo in verticale, a schermo intero, barra di stato nascosta.
- Lingue italiano e inglese; il nome sotto l'icona è "Attraversa" (in inglese
  "Cross Nonna"), perché "Attraversa, Nonna!" verrebbe troncato sulla schermata
  Home.

## 3. Prima prova su iPhone (senza pubblicare)

1. Sul Mac: installa Xcode 26 dal Mac App Store e Node.js 22.
2. Nella cartella `attraversa-nonna`:
   ```bash
   npm install
   npm run ios:sync
   npm run ios:open
   ```
3. In Xcode: seleziona il target **App** → *Signing & Capabilities* → scegli il
   tuo **Team** (il tuo account Apple). Se il Bundle ID è già preso, cambialo.
4. Collega l'iPhone, attiva la *Modalità sviluppatore* (Impostazioni → Privacy e
   sicurezza) e premi ▶.

Cose da controllare sul telefono: audio con e senza tasto silenzioso (il gioco
rispetta il silenzioso), vibrazione, rotazione bloccata, notch/Dynamic Island,
uscita e rientro nell'app (deve andare in pausa), salvataggi dopo la chiusura.

## 4. Configurazione su App Store Connect

Su [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → *App* → **+** → *Nuova app*:

- **Piattaforma** iOS, **nome** "Attraversa, Nonna!", **lingua principale**
  Italiano, **Bundle ID** quello del progetto, **SKU** ad esempio `attraversanonna1`.

Poi, nella scheda dell'app:

1. **Informazioni app**: categoria *Giochi*, sottocategorie *Arcade* e
   *Casual*.
2. **Classificazione per età**: il questionario è stato rifatto (fasce 4+,
   9+, 13+, 16+, 18+) e da settembre 2026 include anche le domande sui
   **social media**. Le risposte giuste per questo gioco sono in
   [scheda-app-store.md](scheda-app-store.md): il risultato atteso è **4+**.
3. **Privacy dell'app**: rispondi "No, non raccogliamo dati da questa app"
   → etichetta **"Dati non raccolti"**. Inserisci l'URL della privacy policy.
4. **Prezzi e disponibilità**: Gratis, tutti i paesi (o solo quelli che vuoi).
5. **Stato di trader (Digital Services Act UE)**: va dichiarato per
   distribuire nell'Unione Europea. Se sei un **trader** (ad esempio se
   guadagni dall'app), Apple mostrerà sulla scheda **indirizzo, telefono ed
   email**. Se pubblichi a titolo personale un gioco gratuito, senza scopi
   commerciali, puoi dichiararti **non trader** e quei dati non vengono
   mostrati. È una tua valutazione legale: se in futuro aggiungi acquisti o
   pubblicità, diventi trader.
6. **Pagina della versione 1.0**: screenshot (sezione iPhone 6,9"), testo
   promozionale, descrizione, parole chiave, URL di supporto, copyright e note
   per la revisione. Tutto in [scheda-app-store.md](scheda-app-store.md). Ripeti
   per la localizzazione in inglese.

## 5. Mettere online privacy policy e supporto

`docs/privacy.html` è una pagina già pronta, in italiano e in inglese. Prima di
pubblicarla sostituisci `[EMAIL DI SUPPORTO]` con il tuo indirizzo. Dove
metterla gratis:

- **GitHub Pages**: richiede un repository pubblico (o un piano a pagamento).
  Conviene un repository separato, ad esempio `attraversa-nonna-sito`.
- In alternativa: Google Sites, una pagina pubblica di Notion o qualsiasi
  hosting statico.

La stessa pagina può fare da URL di supporto, visto che contiene il contatto.

## 6. Caricare la build e inviarla in revisione

1. In Xcode: *Product → Archive* (con destinazione "Any iOS Device (arm64)").
2. Nell'Organizer: **Distribute App → App Store Connect → Upload**.
3. Dopo qualche minuto la build compare in App Store Connect, nella sezione
   **TestFlight**: installala sul tuo iPhone con l'app TestFlight e rigioca
   qualche livello.
4. Nella pagina della versione scegli la build, poi **Aggiungi per la
   revisione → Invia**. La revisione di solito richiede da qualche ora a un
   paio di giorni.

Per ogni aggiornamento: aumenta *Version* (es. 1.0.1) o almeno *Build* (es. 2)
in Xcode, poi `npm run ios:sync` e ripeti archiviazione e caricamento.

### Motivi di rifiuto frequenti, già prevenuti

- *"Screenshot che non mostrano l'app"*: usa quelli in `docs/screenshots`.
- *"Privacy policy mancante o link non funzionante"*: controlla che l'URL si apra.
- *"App web impacchettata"* (4.2): nelle note per la revisione spieghiamo che è
  un gioco completo e offline (testo pronto nella scheda).
- *"Crash all'avvio su iPad"*: l'app è solo per iPhone. Su iPad gira in modalità
  compatibilità e il gioco si adatta allo schermo; conviene comunque provarla
  anche su un iPad (o sul simulatore).

## 7. Se in futuro vuoi guadagnarci

| Modello | Cosa cambia |
|---|---|
| **App a pagamento** | Basta impostare un prezzo; diventi trader (DSA) e devi accettare il *Paid Apps Agreement* con i dati bancari e fiscali. |
| **Acquisti in-app** (es. vestiti, "togli pubblicità") | Obbligatorio usare StoreKit (plugin Capacitor per gli acquisti). Se vendi le caramelle, sono una valuta di gioco: regola 3.1.1. |
| **Pubblicità** | Serve un SDK (es. AdMob): cambia l'etichetta privacy, quasi sempre serve la richiesta di tracciamento (App Tracking Transparency) e il consenso GDPR in UE. La classificazione per età va rivista. |
| **Classifiche Game Center** | Nessun dato personale gestito da te; aggiunge valore "nativo" all'app. |

## Fonti

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Requisiti minimi di SDK (Xcode 26 da aprile 2026)](https://developer.apple.com/news/upcoming-requirements/)
- [Requisiti di sistema di Xcode](https://developer.apple.com/xcode/system-requirements)
- [Nuove classificazioni per età in App Store Connect](https://developer.apple.com/news/?id=ks775ehf)
- [Domande sui social media nel questionario sull'età](https://developer.apple.com/news/?id=tlur8uvi)
- [Specifiche degli screenshot](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Digital Services Act: stato di trader](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [Capacitor 8: Xcode 26 e Swift Package Manager](https://capacitorjs.com/docs/updating/8-0)
