# Glossa — Istruzioni per lo sviluppo

## Stato del progetto

Siamo in sviluppo attivo (pre-1.0). I breaking changes sono accettati e benvenuti quando migliorano la struttura. Non esistono API pubbliche da preservare: la priorità è tenere il codice sano.

Per il lavoro corrente su questo ramo, la UI sandbox non deve guidare le decisioni di implementazione. La priorità è la modalità documento/editoriale; la sandbox si tocca solo in caso di regressioni bloccanti.

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

## UI — Stile dei componenti

Queste regole si applicano a tutti i componenti del pannello di configurazione e in generale all'intera UI.

### Label di sezione

Ogni sezione ha un'intestazione icona + etichetta:

```tsx
<div className="flex items-center gap-1.5">
  <IconName size={11} className="text-editorial-accent shrink-0" />
  <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
    {t('chiave.etichetta')}
  </p>
</div>
```

### Pulsanti pill (selezione tra opzioni)

```tsx
className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent
  disabled:cursor-not-allowed disabled:opacity-40 ${
    isActive
      ? 'border-editorial-accent bg-editorial-accent text-white'
      : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
  }`}
```

Non usare `editorial-ink` per i pulsanti di selezione: usare sempre `editorial-accent` (rosso).

### Ordine degli elementi nel tab Impostazioni

Disporre dall'alto verso il basso per importanza percepita dall'utente:

1. Modalità di traduzione (scelta che cambia la struttura della pipeline)
2. Coppia linguistica
3. Persona

## Comunicazione con l'utente

Quando descrivi il funzionamento del codice o l'analisi di una feature, ragiona a livello **logico-funzionale**: spiega cosa fa il sistema, cosa manca, quale comportamento cambia — senza citare nomi di variabili, funzioni, tipi o file specifici. L'utente non ha il codice in testa e quei nomi non gli dicono nulla; ciò che serve è capire il comportamento, non la struttura interna.

## Contributing

1. Apri un issue prima di iniziare lavori grandi
2. Un PR per feature/fix — non accorpare cose non correlate
3. Assicurati che `npm run lint` e `cargo clippy` passino prima del PR
4. I test devono passare: `npm test` e `cargo test`
5. Breaking changes: documentali nella descrizione del PR e aggiorna i punti interessati
