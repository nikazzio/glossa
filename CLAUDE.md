# Glossa — Istruzioni per lo sviluppo

## Stato del progetto

Siamo in sviluppo attivo (pre-1.0). I breaking changes sono accettati e benvenuti quando migliorano la struttura. Non esistono API pubbliche da preservare: la priorità è tenere il codice sano.

## Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, Vite
- **Backend**: Rust (Tauri v2), SQLite via SQLx, reqwest per HTTP
- **Test frontend**: Vitest + Testing Library
- **Test backend**: tokio-test, wiremock

## Principi fondamentali

### Semplicità prima di tutto

Scrivi il codice più semplice che risolve il problema. Non aggiungere astrazioni prima che servano davvero — tre funzioni simili sono meglio di un'astrazione prematura.

### Leggibile da un umano

Il codice deve essere comprensibile senza commenti esplicativi. Usa nomi descrittivi per variabili, funzioni e tipi. Aggiungi un commento solo quando il "perché" è non ovvio (vincolo nascosto, workaround per un bug specifico, invariante sottile).

### Immutabilità

Non mutare mai oggetti esistenti: crea sempre nuove istanze. Vale sia per Rust (preferisci `let` su `let mut`) che per TypeScript (spread operator, `.map()/.filter()` invece di push/splice).

### Nessuna feature speculativa

Non implementare funzionalità "per il futuro". Se non serve adesso, non si scrive.

## Organizzazione dei file

- **Molti file piccoli > pochi file grandi**: max ~400 righe tipiche, tetto assoluto 800
- **Organizza per dominio/feature**, non per tipo (non `/components/modals/`, ma `/components/document/`)
- **Ordina i contenuti con criterio**: imports raggruppati (external → internal → types), funzioni helper dopo le principali, tipi/interfacce vicino a chi le usa
- **Non lasciare file monolitici**: se un file supera 600 righe, considera di estrarne una parte

## TypeScript

- Usa tipi espliciti — evita `any`, usa `unknown` dove il tipo è davvero incognito
- Preferisci `type` a `interface` salvo che il tipo debba essere esteso
- Gestisci sempre i casi `null`/`undefined` in modo esplicito
- Valida gli input ai confini del sistema (input utente, risposte API, contenuto file)
- Usa costanti nominate per valori magici — niente numeri o stringhe hardcoded

## Rust

- Gestisci tutti i `Result` e `Option` — niente `.unwrap()` in produzione
- Preferisci `?` su `match` esplicito quando è sufficiente
- Usa `thiserror` per definire errori di dominio, propaga sempre con contesto
- Evita `clone()` non necessari — pensa alla ownership prima
- Formatta sempre con `cargo fmt`, zero warning da `cargo clippy`

## Librerie

- Usa librerie mature e mantenute attivamente
- Preferisci quelle già nel progetto piuttosto che aggiungerne di nuove
- Prima di aggiungere una dipendenza: verifica che non esista già una soluzione nativa o con le librerie presenti
- Per Rust: controlla le feature attivate, evita di tirare dipendenze pesanti inutilmente

## Pattern moderni

- **Frontend**: hooks custom per logica riusabile, store Zustand solo per stato globale reale (non per stato locale ai componenti)
- **Backend**: handler Tauri snelli — la logica vive nei moduli di dominio, non in `lib.rs`
- **Async**: usa `tokio` correttamente, evita blocking call dentro async, niente `std::thread::sleep` in async
- **Errori**: mai ingoiare errori in silenzio — ogni catch/match deve loggare o propagare

## Test

- Scrivi il test prima dell'implementazione (TDD)
- Copertura minima: 80%
- Test unitari per funzioni pure e logica di dominio
- Test di integrazione per operazioni con SQLite e chiamate HTTP (usa wiremock)
- Nomi descrittivi: `returns_empty_list_when_no_documents_match`, non `test1`

## Gestione errori

- Errori espliciti a ogni livello — mai silenzio
- UI: messaggi leggibili dall'utente (usa `sonner` per i toast)
- Backend: log con contesto dettagliato (`tauri-plugin-log`)
- I messaggi di errore non devono esporre dettagli interni all'utente

## Sicurezza

Prima di ogni commit verifica:
- [ ] Nessun secret hardcoded (API key, password, token)
- [ ] Tutti gli input utente sono validati prima dell'uso
- [ ] Le query SQL usano parametri bind (mai concatenazione di stringhe)
- [ ] I path sui file sono sanitizzati

## Contributing

1. Apri un issue prima di iniziare lavori grandi
2. Un PR per feature/fix — non accorpare cose non correlate
3. Assicurati che `npm run lint` e `cargo clippy` passino prima del PR
4. I test devono passare: `npm test` e `cargo test`
5. Breaking changes: documentali nella descrizione del PR e aggiorna i punti interessati
