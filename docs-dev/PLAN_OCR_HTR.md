# Piano — OCR/HTR per lo Studio di trascrizione (#220)

Scritto il 21 settembre 2026, prima di iniziare il codice. Aggiorna questo
documento se le decisioni cambiano durante l'implementazione; a lavoro
concluso il contenuto utile si sposta in `ARCHITECTURE.md` (invarianti),
`UI_DESIGN_SYSTEM.md` (regole visive) e `ROADMAP_2_0.md` (stato), come da
regola in `CLAUDE.md` — questo file non resta come documentazione permanente.

## Obiettivo

Dare allo Studio di trascrizione (#219/#388, consegnato) un primo motore
OCR/HTR assistivo: un provider LLM già configurato per la traduzione legge
l'immagine di una pagina e propone un testo, che entra come revisione
modificabile — mai come verità finale.

## Punto di partenza verificato (non supposto)

- Lo schema ha già `created_by: 'user' | 'ocr' | 'import'` sulle revisioni
  di trascrizione (`src/services/transcriptionService.ts`): il risultato
  OCR è già previsto come una revisione normale, append-only, storicizzata.
- La scheda "Assistenza" nello Studio (`TranscriptionStudio.tsx`, tab
  `assist`) esiste già in interfaccia, disattivata — è il punto di innesto.
  L'icona che distingue le revisioni per autore (utente/OCR/import) è già
  cablata nel pannello storico, semplicemente nessuno produce ancora
  revisioni `ocr`.
- Il motore lavori (`src-tauri/src/jobs/`) è generico: `JobHandler` trait,
  coda, pausa/ripresa, persistenza. Ha già una `ResourceClass::LanguageService`
  dichiarata ma non usata da nessun gestore oggi.
- La traduzione **non** passa dal motore lavori: chiama il provider LLM in
  streaming direttamente dal frontend (`src-tauri/src/llm/pipeline.rs`,
  `run_stage_stream`). L'OCR invece va costruito come lavoro persistente,
  sul modello dello scaricamento pagine — coda, ripresa dopo un riavvio,
  non uno stato che si perde. Riuso vero è del motore lavori, non del
  percorso di chiamata della traduzione.
- **Gap reale**: il livello LLM (`src-tauri/src/llm/types.rs`, i 4 provider
  in `src-tauri/src/llm/providers/`) è solo testo — nessun supporto immagine
  da nessuna parte. Va aggiunto.
- Scriptoria (riferimento tecnico, `.../services/ocr/processor.py`) conferma
  il pattern OCR-via-LLM: OpenAI vuole un blocco `image_url` con data-URL
  base64, Anthropic un blocco `type: base64`. Utile come riferimento del
  formato richiesta, non da copiare: la sua orchestrazione OCR è un
  dizionario in memoria per processo, senza persistenza — esplicitamente da
  non riprendere.
- Ricerca modelli (settembre 2026): la generazione attuale dei tre provider
  cloud già configurati (Gemini 2.5/3.x, Claude 4.x/5, GPT-5.6) è nativamente
  multimodale quasi ovunque — non serve una lista fitta di eccezioni, solo
  segnare le voci vecchie/testo del catalogo che non vedono immagini.

## Decisioni prese con Niki (21 settembre 2026)

1. **Provider/modello**: si riusano gli stessi provider già configurati per
   la traduzione (stessa chiave, stesso keystore, nessuna nuova schermata di
   configurazione). Cambia solo `src/models/catalog.ts`: nuovo uso `ocr` in
   `ModelUseCase`, marcati i modelli che vedono immagini (la maggioranza del
   catalogo cloud attuale). Ollama resta a scelta libera dell'utente — la
   lista modelli locali è già dinamica, nessun flag statico possibile né
   voluto: chi installa un modello vision in locale se ne assume la scelta.
   **Ogni documento di trascrizione sceglie il proprio provider+modello OCR**,
   stessa select già usata per-fase nella traduzione (`StageCard.tsx`), qui
   una scelta sola (nessun concetto di "fasi in sequenza" da riprodurre).
2. **Granularità job**: v1 = un job per pagina, una chiamata, risultato solo
   testo. L'oggetto di configurazione del job accetta fin da subito un
   elenco di pagine (anche se l'interfaccia v1 offre solo "questa pagina"),
   così il batch multi-pagina, quando arriva, è la stessa forma con più
   pagine dentro — non una riscrittura del gestore.
3. **Niente confidenza/box in v1**: un motore linguistico generico non dà
   coordinate per riga (nessun bounding box reale) e la confidenza che
   dichiara è auto-riportata, non misurata — a differenza di OCR "puri" tipo
   Google Vision o di un motore dedicato come Kraken. Quei metadati restano
   per un secondo provider futuro, non per questo.
4. **Comando Rust, stesso pattern**: oggi le trascrizioni si scrivono da
   TypeScript con SQL diretto (`transcriptionService.ts`), nessun comando
   Rust dedicato esiste. Il gestore OCR gira lato Rust (motore lavori) e
   sarà il primo punto che scrive quelle tabelle da lì — stesse regole già
   in uso lato TS (numerazione revisione, hash del contenuto, append-only,
   mai riscrivere la storia), non condivisione letterale di codice fra i
   due linguaggi ma stessa disciplina.
5. **Storicizzazione IA → umano**: **già risolta dallo schema esistente**,
   nessun meccanismo nuovo da inventare. La revisione OCR nasce con autore
   `ocr`, immutabile come ogni revisione (append-only); ogni correzione
   dell'utente crea una revisione `user` nuova, sopra quella — esattamente
   il principio già usato nella traduzione (fasi immutabili, editing sopra),
   applicato qui a un solo passaggio IA + un solo passaggio umano invece di
   più fasi in sequenza. Se in futuro serve un secondo motore di verifica,
   lo schema lo accoglie con un altro valore di autore, senza modifiche.

## Passi di implementazione, in ordine

1. **Vision nel livello LLM** (prerequisito). Blocco immagine su
   `StructuredPrompt`/`LlmRequest`, costruttore di richiesta per provider
   vision-capable. Chiamata non-streaming (`call()`, non
   `build_streaming_request()`): un giro solo per pagina.
2. **Catalogo modelli**: nuovo `ModelUseCase = 'ocr'`, marcare i modelli che
   vedono immagini in `src/models/catalog.ts`.
3. **Comando Rust** che scrive una revisione di trascrizione (`created_by:
   'ocr'`), stessa disciplina di `transcriptionService.ts` — prima cosa da
   scrivere con TDD, perché sblocca sia il gestore lavoro sia i test.
4. **`OcrJobHandler`** dietro `JobHandler` (nuovo modulo, es.
   `src-tauri/src/ocr/`). `resource_class()` → `LanguageService`. `run()`
   chiama il provider configurato per il documento, passa l'immagine della
   pagina, scrive la revisione col comando del punto 3.
5. **Selezione provider/modello per documento**: campo su
   `TranscriptionDocument` (o tabella di configurazione dedicata, da
   decidere nel dettaglio quando si scrive lo schema) — stessa forma di
   `provider`/`model`/`providerOptions` già su `PipelineStageConfig`.
6. **UI**: scheda Assistenza attivata. Comando OCR come `IconButton`
   icona-sola con tooltip (niente pillola/testo colorato — regola del
   design system, `docs-dev/UI_DESIGN_SYSTEM.md`); il motivo di un comando
   disattivato (nessun provider configurato, pagina senza immagine
   collegata) sta nel tooltip, non in un testo a parte. Stato del job:
   riuso della barra lavori esistente, nessun elemento nuovo. Risultato:
   appare come revisione bozza nell'editor centrale, stesso comportamento
   di un salvataggio manuale — nessuna schermata di conferma separata.

## Non in scope qui

- Motore locale (Kraken) o altro: predisposto dall'astrazione (`JobHandler`
  generico, provider scelto per documento), non costruito ora.
- Confidenza/box per riga: vedi punto 3 delle decisioni.
- Filtri visuali, ritaglio, corpus di frammenti: punto 3 della roadmap,
  fuori da questo lavoro.
