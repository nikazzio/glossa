# Glossa — Tabella di marcia verso l'MVP

> Roadmap operativa per portare Glossa dalla fase alpha (v0.2.x) a un MVP pubblicabile.
> Origine: revisione tecnica del 25-04-2026 e pianificazione UX della stessa giornata.

---

## Cos'è questo file

Documento unico di pianificazione: censisce le attività necessarie per arrivare a un MVP, ne traccia lo stato, registra le decisioni di prodotto già prese, e fissa i criteri di accettazione.

Non sostituisce il codice come fonte di verità. Riferimenti `path:linea` valgono al momento della scrittura: in caso di refactor successivi vanno riallineati.

---

## Come usare questo file

### Per gli agenti AI (Claude Code, Codex, …)

1. Leggi la sezione **Convenzioni** prima di iniziare qualsiasi attività.
2. Prima di affrontare un'attività verifica i campi **Stato** e **Riferimenti**: non rifare lavoro già completato.
3. Aggiorna lo **Stato** quando prendi in carico (`in corso`) e quando concludi (`completata`, con il riferimento al commit o alla pull request).
4. Se incontri un imprevisto, aggiungi una nota `> [!attenzione]` sotto l'attività anziché silenziarlo.
5. Non modificare la **severità** di un'attività senza un accordo esplicito.
6. Niente ampliamenti opportunistici. Completa l'attività come specificata e fermati. Le modifiche fuori ambito vanno annotate nella sezione **Cambi di ambito** a fondo file.

### Per Niki

- Spunta le attività completate nella **Panoramica avanzamento** a fondo file.
- L'ordinamento riflette la priorità degli sprint, non la severità in assoluto.
- Tutte le attività con severità `bloccante` devono essere chiuse prima della prima release pubblica.

---

## Convenzioni

- **Severità**
  - `bloccante` — nessuna release senza.
  - `importante` — nessuna v1.0 senza.
  - `minore` — utile da avere, non blocca.
- **Stato**
  - `da fare` | `in corso` | `bloccata` | `completata`.
- **Riferimento ai file**: sempre nella forma `path:linea` rispetto al codice corrente.
- **Verifica obbligatoria su ogni correzione**:
  - `npm run lint`, `npm test` verdi
  - `cd src-tauri && cargo check && cargo clippy --all-targets -- -D warnings && cargo test` verdi
- **Test**: aggiungerne di nuovi quando si tocca logica testabile. Obiettivo: almeno un test per ogni correzione non banale.

---

## Sprint 1 — Sicurezza e robustezza (bloccante, completato)

Sprint chiuso e fuso su `main` con la pull request #36.

### S1-T1 — Abilitare la Content Security Policy

- **Severità**: `bloccante`
- **Stato**: `completata` (commit `61b40b3`)
- **File**: `src-tauri/tauri.conf.json:24-26`, `src-tauri/tauri.release.conf.json`
- **Problema**: `"csp": null`. Una vulnerabilità XSS introdotta da una qualsiasi dipendenza npm avrebbe accesso completo a `invoke()`, al keychain e al database locale.
- **Soluzione applicata**:
  - Policy permissiva in `tauri.conf.json` (necessaria per HMR di Vite in sviluppo).
  - Policy stringente in `tauri.release.conf.json`: `default-src 'self'`, nessun `'unsafe-eval'`, `connect-src` ristretto ai cinque provider supportati e a `localhost:11434` per Ollama.

### S1-T2 — Restringere l'ambito delle capability del filesystem

- **Severità**: `bloccante`
- **Stato**: `completata` (commit `9776536`)
- **File**: `src-tauri/capabilities/default.json:18-20`
- **Problema**: `fs:allow-read-text-file` e `fs:allow-write-text-file` erano concessi senza ambito: il webview poteva leggere e scrivere qualsiasi file di testo accessibile al processo (chiavi SSH, file `.env`, eccetera).
- **Soluzione applicata**: ambito ristretto a `$DOCUMENT/**`, `$DOWNLOAD/**`, `$DESKTOP/**`, `$APPDATA/**`, `$APPCONFIG/**`, `$TEMP/**`. `$HOME/**` esplicitamente escluso (ricomprenderebbe `~/.ssh`, `~/.aws`, eccetera).

### S1-T3 — Token di cancellazione per gli stream LLM nel backend Rust

- **Severità**: `bloccante`
- **Stato**: `completata` (commit `8944c19`)
- **File**: `src-tauri/src/llm.rs`, `src-tauri/src/lib.rs`
- **Problema**: la cancellazione lato frontend non interrompeva la richiesta HTTP in volo. L'utente premeva «Stop» e lo stream continuava a consumare crediti del provider fino al timeout di 120s.
- **Soluzione applicata**:
  - Nuovo `StreamRegistry` come state Tauri, mappa `stream_id` → `CancelToken { AtomicBool + Notify }`.
  - Nuovo comando `cancel_stream(stream_id)`.
  - Il loop SSE usa `tokio::select!` per fare race tra la lettura del prossimo chunk e la notifica di cancellazione: il rilascio della response chiude la connessione TCP entro 1s.

### S1-T4 — Rimuovere il body della risposta dai messaggi di errore HTTP

- **Severità**: `bloccante`
- **Stato**: `completata` (commit `a434da1`)
- **File**: `src-tauri/src/llm.rs:234, 281, 327, 660`
- **Problema**: i quattro punti dove un errore del provider veniva propagato al frontend includevano il body completo della risposta, potenzialmente contenente il prompt utente, header echeggiati o dati sensibili.
- **Soluzione applicata**: nuovo helper `format_api_error(...)` che mappa i codici di stato comuni (401, 403, 404, 429, 5xx) a messaggi sintetici e neutri. Il body integrale viene loggato solo con `log::debug!` dietro `#[cfg(debug_assertions)]`.

### S1-T5 — Idempotenza di `runPipeline` e `runAuditOnly`

- **Severità**: `importante`
- **Stato**: `completata` (commit `e05c002`)
- **File**: `src/hooks/usePipeline.ts:31-35, 148-152`
- **Problema**: nessun controllo di rientranza all'inizio dei due metodi. Un doppio click rapido sul pulsante di avvio poteva avviare due esecuzioni in parallelo prima che React propagasse il `disabled`.
- **Soluzione applicata**: controllo `if (usePipelineStore.getState().isProcessing) return;` come prima istruzione di entrambi i callback. Aggiunti due test di regressione.

---

## Sprint 2 — Pronti per il rilascio

### S2-T1 — Aggiungere la build macOS al workflow di release

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: `.github/workflows/release.yml`
- **Problema**: il workflow di release produce solo binari Linux e Windows. Manca il `.dmg` per macOS.
- **Soluzione**:
  1. Aggiungere il job `build-macos` (matrice `macos-latest` + `macos-13` per Intel).
  2. Riusare lo stesso pattern di `build-linux` / `build-windows` con `tauri-action` e firma.
  3. Generare `SHA256SUMS-macos.txt` con lo script esistente.
  4. Senza notarization Apple per ora (richiede un Developer Account a pagamento): `.dmg` non firmato, documentare in `README.md` la procedura per aggirare Gatekeeper (`xattr -cr Glossa.app`).
- **Accettazione**: una release di prova produce `.dmg` per arm64 e x64 e il file di checksum corrispondente.

### S2-T2 — Audit delle dipendenze nel CI (`cargo audit`, `npm audit`)

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: `.github/workflows/ci.yml`
- **Soluzione**:
  1. Job `audit-frontend` con `npm audit --audit-level=high` (non bloccante per `moderate`).
  2. Job `audit-backend` con `cargo install cargo-audit` + `cd src-tauri && cargo audit`.
  3. Trigger su `push` e `schedule: cron` settimanale, in modo da intercettare anche le advisory pubblicate fra un commit e l'altro.
- **Accettazione**: il CI fallisce su CVE `high`/`critical` di una dipendenza diretta o indiretta. I due job sono visibili in `gh pr checks`.

### S2-T3 — Profilo di release ottimizzato in Cargo

- **Severità**: `minore`
- **Stato**: `da fare`
- **File**: `src-tauri/Cargo.toml`
- **Soluzione**: aggiungere
  ```toml
  [profile.release]
  lto = true
  codegen-units = 1
  panic = "abort"
  strip = true
  opt-level = "z"
  ```
- **Accettazione**: la build di release passa; il binario finale risulta almeno il 20% più piccolo (verificare con `ls -la src-tauri/target/release/glossa`).

### S2-T4 — Watchdog frontend su chunk bloccato

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: `src/services/llmService.ts:35-62`, `src/hooks/usePipeline.ts`
- **Problema**: se il backend Tauri muore senza emettere un evento di errore, l'interfaccia resta in `isProcessing = true` indefinitamente.
- **Soluzione**:
  1. In `runStageStream` avvolgere la promessa con `Promise.race` contro un timeout configurabile (default 180s).
  2. Il timeout si riarma a ogni token ricevuto (idle timeout, non assoluto).
  3. Allo scadere viene rifiutato un errore `StreamWatchdogTimeout` con un toast dedicato.
- **Accettazione**: con un listener che non emette mai un token, la promessa viene rifiutata entro il timeout configurato.

### S2-T5 — Whitelist di tabelle e colonne in `ensureColumn`

- **Severità**: `importante` (difesa in profondità)
- **Stato**: `da fare`
- **File**: `src/services/dbService.ts:12-20`
- **Problema**: l'helper interpola direttamente `table` e `column` nella stringa SQL. Oggi è chiamato solo con argomenti letterali noti, ma il pattern è una potenziale SQL injection futura.
- **Soluzione**:
  ```ts
  const ALLOWED_COLUMNS: Record<string, string[]> = {
    pipeline_configs: ['target_chunk_count'],
    translations: ['chunk_status', 'judge_status', 'judge_rating'],
  };
  if (!ALLOWED_COLUMNS[table]?.includes(column)) {
    throw new Error(`Refusing to alter unknown table/column: ${table}.${column}`);
  }
  ```
- **Accettazione**: `dbService.test.ts` aggiunge un caso che verifica il `throw` su input fuori whitelist.

---

## Sprint 3 — Qualità del codice

### S3-T1 — Refactor di `llm.rs` con il trait `LlmProvider`

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: `src-tauri/src/llm.rs` (1043 righe)
- **Problema**: quattro funzioni `call_*` con logica duplicata di costruzione del body HTTP, gestione errori e parsing della risposta. Il parsing JSON usa `serde_json::Value` con accessi indicizzati non protetti.
- **Soluzione**:
  1. Definire un trait
     ```rust
     trait LlmProvider {
         fn build_request(&self, ...) -> RequestBuilder;
         fn extract_text(&self, response: &Value) -> Result<String, String>;
         fn parse_stream_chunk(&self, chunk: &str) -> Option<String>;
     }
     ```
  2. Implementarlo per `Gemini`, `OpenAICompatible` (riusato da DeepSeek e Ollama), `Anthropic`.
  3. Sostituire l'accesso a `serde_json::Value` con strutture `#[derive(Deserialize)]` per ogni provider.
  4. Suddividere in moduli: `llm/mod.rs`, `llm/gemini.rs`, `llm/openai.rs`, `llm/anthropic.rs`, `llm/ollama.rs`, `llm/keychain.rs`, `llm/stream.rs`.
- **Accettazione**: i 79 test esistenti continuano a passare; le righe del modulo si riducono di almeno il 30%; nessun `panic` su risposta malformata (test con JSON inventato).

### S3-T2 — Idle timeout sullo stream HTTP

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: `src-tauri/src/llm.rs` (loop SSE)
- **Problema**: timeout assoluto a 120s ma nessun idle timeout. Un provider lento ma vivo viene tagliato anche se sta ancora producendo.
- **Soluzione**: avvolgere ogni `read` del body stream con `tokio::time::timeout` (default 30s di silenzio massimo, configurabile via costante).
- **Accettazione**: stream con pause inferiori al timeout funzionano; pause più lunghe vengono chiuse con un errore distinguibile.

### S3-T3 — Test end-to-end della pipeline con un provider mock

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: nuovo `src-tauri/tests/pipeline_e2e.rs` o `src/__tests__/pipeline.e2e.test.ts`
- **Soluzione**: usare `wiremock-rs` (lato Rust) o `msw` (lato frontend) per simulare le risposte SSE dei provider e testare l'intero flusso da `runPipeline()` al toast finale.
- **Accettazione**: almeno tre scenari coperti — successo, retry-poi-successo, fallimento dopo i retry.

### S3-T4 — Test di integrazione di `llmService` e dei modali critici

- **Severità**: `minore`
- **Stato**: `da fare`
- **File**: nuovi test in `src/services/llmService.test.ts`, `src/components/settings/SettingsModal.test.tsx`, `src/components/projects/ProjectPanel.test.tsx`
- **Accettazione**: copertura lato frontend ≥ 60%.

### S3-T5 — Allineare il timeout di Ollama al resto

- **Severità**: `minore`
- **Stato**: `da fare`
- **File**: `src-tauri/src/llm.rs:507, 535`
- **Problema**: i comandi specifici di Ollama usano un timeout hardcoded a 3s; il resto dell'app a 120s. Incoerenza che taglia richieste a modelli locali grandi.
- **Soluzione**: estrarre una costante dedicata `OLLAMA_PROBE_TIMEOUT_SECS`, oppure riusare `HTTP_REQUEST_TIMEOUT_SECS`. In ogni caso, eliminare i numeri magici.
- **Accettazione**: nessun `Duration::from_secs(N)` duplicato nel modulo.

---

## Sprint 4 — Refactor dell'esperienza d'uso (usabilità per documenti reali)

> Origine: pianificazione UX del 25-04-2026, dopo il merge dello Sprint 1.
> Obiettivo: trasformare Glossa da "wireframe funzionante" a un MVP che traduca documenti reali con stabilità, capacità di ripristino e librerie di asset riutilizzabili.

### Decisioni di prodotto fissate

| # | Tema | Scelta |
|---|------|--------|
| A | Modalità di lavoro | Selettore in testata `[Sandbox \| Documento]`. Stessa shell, layout interno cambia. Niente router. |
| B | Sicurezza dati sui blocchi | Divisione e fusione dei blocchi sono offerte **solo** quando lo stato è `pronto` o `errore`. Sui blocchi `completati` i pulsanti spariscono. La modifica del testo sorgente di un blocco completato richiede una conferma esplicita. |
| C | Importazione file | Solo `.txt` e `.md` per ora. `.docx` (libreria mammoth, ~150 KB) e `.pdf` (libreria pdfjs-dist, ~700 KB) restano in backlog. |
| D | Salvataggio automatico | Si attiva solo dopo che il progetto ha un nome. Il primo salvataggio chiede il nome; da lì in avanti, debounce di 2 s, sospeso durante l'elaborazione. |
| E | Librerie di asset | Modelli di prompt e dizionari come entità di prima classe nel database, riutilizzabili tra progetti. |

### S4-T1 — Eliminazione delle perdite di dati sui blocchi completati

- **Severità**: `bloccante`
- **Stato**: `completata` (PR #37, commit `190aa11`)
- **File**: `src/stores/pipelineStore.ts`, `src/components/pipeline/ProductionStream.tsx`, `src/components/pipeline/PipelineConfig.tsx`, `src/hooks/usePipeline.ts`, `src/i18n/{en,it}.json`
- **Problema**: dividere, fondere o modificare il sorgente di un blocco già tradotto azzerava silenziosamente `stageResults`, `judgeResult` e `currentDraft`. Inoltre `runPipeline` resettava tutti i blocchi a ogni esecuzione, vanificando le traduzioni precedenti.
- **Soluzione applicata**:
  1. `splitChunk` e `mergeChunkWithNext` sono inerti se lo stato è `completed` o `processing` (controllo nello store + pulsanti nascosti nell'interfaccia).
  2. Sui blocchi completati compare un pulsante «Modifica sorgente» che apre un `ConfirmDialog` e poi invoca la nuova action `unlockChunkForEdit`.
  3. Il textarea del sorgente diventa `readOnly` quando il blocco è completato.
  4. `runPipeline` salta i blocchi `completed`; il reset avviene solo sul blocco effettivamente in lavorazione.
  5. Nuovo pulsante «Rilancia tutto» in `PipelineConfig` con conferma e nuova action `resetCompletedChunks`.
- **Riferimenti**: PR #37 (commit di merge `190aa11`); commit di follow-up `ae4bc3c` con i fix sollevati in revisione (`clearChunkStages`, lettura via `getState()`, hint i18n).

### S4-T2 — Rilancio per singolo blocco e ispezione audit per blocco

- **Severità**: `bloccante` (UX)
- **Stato**: `in corso` (PR #38, in revisione)
- **File**: `src/hooks/usePipeline.ts`, `src/components/pipeline/ProductionStream.tsx`, `src/components/audit/AuditPanel.tsx`, `src/App.tsx`, `src/i18n/{en,it}.json`
- **Problema**: oggi tutto è all-or-nothing. Per ritradurre un singolo blocco occorre rilanciare l'intera pipeline; il pannello audit aggrega le anomalie con `flatMap`, quindi con 20 blocchi non è possibile capire quale ha quale problema.
- **Soluzione**:
  1. Estrarre `executePipelineForChunk(chunk)` e `runJudgeForChunk(chunk)` come helper interni dell'hook `usePipeline`.
  2. Esporre `runSingleChunk(id)` e `auditSingleChunk(id)`.
  3. Barra di azioni per blocco in `ProductionStream`: Ri-traduci / Ri-valuta / Modifica sorgente / Dividi / Fondi (gli ultimi due solo a stato consentito).
  4. Riscrittura di `AuditPanel` come elenco di `ChunkAuditCard` espandibili. La qualità composita resta in alto; ogni card mostra la qualità del singolo blocco e, all'apertura, le anomalie con suggerimenti di correzione e il pulsante «Ri-valuta».
- **Riferimenti**: PR #38, commit `4df7204`.
- **Osservazioni in revisione (da risolvere prima del merge)**:
  - `executePipelineForChunk` restituisce `'completed'` anche quando nessuno stage ha prodotto output e il blocco torna a `ready`. Per `runSingleChunk` questo genera un toast di successo fuorviante. Va introdotto un esito `'skipped'`.
  - `runJudgeForChunk` aggiorna `judgeResult.status = 'processing'` ma non `chunk.status`. Regressione rispetto al comportamento originale di `runAuditOnly`. Aggiungere `updateChunkStatus(chunk.id, 'processing')` all'inizio dell'helper.
  - `runAuditOnly` non controlla più `cancelRequested` tra un blocco e l'altro: il pulsante «Stop» risulta inefficace per una valutazione massiva. Reintegrare il controllo nel ciclo `for`.

### S4-T3 — Suddivisione degli store e selettore di modalità Sandbox/Documento

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: nuovi `src/stores/uiStore.ts`, `src/stores/chunksStore.ts`, `src/components/sandbox/SandboxView.tsx`, `src/components/document/DocumentView.tsx`. Modifiche a `src/stores/pipelineStore.ts`, `src/components/layout/Header.tsx`, `src/App.tsx`, `src/services/dbService.ts` (migrazione `view_mode`).
- **Problema**: il layout a tre pannelli è identico per qualsiasi caso d'uso (testo breve di prova vs. file lungo). `pipelineStore` (316 righe) mescola quattro responsabilità — UI volatile, configurazione persistente, stato dei blocchi a runtime, testo sorgente — e aggiungere `mode` lo porterebbe oltre le 500 righe.
- **Soluzione**:
  1. Suddividere lo store in tre: `uiStore` (modalità, modali, stato Ollama), `pipelineStore` snellito (configurazione + testo sorgente), `chunksStore` (blocchi, `isProcessing`, `dirtyChunkIds`).
  2. Selettore `[Sandbox | Documento]` in testata, disabilitato quando `isProcessing` è vero.
  3. `SandboxView`: layout a colonna unica, un solo blocco fisso (lunghezza 1, derivato da `inputText`), audit opzionale.
  4. `DocumentView`: estrazione del layout a tre colonne attuale con il pannello audit aggiornato dallo S4-T2.
  5. Persistenza della modalità: colonna `view_mode TEXT NULL` su `projects`. `NULL` significa derivata (`chunks.length > 1` → documento). Un click esplicito sul selettore salva il valore in modo persistente.
- **Accettazione**: il selettore non distrugge i blocchi in nessuna direzione; aprire un progetto regola la modalità in automatico; il selettore è inerte durante l'elaborazione; in modalità Sandbox un progetto con N blocchi mostra solo il primo, accompagnato da un messaggio che invita a passare a Documento.

### S4-T4 — Anteprima d'importazione, salvataggio automatico e indicatore di stato

- **Severità**: `bloccante` (zero perdite di dati su crash)
- **Stato**: `da fare`
- **File**: `src/services/fileService.ts`, nuovi `src/components/dialogs/ImportPreviewDialog.tsx` e `src/hooks/useAutosave.ts`. Modifiche a `src/services/projectService.ts`, `src/stores/projectStore.ts` (e `chunksStore` post S4-T3), `src/components/layout/Header.tsx`, `src/App.tsx`.
- **Problema**: oggi il salvataggio è solo manuale; una chiusura non programmata cancella ogni progresso. L'importazione di un file inserisce il testo in `inputText` senza anteprima: l'utente non ha modo di vedere quanti blocchi verranno generati prima di confermare.
- **Soluzione**:
  1. `previewImport(path) → { text, chunkPreview: { count, avgWords, totalWords } }` in `fileService.ts`.
  2. `ImportPreviewDialog` mostra «8 blocchi · ~520 parole/blocco · 4180 parole totali»; conferma → `setInputText` + `generateChunks` + modalità documento.
  3. `useAutosave` con debounce di 2000 ms, attivo solo se `currentProjectId` esiste, l'insieme dirty non è vuoto, e `isProcessing` è falso.
  4. `saveTranslations` accetta `dirtyIds?: Set<string>` per fare upsert mirato (evita un `DELETE + INSERT` su trenta blocchi a ogni tick).
  5. `projectStore` espone `dirty` e `lastSavedAt`. La testata mostra l'indicatore in tre stati: `salvato` / `modifiche non salvate` / `salvataggio in corso`.
  6. Dialogo «Dai un nome al progetto» al primo salvataggio manuale per i progetti `Senza nome`.
- **Accettazione**: chiudere e riaprire l'app senza salvataggio manuale ripristina lo stato; il dialogo del nome compare solo al primo salvataggio; l'indicatore passa correttamente da `modifiche non salvate` a `salvataggio in corso` a `salvato`.

### S4-T5a — Libreria di modelli di prompt

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: nuovi `src/services/promptLibraryService.ts`, `src/components/prompt/PromptEditor.tsx`, `src/components/prompt/PromptLibraryPanel.tsx`. Modifiche a `src/services/dbService.ts` (migrazione `prompt_templates`), `src/components/pipeline/StageCard.tsx`, `src/types.ts` (tipo `PromptTemplate`), `src/i18n/{en,it}.json`.
- **Problema**: l'editor di prompt è una textarea piccola dentro `StageCard`, inadeguata per prompt lunghi necessari al primo passaggio. Non esiste un modo di salvare prompt riutilizzabili tra progetti.
- **Soluzione**:
  1. Migrazione SQL: tabella
     ```sql
     CREATE TABLE IF NOT EXISTS prompt_templates (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT DEFAULT '',
       body TEXT NOT NULL,
       category TEXT NOT NULL DEFAULT 'custom',
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )
     ```
     Categorie: `translation_initial`, `translation_refinement`, `audit`, `custom`.
  2. Servizio CRUD + `seedDefaults()` idempotente al primo avvio (3-4 modelli predefiniti in en/it).
  3. `PromptEditor` come modale a piena altezza (90vh): `<textarea>` monospace `min-h-[60vh]`, scorciatoia `Ctrl+Invio` per salvare.
     - Strumenti nell'intestazione: contatore di token approssimativo (parole × 1.33), evidenziazione delle variabili `{{source_text}}`, `{{glossary}}`, `{{previous_result}}`, `{{source_lang}}`, `{{target_lang}}` con regex e overlay CSS.
     - Menù «Carica dalla libreria» e pulsante «Salva come modello».
  4. Pulsante «Apri editor ↗» accanto al campo prompt in `StageCard`. Il campo rapido inline rimane per le piccole modifiche.
  5. `PromptLibraryPanel` accessibile da `SettingsModal` o da una nuova icona in testata.
- **Accettazione**: salvare un modello e ripescarlo da un altro progetto; contatore di token aggiornato in tempo reale; variabili evidenziate; CSP rispettata (nessuna risorsa esterna).

### S4-T5b — Dizionari (riattivazione delle tabelle SQL già presenti)

- **Severità**: `importante`
- **Stato**: `da fare`
- **File**: nuovi `src/services/dictionaryService.ts`, `src/components/dictionary/DictionariesPanel.tsx`, `src/components/dictionary/DictionaryEditor.tsx`. Modifiche a `src/components/pipeline/PipelineConfig.tsx`, `src/services/projectService.ts`, `src/types.ts`, `src/i18n/{en,it}.json`.
- **Problema**: il glossario di Glossa vive solo in memoria sul progetto corrente (`config.glossary` in `pipelineStore`). Nessuna possibilità di riusarlo tra progetti. Le tabelle `glossaries`, `glossary_entries`, `project_glossaries` esistono già in `dbService.ts:51-79` ma non vengono mai lette o scritte.
- **Soluzione**:
  1. Servizio CRUD su dizionari ed entries; collegamento ai progetti tramite `project_glossaries`.
  2. `DictionariesPanel`: gestione globale (elenco, creazione, modifica, eliminazione, importazione/esportazione JSON per condivisione).
  3. `DictionaryEditor`: modale per modificare i termini di un dizionario (term, translation, notes, context).
  4. In `PipelineConfig` la sezione «Registro termini» viene sostituita da: (a) selettore «Dizionari attivi» a scelta multipla, (b) elenco combinato in sola lettura dei termini risultanti.
  5. **Migrazione morbida**: al primo avvio post-aggiornamento, se un progetto ha `config.glossary` non vuoto, creare un dizionario implicito `«Progetto — <nome progetto> — termini»` collegato al solo progetto e svuotare `config.glossary` in memoria.
- **Accettazione**: un dizionario creato in un progetto è disponibile in un altro; i termini del dizionario attivo finiscono nel prompt finale; la migrazione morbida non perde termini esistenti.

### S4-T6 — Esportazione combinata e rifiniture UX

- **Severità**: `minore`
- **Stato**: `da fare`
- **File**: `src/services/fileService.ts`, `src/components/pipeline/PipelineConfig.tsx`, `src/components/sandbox/SandboxView.tsx`, `src/components/audit/AuditPanel.tsx`, `src/i18n/{en,it}.json`.
- **Soluzione**:
  1. `exportCombined(chunks, options)`: concatena `currentDraft` in ordine, separatori configurabili (a capo doppio, `---`, oppure nessuno), opzione `includeSourceForMissing` per inserire il sorgente al posto della traduzione mancante.
  2. Se nell'export ci sono blocchi non `completed`: toast informativo «N blocchi non ancora tradotti — esportato comunque».
  3. Conferma dell'utente sui cambi di configurazione invalidanti (per esempio, cambio della lingua di destinazione) quando esistono blocchi `completed`.
  4. Empty-state guidato in modalità Sandbox: invito chiaro «Incolla testo» / «Importa file».
  5. Badge dello stato del blocco rivisitato (verde/grigio/giallo/rosso, con `aria-label` corretti).

### Rischi principali dello Sprint 4

| # | Rischio | Mitigazione |
|---|---------|-------------|
| 1 | Salvataggio automatico troppo aggressivo: tempesta di scritture su SQLite | Insieme dirty + upsert mirato + sospensione durante `isProcessing` (S4-T4) |
| 2 | Cambio di modalità durante un'elaborazione | Selettore disabilitato, tooltip esplicativo (S4-T3) |
| 3 | Conflitto fra rilancio per blocco singolo e pipeline globale | `isProcessing` come controllo unico, condiviso fra tutti gli ingressi (già attivo da S4-T2) |
| 4 | `inputText` ricostruito in modo lossy dopo l'apertura di un progetto in modalità Documento | In modalità Documento la textarea aggregata è nascosta; si lavora solo sui chunk-card (S4-T3) |
| 5 | Migrazioni su installazioni esistenti | Tutto via `ensureColumn` esistente, niente `DROP`, solo `IF NOT EXISTS`. Estendere `ALLOWED_COLUMNS` in parallelo a S2-T5 |
| 6 | Evidenziazione delle variabili nel `PromptEditor` non allineata su Tailwind 4 | Test manuale precoce; in alternativa fallback a `<pre>` posizionato sotto il textarea con metriche font identiche. Niente librerie esterne (S4-T5a) |

---

## Backlog post-MVP

- **B-1** — Cifrare il database SQLite con SQLCipher (utile se i testi sono inediti).
- **B-2** — Logging strutturato anche in release, attivabile dall'utente.
- **B-3** — Telemetria di crash report opzionale (opt-in).
- **B-4** — `optimize_prompt` rispetta le impostazioni anziché essere fissato su Gemini (`llm.rs:724`).
- **B-5** — Memoizzare `useJudgeModelOptions` in `PipelineConfig.tsx`.
- **B-6** — Suddividere `PipelineConfig.tsx` (351 righe) e `HelpGuide.tsx` (359 righe) in sotto-componenti se cambieranno spesso.
- **B-7** — Sostituire `console.log` in `dbService.ts:108` con un logger condizionale.
- **B-8** — Garanzia di inizializzazione di i18n prima del primo render, per evitare `t()` undefined nei toast precoci.
- **B-9** — Importazione di `.docx` (mammoth) e `.pdf` (pdfjs-dist), come pianificato in S4 ma rinviato.

---

## Panoramica avanzamento

### Sprint 1 — Sicurezza e robustezza
- [x] S1-T1 — Content Security Policy attiva (`61b40b3`)
- [x] S1-T2 — Capability del filesystem ristrette (`9776536`)
- [x] S1-T3 — Cancellazione degli stream lato Rust (`8944c19`)
- [x] S1-T4 — Sanitizzazione dei messaggi di errore (`a434da1`)
- [x] S1-T5 — `runPipeline` idempotente (`e05c002`)

### Sprint 2 — Pronti per il rilascio
- [ ] S2-T1 — Build macOS nel workflow di release
- [ ] S2-T2 — `cargo audit` e `npm audit` nel CI
- [ ] S2-T3 — Profilo di release ottimizzato in Cargo
- [ ] S2-T4 — Watchdog frontend su chunk bloccato
- [ ] S2-T5 — Whitelist di tabelle e colonne in `ensureColumn`

### Sprint 3 — Qualità del codice
- [ ] S3-T1 — Refactor di `llm.rs` (trait + tipi `Deserialize`)
- [ ] S3-T2 — Idle timeout sullo stream
- [ ] S3-T3 — Test end-to-end della pipeline
- [ ] S3-T4 — Test di integrazione frontend
- [ ] S3-T5 — Allineamento timeout di Ollama

### Sprint 4 — Refactor UX
- [x] S4-T1 — Eliminazione delle perdite di dati (PR #37, `190aa11`)
- [ ] S4-T2 — Rilancio per blocco e ispezione audit (PR #38, in revisione — 3 osservazioni aperte)
- [ ] S4-T3 — Suddivisione store + selettore Sandbox/Documento
- [ ] S4-T4 — Anteprima d'importazione + salvataggio automatico
- [ ] S4-T5a — Libreria di modelli di prompt
- [ ] S4-T5b — Dizionari riutilizzabili tra progetti
- [ ] S4-T6 — Esportazione combinata + rifiniture UX

### Backlog
- [ ] B-1 — Cifratura SQLite (SQLCipher)
- [ ] B-2 — Logging in release attivabile dall'utente
- [ ] B-3 — Telemetria opt-in
- [ ] B-4 — `optimize_prompt` rispetta le impostazioni
- [ ] B-5 — Memoizzare `useJudgeModelOptions`
- [ ] B-6 — Suddividere `PipelineConfig` e `HelpGuide` se cambiano spesso
- [ ] B-7 — Logger condizionale al posto di `console.log`
- [ ] B-8 — Inizializzazione di i18n garantita prima del primo render
- [ ] B-9 — Importazione `.docx` e `.pdf`

---

## Cambi di ambito proposti

> Annotazioni di lavoro che esulano dall'ambito originale di un'attività e che vanno discusse con Niki prima di promuoverle a vere e proprie attività.
> Formato: `- [proposto] descrizione (origine: T-id)`

_(vuoto)_
