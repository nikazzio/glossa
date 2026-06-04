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
| `stores/pipelineStore.ts` | config pipeline, inputText, sourceFootnotes, runStatus, mode | Config immutabile per run |
| `stores/chunksStore.ts` | chunks[], isProcessing, cancelRequested, activeStreamId | RAF batching per token stream; Map O(1) per chunk lookup |
| `stores/projectStore.ts` | projects[], currentProjectId, pipelines[], activePipelineId | Multi-pipeline per progetto |
| `stores/workspaceStore.ts` | workspaces[], activeWorkspace, loading/isLoaded | Boundary traduzioni: switch/create/update workspace, un workspace attivo per volta |
| `stores/phraseMemoryStore.ts` | matchesByChunk, enabledMatchIds, jobStatus, searchStatus | Match Phrase Memory per chunk; match trovati read-only finché non selezionati |
| `stores/operationLogStore.ts` | entries[], currentProjectId | Max 2000 in-memory, resto in DB |
| `stores/uiStore.ts` | selectedChunkId, pipelineMode, highlightsEnabled, highlightColors, searchQuery, ollamaStatus | UI-only state. highlightsEnabled + highlightColors persisted; searchQuery transient |
| `stores/libraryStore.ts` | glossaries[], dictionaries[], selectedDictionary | — |
| `stores/promptTemplateStore.ts` | templates[], selectedTemplate | — |

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
| `services/projectService.ts` | CRUD project, import DOCX/PDF, export |
| `services/dbService.ts` | SQLite wrapper: execute, select, executeTransaction, initDatabase, ensureColumn |

---

## Componenti UI critici

| Componente | Responsabilità |
|---|---|
| `components/document/DocumentView.tsx` | Layout principale — chunk grid, sidebar, toggle source/translation |
| `components/pipeline/ProductionStream.tsx` | Riga chunk — editor sorgente, risultati stage, judge issues, draft editor |
| `components/pipeline/PipelineActions.tsx` | Run / Cancel / Audit buttons |
| `components/pipeline/StageCard.tsx` | Visualizza singolo stage (token, retry info) |
| `components/document/ConfigDrawer.tsx` | Drawer config pipeline: mode, lingue, stage, persona, glossary |
| `components/layout/Header.tsx` | Project/pipeline selector |
| `components/workspace/WorkspaceHome.tsx` | Dashboard workspace: switch/create/config workspace, progetti, preset Phrase Memory workspace |
| `components/workspace/WorkspaceWizard.tsx` | Primo avvio: crea il primo workspace reale |

---

## Boundary prodotto: App / Workspace / Pipeline

Glossa 2.0 separa tre livelli:

| Livello | Dove si configura | Cosa contiene |
|---|---|---|
| App | `SettingsModal` | Provider/API key, Ollama, segmentazione default, layout, backup/pricing |
| Workspace traduzioni | `WorkspaceHome` | Progetti di traduzione, modello embedding, preset Phrase Memory, memoria condivisa |
| Pipeline/progetto | `ConfigDrawer` | Lingue, persona, stage, prompt, glossario assegnato, toggle Phrase Memory |

Il workspace attuale è specifico per l'area **Traduzioni**. Biblioteca e Trascrizioni sono future macro-aree separate; non devono condividere implicitamente la Phrase Memory delle traduzioni.

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
   d) coherence() se abilitato → updateChunkCoherence()
  ↓
5. runStatus = 'completed', saveFullState()
```

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
| Refine | chunk sorgente | ✅ | ✅ output translation | ❌ |
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
| `src-tauri/src/llm/pipeline.rs` | Comandi Tauri: run_stage, run_stage_stream, judge_translation, run_coherence_for_chunk, preflight_pipeline, compute_blobs, cancel_stream |
| `src-tauri/src/llm/blobs.rs` | Algoritmo assegnazione blob (globale vs finestre) |
| `src-tauri/src/llm/prompts.rs` | Costruzione prompt 3-block, glossario, markdown rules, persona |
| `src-tauri/src/llm/provider.rs` | Trait LlmProvider, struct LlmRequest |
| `src-tauri/src/llm/providers/` | Anthropic (cache breakpoint espliciti), OpenAI (prefix), Gemini (cacheControl + thinking), DeepSeek (reasoning), Ollama (locale) |
| `src-tauri/src/llm/stream.rs` | HTTP event stream reader, StreamGuard RAII |
| `src-tauri/src/keystore.rs` | OS credential store per API key |
| `src-tauri/src/db.rs` | execute_transaction wrapper SQLite |
| `src-tauri/src/documents.rs` | Extract/export DOCX, PDF |

---

## Schema DB (SQLite)

```
projects
  id, workspace_id FK, name, source_language, target_language, view_mode
  source_display_text, source_processing_text, source_footnotes JSON
  created_at, updated_at

workspaces
  id, name, description, embedding_model, created_at
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

prompt_templates
  id, name, prompt, context ('stage'|'audit'|'persona')
  default_model, default_provider

operation_logs
  id, project_id FK, at TIMESTAMP
  level, scope, message, detail
  chunk_id, stage_id, meta JSON, phase, duration_ms
  idx: (project_id, at)

app_settings
  key PK, value
  — include 'schema_version' (int) usato da backupService per compatibilità backup

phrase_memory
  id, workspace_id FK, source_phrase, target_phrase
  source_language, target_language, author, work, domain, tags, notes
  chunk_id, project_id, embedding, created_at

phrase_memory_presets
  id, workspace_id nullable, name, is_builtin, config JSON, created_at
  built-in globali + custom scoped al workspace

source_phrase_embeddings
  id, project_id, chunk_id, source_phrase, embedding, created_at
```

**Persistito vs in-memory:**
- ✅ Persistito: source, config, stage_results, translations, run_status, operation_logs
- ✅ Persistito workspace: progetti, preset Phrase Memory custom, memoria frasi
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
| `hooks/usePipeline.ts` | 3 blocchi blob assembler identici da estrarre in helper condiviso | bassa (cosmesi) |
| `services/phraseMemoryService.ts` → `savePhrasePairs()` | Zip silenzioso source↔target: se lo splitter produce lunghezze diverse, le frasi extra vengono scartate senza notifica all'utente. Da segnalare in UI o loggare nel dettaglio. | media |
| `src-tauri/src/llm/providers/anthropic.rs` | Supporto reasoning da rivedere (verifica integrazione, parametri, formato risposta) | alta |
| `src-tauri/src/llm/providers/deepseek.rs` | Supporto reasoning da rivedere (verifica integrazione, parametri, formato risposta) | alta |
| `src-tauri/src/llm/providers/gemini.rs` | Supporto reasoning da rivedere (verifica integrazione, parametri, formato risposta) | alta |
| OpenAI gpt-5.x — prompt caching | Bug lato OpenAI: prefix caching non funziona in modo affidabile su tutta la famiglia gpt-5 (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.4). Su gpt-4o funziona al 100%. Thread community aperto da ott 2025, non risolto a gen 2026. Da monitorare; non fixabile lato Glossa. Ref: [community.openai.com/t/1359574](https://community.openai.com/t/caching-is-borked-for-gpt-5-models/1359574) | monitoraggio |

---

*Ultimo aggiornamento: 2026-06-04 — branch feat/phrase-memory*
