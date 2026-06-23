# Glossa — Architecture Reference (Claude-optimized)

> Aggiorna questo file ogni volta che cambia un flusso architetturale, uno store, un comando Tauri, o lo schema DB.
> Non descrivere *cosa* fa il codice (già nei nomi) — documenta *come si connette* e *perché* certi pattern esistono.

---

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Tailwind v4, Zustand, Vite |
| Backend | Rust, Tauri v2, tokio, reqwest |
| DB | SQLite via SQLx (WAL mode) |
| Test FE | Vitest + Testing Library |
| Test BE | tokio-test, wiremock |

---

## Store Zustand

| File | Stato chiave | Note |
|---|---|---|
| `stores/pipelineStore.ts` | config pipeline, inputText, sourceFootnotes, runStatus, mode, provider | Config immutabile per run; mode: 'standard'\|'deepl-hybrid'; provider: 'openai'\|'anthropic'\|'gemini'\|'deepseek'\|'ollama'\|'deepl' |
| `stores/chunksStore.ts` | chunks[], isProcessing, cancelRequested, activeStreamId | RAF batching per token stream; Map O(1) per chunk lookup |
| `stores/projectStore.ts` | projects[], currentProjectId, pipelines[], activePipelineId | Multi-pipeline per progetto |
| `stores/workspaceStore.ts` | workspaces[], activeWorkspace, loading/isLoaded | Boundary traduzioni: switch/create/update workspace, un workspace attivo per volta |
| `stores/phraseMemoryStore.ts` | matchesByChunk, enabledMatchIds, jobStatus, searchStatus | Match Phrase Memory per chunk; match trovati read-only finché non selezionati |
| `stores/operationLogStore.ts` | entries[], currentProjectId | Max 2000 in-memory, resto in DB |
| `stores/annotationsStore.ts` | annotationsByChunkId Map<chunkId, Annotation[]> | CRUD annotations per chunk; load/add/update/delete con persistenza SQLite immediata |
| `stores/uiStore.ts` | selectedChunkId, highlightsEnabled, highlightColors, uiFont, searchQuery, activePanel, showSettings/Help/ConfigDrawer/DocumentDrawer/ChunkDrawer | UI-only state. highlightsEnabled + highlightColors + uiFont persisted (`glossa-ui-prefs` v14). activePanel enum sincronizzato con i boolean panel. `uiFont` ('jakarta'\|'geist'\|'inter'\|'plex') → `FontSync` (`App.tsx`) fa override runtime di `--font-sans` su `:root`, come `HighlightColorSync` per i colori. |
| `stores/configStore.ts` | pipelineMode, pipelineTestChunkCount, ollamaStatus, ollamaModels, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPresetShort/Medium/Long | Config app. pipelineTestChunkCount, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPreset* persisted. ollamaStatus/Models transient. |
| `stores/libraryStore.ts` | glossaries[], loadedForWorkspaceId, isLoaded | Glossari filtrati per workspace attivo. `loadGlossaries(workspaceId)` e `reloadGlossaries(workspaceId)` accettano `string\|null`; skip se già caricato per lo stesso workspace. |
| `stores/promptTemplateStore.ts` | templates[], selectedTemplate | — |
| `stores/customProviderStore.ts` | profiles: CustomProviderProfile[] | Lista profili endpoint custom; caricata da DB on demand (Settings + StageCard). Non persistita in LocalStorage — source of truth è SQLite. |

---

## Hook critici

| File | Responsabilità |
|---|---|
| `hooks/usePipeline.ts` | **Engine principale** — runPipeline, runSingleChunk, auditSingleChunk, cancelPipeline. 3 blocchi blob assembler duplicati (refactor pendente). |

> **INVARIANTE — non toccare senza motivo esplicito**: Ollama usa `runStageStream` (streaming). Tutti gli altri provider (OpenAI, Anthropic, Gemini, DeepSeek) usano `runStage` (non-streaming). Questa separazione è intenzionale: i cloud provider hanno timeout e gestione errori diversi. Non "uniformare" i due path.
| `hooks/useProjectAutosave.ts` | Autosave con debounce |
| `hooks/useChunkWatchdog.ts` | Timeout detection per chunk inattivi |

---

## Service layer (bridge Tauri)

| File | Funzione |
|---|---|
| `services/llmService.ts` | runStage, runStageStream, judgeTranslation, runCoherence, preflightPipeline, computeBlobs. Listener eventi: `stream-token`, `chunk-prompt`, `stream-alive`. |
| `services/pipelineService.ts` | CRUD pipeline, saveChunkCheckpoint, setPipelineRunState, computeBlobs, loadTranslations, restoreTranslations |
| `services/projectService.ts` | CRUD project, persistenza sorgente (path, metadata) |
| `services/fileService.ts` | Import DOCX/PDF (estrazione testo), export bilingue/monolingua |
| `services/dbService.ts` | SQLite wrapper: execute, select, executeTransaction, initDatabase, ensureColumn |
| `services/customProviderService.ts` | Tauri invoke wrapper per i comandi custom provider (list, save, delete, test_connection) |

---

## Componenti UI critici

| Componente | Responsabilità |
|---|---|
| `components/document/DocumentView.tsx` | Layout principale documento con barra navigazione fissa in alto (`h-20`, allineata alle testate dei pannelli laterali): sinistra a due righe (indicatori stadi del frammento + minimap pallini frammenti), destra (frecce prev/next + contatore m/n). Due pannelli bianchi a filo (Originale/Candidata) con header titolo + separatore; controlli testo in menu unico a scomparsa (non barra sempre visibile) aperto da pulsante nell'header pagina. |
| `components/layout/shell-next/ShellNext.tsx` | Layout tre colonne shell nuova (#291): `ProjectRailNext` sinistra (azioni + selettore pipeline + Esegui) · documento centro · `ProjectInspectorNext` destra (schede Approfondimenti/Frammento). Collasso e larghezze persistiti su uiStore. |
| `components/layout/shell-next/ProjectRailNext.tsx` | Barra sinistra nuova: navigazione inline (Run/Pipeline/Document), azioni progetto, selettore pipeline, pulsante Esegui. Collasso riduce a icone. |
| `components/layout/shell-next/ProjectInspectorNext.tsx` | Pannello destro collassabile: schede Approfondimenti (index/search/stats/glossary/coherence) e Frammento. |
| `components/pipeline/ProductionStream.tsx` | Riga chunk — editor sorgente, risultati stage, judge issues, draft editor |
| `components/pipeline/PipelineActions.tsx` | Run / Cancel / Audit buttons |
| `components/pipeline/StageCard.tsx` | Visualizza singolo stage (token, retry info) |
| `components/document/ConfigDrawer.tsx` | Drawer config pipeline: mode, lingue, stage, persona, glossary |
| `components/layout/Header.tsx` | Solo breadcrumb navigazione (Glossa // workspace // progetto); non contiene più pulsanti d'azione |
| `components/layout/AppStatusBar.tsx` | Barra di stato in basso (h-8): context breadcrumb (sx), stats (centro), controlli vista documento — fuoco pannelli (sola-sorgente/sola-traduzione/entrambi) + scorrimento agganciato (sh) — + indicatore salvataggio (destra). Shell nuova (#291). |
| `components/workspace/WorkspaceHome.tsx` | Hub workspace: titolo + pulsanti azione (Libreria, Nuovo progetto) in alto a destra; lista completa progetti in stile filesystem (colonne Nome / Modificato, senza limite); area cards; banner provider |
| `components/workspace/WorkspaceWizard.tsx` | Primo avvio: crea il primo workspace reale |
| `components/document/AnnotationContextMenu.tsx` | Menu contestuale (clic destro sul testo della traduzione) → «Aggiungi annotazione» con anchor pre-compilato |
| `utils/annotationMarkdown.ts` | `composeAnnotatedMarkdown()` — compone vista GFM con marcatori `[^a1]` e definizioni a piè di pagina; non modifica il draft salvato |

### Primitive overlay (Radix UI)

Le finestre modali, i tooltip e i menu poggiano su **Radix UI** (`@radix-ui/react-dialog`, `react-alert-dialog`, `react-tooltip`, `react-dropdown-menu`). Comportamento (focus trap, Escape, scroll-lock, portale, ARIA, navigazione tastiera) delegato alla libreria — non si reimplementa a mano.

| Primitiva (`components/ui/`) | Uso |
|---|---|
| `Dialog` | Finestra modale generica (chrome editoriale, X in alto a destra). z-index `z-[200]`. |
| `AlertDialog` | Conferme (azione + annulla); `tone="danger"` per azioni distruttive. |
| `DialogConfirmButton` / `DialogCancelButton` | Pulsanti footer uniformi (conferma inchiostro, annulla bordo). |
| `Tooltip` | Tooltip editoriale su Radix (Provider interno, `z-[210]`). |
| `Menu` | Menu contestuale/a tendina su Radix DropdownMenu (ancora virtuale `anchorRect`). |
| `IconButton` | Pulsante icona con tipp. CVA: size (`xs`/`sm`/`md`/`lg`), tone (`default`/`accent`/`success`/`charcoal`/`muted`/`running`). **Shell nuova (#291)**: taglia `xs` (`p-1`) per barre compatte (AppStatusBar). |

> **Pendente (issue shell):** `EditorialModalShell` e `useFocusTrap` sono ancora usati dai pannelli shell (`LibraryPanel`, `ProjectPanel`, `WorkspaceHome`, `TranslationsArea`, `DashboardSidebar`) e dal popover badge costi della sidebar. Verranno rimossi quando la shell sinistra migrerà (`react-resizable-panels` + Radix Collapsible).

---

## Boundary prodotto: App / Workspace / Pipeline

Glossa 2.0 separa tre livelli:

| Livello | Dove si configura | Cosa contiene |
|---|---|---|
| App | `SettingsModal` | Provider/API key, Ollama, segmentazione default, layout, backup/pricing |
| Workspace traduzioni | `WorkspaceHome` | Progetti di traduzione, modello embedding, extractor Phrase Memory, memoria condivisa |
| Pipeline/progetto | `ConfigDrawer` | Lingue, persona, stage, prompt, glossario assegnato, toggle/search Phrase Memory |

Il workspace attuale è specifico per l'area **Traduzioni**. Biblioteca e Trascrizioni sono future macro-aree separate; non devono condividere implicitamente la Phrase Memory delle traduzioni.

### Shell UI — Layout Progetto

Layout a tre colonne (#291) — `ShellNext` con `react-resizable-panels`:
- **Colonna sinistra (`ProjectRailNext`)**: Rail operativo con nav inline (Run/Pipeline/Document) + selettore pipeline + pulsante Esegui. Collasso riduce a icone. Larghezze (default 240px, collassato 64px, min 180px, max 320px) e stato collapse sincronizzati con `uiStore.projectSidebarWidth` e `useUiStore.projectContextCollapsed`.
- **Colonna centro**: Vista documento (`DocumentView`) — barra navigazione fissa in alto (h-20, due righe sinistra + frecce/contatore destra), due pannelli bianchi a filo (Originale/Candidata).
- **Colonna destra (`ProjectInspectorNext`)**: Pannello collapsabile con schede Approfondimenti (index/search/stats/coherence/glossary) e Frammento. Aperto quando `showDocumentDrawer` o `showChunkDrawer`. Larghezze (default 430px, min 300px, max 620px, collassato 56px) sincronizzate con `uiStore.projectFlyoutWidth`.

`uiStore.activeProjectPanel` (`run|pipeline|document|insight|chunk`) è la source-of-truth del rail. I setter drawer (`setShowDocumentDrawer`/`setShowChunkDrawer`/`setShowConfigDrawer`) sincronizzano panel e aperture flyout; i flag `show*` restano mutuamente esclusivi. `insight`/`chunk` non sono persistiti come pannello attivo (clamp a `run`).

**Dashboard:** schermata workspace-home con `PipelineSidebar` in modo dashboard + `WorkspaceHome` (componenti pre-#291; migrazione alla nuova shell rinviata a issue separata). È l'unico contesto in cui `PipelineSidebar` è ancora montato.

#### Vista Documento

`DocumentView` espone due pannelli **a filo** (flush) con layout interno:
- **Barra navigazione** (altezza fissa `h-20`, allineata alle testate dei pannelli laterali):
  - Colonna sinistra a due righe: indicatori di stato stadi del chunk corrente (riga 1), minimap pallini frammenti (riga 2).
  - Colonna destra: frecce prev/next + contatore m/n centrati.
- **Pannello Originale/Candidata**:
  - Header con titolo + separatore.
  - `MarkdownEditor` con `flatToolbar={true}` (barra tools a filo, no arrotondamento/ombra) e `menuOpen` controllato da pulsante nell'header pagina.
  - Menu testo unico a scomparsa (modalità scrittura/anteprima/dividi, dimensione, formattazione markdown, copia) aperto da pulsante nell'header pagina, in fila con i controlli gestione pagina (cerca, blocca, modifica sorgente, stadi, confronto).
- **Controlli vista documento** (fuoco, scorrimento agganciato): spostati in `AppStatusBar` in basso, non più nella barra alto.
- **Confronto stadi**: pulsante auto-attivante — porta il focus a sola-traduzione e accende il confronto. Mostra il precedente stage del chunk corrente a fianco della traduzione finale.

Props nuove su `MarkdownEditor`:
- `flatToolbar?: boolean` — toolbar a filo (no arrotondamento, coerente con pannelli flush).
- `menuOpen?: boolean`, `onMenuOpenChange?: (open: boolean) => void`, `copyText?: string` — menu controllato da esterno (header pagina).

---

## Pipeline di traduzione (flusso end-to-end)

```
User → "Run Pipeline" (PipelineActions.tsx)
  ↓
usePipeline.runPipeline()
  ↓
1. preflightPipeline() → Tauri: preflight_pipeline()
   Verifica API key + model reachability per ogni (provider, model) usato
  ↓
2. saveFullState() → DB persist
  ↓
3. computeBlobs() → Tauri: compute_blobs()
   Ritorna BlobAssignment[] — ogni chunk → blob con reference_chunk_ids
  ↓
4. FOR EACH chunk:
   a) setBlobAssignments() in chunksStore
   b) FOR EACH stage attivo:
      - assembleBlobContext(chunks, chunkId) → XML reference chunks
      - runStageStream(text, stage, config, prevResult, streamId)
      → Tauri: run_stage_stream()
      → provider.call() → HTTP stream
      → eventi stream-token → appendChunkStageContent() (batched RAF)
   c) judge() → updateChunkJudge()
      → se judgeRefineLoop && rating < 'good': runRefineLoopForChunk()
         → runStage(refineStage, auditContext=formattedIssues) → updateChunkDraft()
         → judge() → updateChunkJudge() — ripete max judgeRefineLoopMaxIter (default 2)
   d) coherence() se abilitato → updateChunkCoherence()
  ↓
5. runStatus = 'completed', saveFullState()
```

### DeepL Hybrid — bypass preflight

Il provider `deepl` bypassa il preflight LLM e `llmService.runStage()`. In `usePipeline.ts → executePipelineForChunk`, il branch `provider === 'deepl'` chiama `deeplService.runDeeplStage()` → Tauri `run_deepl_stage` → HTTP POST `/v2/translate` verso l'API DeepL.

---

## Struttura del prompt (INVARIANTE — non modificare l'ordine)

```
BLOCK 1 — statico, CACHEABLE
  persona + regole strutturali + glossario
  (identico per tutti i chunk del run → cache hit garantito)

BLOCK 2 — blob context, CACHEABLE
  <chunk id="...">testo sorgente chunk N</chunk> ...
  (identico per tutti i chunk nello stesso blob → cache hit per blob)

BLOCK 3 — stage instructions, NON CACHEABLE
  prompt stage-specifico + chunk da tradurre + previous_result
  (varia per stage — è il blocco più piccolo)
```

**Perché questo ordine:** Anthropic (breakpoint espliciti), OpenAI, Gemini (prefix caching automatico) cacheano il prefisso comune più lungo. Qualsiasi inversione spezza il caching e moltiplica i costi su documenti lunghi.

---

## Stage — regole di isolamento

| Stage | Testo primario | Blob sorgente | previous_result | Blob traduzioni |
|---|---|---|---|---|
| Translation | chunk sorgente | ✅ | ❌ | ❌ |
| Refine | chunk sorgente | ✅ | ✅ output translation | ❌ | `audit_context` (opzionale) — findings del judge precedente, iniettato nel user turn |
| Format | output stage prec. | ❌ **cieco** | ❌ | ❌ |
| Judge | sorgente + traduzione | ❌ | ❌ | ❌ |
| Coherence Audit | — | ❌ | ❌ | ✅ blob traduzioni |

**Format è volutamente cieco:** non vede sorgente né blob. Previene retraduzione.
**Coherence usa blob di traduzioni** (non sorgente): confronta coerenza terminologica tra chunk già tradotti.

---

## Sistema blob

**Algoritmo** (`src-tauri/src/llm/blobs.rs`):
- Se doc intero < 70% budget token → **blob globale unico** (max cache hit + visibilità globale)
- Altrimenti → **finestre locali sovrapposte** (window = 60% budget, overlap configurabile)
- Chunk di bordo condivisi tra finestre adiacenti → coerenza sui confini

**Struttura BlobAssignment:**
```typescript
{
  chunk_id: string;
  blob_id: string;
  position: number;
  reference_chunk_ids: string[];   // chunks da includere nel blob context
}
```

**Assemblaggio** (`src/hooks/usePipeline.ts`, `assembleBlobContext()`):
- Legge `blobReferenceChunkIds` del chunk corrente
- Serializza testo sorgente come `<chunk id="...">text</chunk>`
- Diventa BLOCK 2 nel prompt

---

## Streaming e cancellazione

```
Frontend: llmService.runStageStream(..., streamId)
  ↓
Tauri: run_stage_stream() → StreamRegistry.register(streamId, cancel_token)
  ↓
tokio::select! {
  biased;                              // ← biased = cancel check PRIMA di HTTP
  _ = cancel.notify.notified() => Err(STREAM_CANCELLED_ERROR)
  result = provider.call() => result
}
  ↓
stream_response() → app.emit("stream-token", { streamId, token, done, usage })
  ↓
Frontend listener → appendChunkStageContent() → buffer RAF
  ↓
flushPendingTokenBatch() → un solo setState per frame (O(1) chunk update)
```

**Cancel path:** `llmService.cancelStream(streamId)` → `cancel_stream` Tauri command → `StreamRegistry` lookup → `cancel.notify.notify()` → `tokio::select!` sveglia → HTTP chiuso → frontend sopprime toast se `isStreamCancelledError()`.

---

## Backend Rust — moduli critici

| File | Responsabilità |
|---|---|
| `src-tauri/src/lib.rs` | Entry point Tauri, registrazione comandi, StreamRegistry state |
| `src-tauri/src/llm/pipeline.rs` | Comandi Tauri: run_stage, run_stage_stream, judge_translation, run_coherence_for_chunk, preflight_pipeline, compute_blobs, extract_phrase_memory_pairs, cancel_stream |
| `src-tauri/src/llm/blobs.rs` | Algoritmo assegnazione blob (globale vs finestre) |
| `src-tauri/src/llm/prompts.rs` | Costruzione prompt 3-block, glossario, markdown rules, persona; `audit_context` iniettato nel user turn dei refine stage (cache-safe) |
| `src-tauri/src/llm/provider.rs` | Trait LlmProvider, struct LlmRequest (`json_schema_strict: bool` per judge vs json_object per altri) |
| `src-tauri/src/llm/providers/` | Anthropic (cache breakpoint espliciti), OpenAI (prefix), Gemini (cacheControl + thinking), DeepSeek (reasoning), Ollama (locale) |
| `src-tauri/src/llm/stream.rs` | HTTP event stream reader, StreamGuard RAII |
| `src-tauri/src/llm/custom_profiles.rs` | CRUD profili endpoint custom su `custom_providers` (rusqlite diretto); comandi: list_custom_provider_profiles, save_custom_provider_profile, delete_custom_provider_profile, test_custom_provider_connection. resolve_provider() in pipeline.rs usa questo modulo per istanziare OpenAiCompatibleProvider::custom_endpoint(base_url) al runtime |
| `src-tauri/src/deepl/` | Client HTTP DeepL con comandi Tauri: run_deepl_stage, get_deepl_languages, list_deepl_glossaries, create_deepl_glossary, delete_deepl_glossary |
| `src-tauri/src/keystore.rs` | OS credential store per API key; chiave custom: `custom:<profile_id>`; helper sync save_api_key_sync/delete_api_key_sync per operazioni sincrone nei comandi |
| `src-tauri/src/db.rs` | execute_transaction wrapper SQLite |
| `src-tauri/src/documents.rs` | Extract/export DOCX, PDF |

---

## Phrase Memory

**Configurazione:**
- Workspace: `memoryExtractorProvider`, `memoryExtractorModel`, `memoryExtractorPrompt`; prompt templates con context `memory`.
- Pipeline: `usePhraseMemory`, `autoSearchPhraseMemory`, `phraseMemorySimilarityThreshold`, `phraseMemoryMaxResults`.

**Salvataggio memoria:**
```
Chunk originale + draft/traduzione finale
  ↓
phraseMemoryService.savePhrasePairs()
  ↓
Tauri: extract_phrase_memory_pairs(provider, model, prompt, sourceText, targetText, languages)
  ↓
LLM JSON mode → { pairs: [{ sourcePhrase, targetPhrase, confidence }] }
  ↓
Validazione verbatim frontend + backend su source e target
  ↓
Embedding solo su sourcePhrase
  ↓
vec_save_locked_phrases(..., confidence)
```

Non esiste fallback locale: se extractor, JSON parsing o validazione falliscono, il chunk non salva coppie. Le coppie vecchie e i preset vengono purgati dal bump schema perché il formato precedente non è compatibile.

**Ricerca memoria:**
- Auto-search parte solo se `usePhraseMemory` è attivo e `autoSearchPhraseMemory !== false`.
- Il tab Memory può sempre lanciare refresh manuale per il chunk corrente quando la memoria è abilitata.
- La query embedding usa solo il testo sorgente del chunk; i match selezionati sono gli unici iniettati nel prompt di run/rerun.

---

## Schema DB (SQLite)

```
projects
  id, workspace_id FK, name, source_language, target_language, view_mode
  source_display_text, source_processing_text, source_footnotes JSON
  created_at, updated_at

workspaces
  id, name, description, embedding_model, created_at
  memory_extractor_provider, memory_extractor_model, memory_extractor_prompt
  active_workspace_id vive in app_settings

pipelines  ← multi-pipeline per progetto (feat/multi-pipeline)
  id, project_id FK, name
  source_language, target_language, pipeline_mode
  stages JSON[], judge_*, coherence_prompt
  use_chunking, words_per_chunk
  source_display_text, source_processing_text, source_footnotes
  persona, custom_source_language, custom_target_language
  blob_budget_tokens, blob_overlap
  review_provider_options JSON
  use_phrase_memory, auto_search_phrase_memory
  phrase_memory_similarity_threshold, phrase_memory_max_results
  run_status ('idle'|'running'|'completed'|'interrupted')
  last_run_config JSON (fingerprint per resume)
  created_at, updated_at

translations  ← chunks
  id, project_id FK, pipeline_id FK, position
  original_text, final_translation
  source_display_text, source_processing_text
  chunk_status ('ready'|'processing'|'completed'|'preview'|'error')
  stage_results JSON (Record<stageId, PipelineResult>)
  judge_status, judge_rating, judge_issues JSON
  translation_locked, coherence_result JSON
  footnotes JSON[], blob_id, blob_order, blob_reference_chunk_ids JSON
  created_at

glossaries / glossary_entries / project_glossaries
  CRUD standard, many-to-many project↔glossary
  workspace_id TEXT NULL → riferimento logico a workspaces(id), non enforced da SQLite (ALTER TABLE non supporta ADD FOREIGN KEY); NULL = legacy globale (visibile ovunque)
  Nuovi glossari creati dalla Libreria ereditano workspace_id del workspace attivo.

prompt_templates
  id, name, prompt, context ('stage'|'audit'|'persona'|'memory')
  workflow ('translation'|'transcription') — filtro workflow in PromptTemplatesTab
  default_model, default_provider

operation_logs
  id, project_id FK, at TIMESTAMP
  level, scope, message, detail
  chunk_id, stage_id, meta JSON, phase, duration_ms
  idx: (project_id, at)

annotations
  id TEXT PK, chunk_id, pipeline_id FK (ON DELETE CASCADE)
  type TEXT ('comment'|'doubt'|'problem'|'approved'), content TEXT
  anchor_text TEXT nullable, sequence INT, created_at
  idx: (pipeline_id, chunk_id)

app_settings
  key PK, value
  — include 'schema_version' (int) usato da backupService per compatibilità backup

phrase_memory
  id, workspace_id FK, source_phrase, target_phrase
  source_language, target_language, author, work, domain, tags, notes
  chunk_id, project_id, confidence, embedding, created_at

source_phrase_embeddings
  id, project_id, chunk_id, source_phrase, embedding, created_at

custom_providers
  id TEXT PK, name TEXT, base_url TEXT, requires_api_key INTEGER (0|1)
  created_at TEXT (ISO datetime)
  — gestita da src-tauri/src/llm/custom_profiles.rs via rusqlite diretto
  — API key salvata nel keystore con chiave "custom:<id>", non in questa tabella
```

**Persistito vs in-memory:**
- ✅ Persistito: source, config, stage_results, translations, run_status, operation_logs
- ✅ Persistito workspace: progetti, configurazione extractor Phrase Memory, memoria frasi
- ❌ Solo in-memory: token stream real-time (ricostruito da stage_results su resume)

---

## Performance frontend

- **RAF token batching**: `appendChunkStageContent` accoda in buffer, flush unico per `requestAnimationFrame`. Non bypassare con setState diretti nei percorsi streaming.
- **O(1) chunk index**: `Map<chunkId, index>` in chunksStore si ricostruisce solo quando `chunks.length` cambia. Aggiornamenti slot-by-slot usano `updateSingleChunk`.

---

## Provider runtime options (per-stage)

```typescript
{
  ollama?: { temperature, topP, think, numCtx, numPredict, keepAlive }
  openai?: { promptCacheKey, promptCacheRetention, reasoningEffort }
  deepseek?: { reasoningEffort }
  gemini?: { explicitCaching, cacheTtlSeconds, thinkingBudget }
}
```

**Cache hit su OpenAI Responses API**: la Responses API non supporta prefix caching cross-call indipendenti senza `previous_response_id`. Per cache hit reali su gpt-5.x, considerare di passare al path Chat Completions (già usato da DeepSeek) con `prompt_cache_key` esplicito.

---

## Refactor pendenti noti

| Area | Descrizione | Priorità |
|---|---|---|
| `src-tauri/src/llm/providers/anthropic.rs` | Reasoning non supportato: nessun campo `thinking` nella request, parsing assume `content[0]` sia testo (corretto senza thinking). Per abilitare: aggiungere `"thinking": {"type":"enabled","budget_tokens":N}` + filtrare blocchi `"type":"thinking"` nel parsing. | alta |
| `src-tauri/src/llm/providers/gemini.rs` | Reasoning parziale: `thinkingConfig.thinkingBudget` inviato se configurato, ma parsing usa `parts[0]` — se thinking attivo, `parts[0]` è il blocco thinking (campo `thought:true`), non il testo finale. Fix: cercare il primo part senza `thought:true`. | alta |
| OpenAI gpt-5.x — prompt caching | Bug lato OpenAI: prefix caching non funziona in modo affidabile su tutta la famiglia gpt-5 (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.4). Su gpt-4o funziona al 100%. Thread community aperto da ott 2025, non risolto a gen 2026. Da monitorare; non fixabile lato Glossa. Ref: [community.openai.com/t/1359574](https://community.openai.com/t/caching-is-borked-for-gpt-5-models/1359574) | monitoraggio |

---

---

## Note di Sicurezza (modello di minaccia: desktop single-user)

### Cache in-memoria delle API key

`keystore.rs` mantiene una `HashMap<String, String>` statica (`API_KEY_CACHE`) che contiene le chiavi API in chiaro per la durata del processo, per evitare accessi ripetuti al keyring di sistema. Le chiavi rimangono nella heap del processo fino alla chiusura dell'app.

**Implicazione**: un attaccante con accesso locale al sistema (malware, processo con privilegi equivalenti) può recuperare le chiavi da un memory dump del processo Glossa. Questo è accettabile nel modello di minaccia dichiarato (desktop single-user, nessun attaccante remoto), ma il comportamento va tenuto presente: non estendere la cache a token o credenziali con vita breve senza rivalutare il rischio.

### Logging in release e RUST_LOG

In release (`!debug_assertions`) il livello di log predefinito è `Info`. `RUST_LOG` viene letto a runtime (`lib.rs`) e può sovrascrivere questo default.

**Implicazione**: impostare `RUST_LOG=debug` o `RUST_LOG=trace` su una build release espone log verbosi, inclusi dettagli delle richieste LLM (provider, modello, timing). Non vengono loggati contenuti di prompt o risposte, ma provider e metadati sì. In un contesto di supporto tecnico, chiedere sempre di verificare che `RUST_LOG` non sia impostato prima di condividere i log.

*Ultimo aggiornamento: 2026-06-11 — branch security/issue-254-hardening*
