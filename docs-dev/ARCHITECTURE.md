# Glossa — Architecture Reference (Claude-optimized)

> Aggiorna file ogni volta cambia flusso architetturale, store, comando Tauri, o schema DB.
> Non descrivere *cosa* fa codice (già nei nomi) — documenta *come si connette* e *perché* certi pattern esistono.

---

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Tailwind v4, Zustand, Vite |
| Backend | Rust, Tauri v2, tokio, reqwest |
| DB | SQLite via SQLx (WAL mode) |
| Test FE | Vitest + Testing Library; Playwright (2 smoke E2E Chromium) |
| Test BE | tokio-test, wiremock |

---

## Dev server (porta)

devUrl Tauri (`src-tauri/tauri.conf.json`) e porta Vite (`package.json` → `dev`) devono sempre puntare stessa porta: se divergono, webview naviga verso servizio diverso da atteso, mostra errore connessione generico invece errore chiaro.

- Porta default: `48123` (scelta non comune, evita collisione altri progetti locali su 3000/5173/ecc.)
- `--strictPort` su Vite: porta occupata → comando fallisce subito errore leggibile, no scivolamento silenzioso altra porta
- Override: `GLOSSA_DEV_PORT=9999 npm run tauri:dev` (PowerShell: `$env:GLOSSA_DEV_PORT=9999; npm run tauri:dev`) — variabile letta sia da Vite (`scripts/dev.mjs`) sia da Tauri (`scripts/tauri-dev.mjs`, inietta stesso valore in `devUrl` via `tauri dev --config`)
- Script Node (`scripts/dev.mjs`/`scripts/tauri-dev.mjs`), non bash: npm su Windows esegue gli script tramite cmd.exe, che non capisce `${VAR:-default}` né richiede bash disponibile
- Meccanismo esiste solo in sviluppo: build produzione (`npm run tauri:build`) carica `frontendDist` diretto, no dev server né porta coinvolti

---

## Strategia test

- `npm test` resta la copertura capillare e veloce della logica e dei componenti.
- `npm run test:e2e` esegue solo due smoke test Chromium: primo avvio/creazione workspace e creazione/apertura progetto. Il bridge locale viene simulato, quindi non avvia provider, import o export reali.
- La CI esegue gli smoke test su ogni PR e conserva tracce e schermate soltanto quando falliscono. Non serve ripetere l'intera suite manualmente dopo l'apertura della PR.

---

## Store Zustand

| File | Stato chiave | Note |
|---|---|---|
| `stores/pipelineStore.ts` | config pipeline, inputText, sourceFootnotes, runStatus, mode, provider | Config immutabile per run; mode: 'standard'\|'deepl-hybrid'; provider: 'openai'\|'anthropic'\|'gemini'\|'deepseek'\|'ollama'\|'deepl' |
| `stores/chunksStore.ts` | chunks[], isProcessing, cancelRequested, activeStreamId | RAF batching per token stream; Map O(1) per chunk lookup |
| `stores/projectStore.ts` | projects[], currentProjectId, pipelines[], activePipelineId | Multi-pipeline per progetto |
| `stores/workspaceStore.ts` | workspaces[], activeWorkspace, loading/isLoaded | Boundary traduzioni: switch/create/update workspace, un workspace attivo per volta |
| `stores/phraseMemoryStore.ts` | matchesByChunk, enabledMatchIds, jobStatus, searchStatus | Match Phrase Memory per chunk (Tab Riferimenti); match trovati read-only finché non selezionati, spunte preservate tra refresh per gli id che ricompaiono |
| `stores/phraseMemoryDraftStore.ts` | draftsByChunk (candidate estratte, non persistito su disco) | Bozza di revisione per-chunk (Tab Memoria): estrai→rivedi/modifica/aggiungi manuale→conferma; cambiare frammento non perde la bozza in sospeso |
| `stores/operationLogStore.ts` | entries[], currentProjectId | Max 2000 in-memory, resto in DB |
| `stores/annotationsStore.ts` | annotationsByChunkId Map<chunkId, Annotation[]> | CRUD annotations per chunk; load/add/update/delete con persistenza SQLite immediata |
| `stores/confirmStore.ts` | open, request, resolver | Coda di conferma Promise-based: una nuova richiesta chiude la precedente con `false`. |
| `stores/preflightStore.ts` | open, results, resolver | Dialog preflight Promise-based; restituisce se l'utente procede dopo controlli provider/modello. |
| `stores/pricingStore.ts` | overrides | Override input/output per modello persistiti in LocalStorage (`glossa-pricing-overrides`). |
| `stores/uiStore.ts` | selectedChunkId, highlightsEnabled, highlightColors, uiFont, discoveryResultsPerRow, searchQuery, activePanel, showInsightPanel, chunkRailTab, showConsoleDrawer, showSettings/Help/ConfigDrawer | UI-only state. highlightsEnabled + highlightColors + uiFont + `discoveryResultsPerRow` (3\|4) persisted (`glossa-ui-prefs` v17). activePanel enum sincronizzato coi boolean panel. `uiFont` ('jakarta'\|'geist'\|'inter'\|'plex') → `FontSync` (`App.tsx`) override runtime `--font-sans` su `:root`, come `HighlightColorSync` per colori. `showInsightPanel` (#296) sostituisce `showDocumentDrawer \|\| showChunkDrawer` come driver apertura `ProjectInspectorNext`. `chunkRailTab` (`ChunkRailTab = 'audit'\|'notes'\|'memory'\|'references'\|'promptPreview'`) seleziona scheda `ChunkInspectorPanel`, ora annidato in rail sinistra. `promptPreview` (dopo `references`) monta `ChunkPromptPreviewTab`, che con l'hook `useChunkPromptPreview` costruisce a comando (comando Tauri `preview_stage_prompt`) il messaggio letterale per una fase sul chunk corrente, senza contattare il provider. `showConsoleDrawer` apre/chiude drawer Operazioni sopra `AppStatusBar`. `chunkDrawerTab`/`showChunkDrawer` restano legacy per dashboard (pre-#291). |
| `stores/configStore.ts` | pipelineMode, pipelineTestChunkCount, ollamaStatus, ollamaModels, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPresetShort/Medium/Long, workMode | Config app. pipelineTestChunkCount, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPreset* persisted. ollamaStatus/Models transient. `workMode` (#296, `WorkMode = 'chunk'\|'all'`, default `'chunk'`) governa ramo `playFirst` di `PipelineSidebarRunSection`: `'chunk'` mostra § N + "Traduci chunk", `'all'` mostra Esegui tutto/Stop + progresso X/Y. Reset a `'chunk'` da `ConfigDrawer.handleResetAll`; letto da `useKeyboardShortcuts` per instradare `Ctrl+Enter`. |
| `stores/libraryStore.ts` | glossaries[], loadedForWorkspaceId, isLoaded, libraryScope | `libraryScope: 'workspace'\|'global'` (#213): `'workspace'` = dizionari del workspace da cui è aperta la Libreria, editabili; `'global'` = catalogo cross-workspace in sola lettura, con azione esplicita di copia nel workspace attivo. `setShowLibraryPanel(show, tab?, scope?)` riparte sempre da Dizionari se tab non specificato. In scope workspace non carica nulla prima che esista un workspace attivo; con id filtra solo quel workspace, senza id sfoglia tutti i workspace. |
| `stores/promptTemplateStore.ts` | templates[], selectedTemplate | — |
| `stores/customProviderStore.ts` | profiles: CustomProviderProfile[] | Lista profili endpoint custom; caricata da DB on demand (Settings + StageCard). Non persistita LocalStorage — source of truth SQLite. |

---

## Hook critici

| File | Responsabilità |
|---|---|
| `hooks/usePipeline.ts` | Wiring React sottile — inietta `t` (i18n) nel motore e espone `runPipeline`, `runSingleChunk`, `rerunChunkWithMemory`, `cancelPipeline`. Logica vera in `hooks/pipeline/engine.ts` (v. sotto). |
| `hooks/pipeline/engine.ts` | **Engine principale** — nessuna dipendenza React, riceve `t` come parametro. `executePipelineForChunk`, `runPipeline`, `runChunkExecution`, `ensureProvidersReady`, `cancelPipeline`. Pensato per essere richiamato anche da entry point non-React (es. bridge trascrizione→traduzione, #224). Il contesto blob è costruito dal helper condiviso `hooks/pipeline/blobContext.ts` e riusato anche dagli audit. |

> **INVARIANTE — non toccare senza motivo esplicito**: Ollama usa `runStageStream` (streaming). Tutti altri provider (OpenAI, Anthropic, Gemini, DeepSeek) usano `runStage` (non-streaming). Separazione intenzionale: cloud provider hanno timeout e gestione errori diversi. Non "uniformare" i due path.
| `hooks/useProjectAutosave.ts` | Autosave con debounce |
| `hooks/useChunkWatchdog.ts` | Timeout detection per chunk inattivi |

> **INVARIANTE — `utils/costEstimate.ts` (corretto 2026-07-02)**: `executePipelineForChunk` e `runCoherenceAudit` girano **una chiamata reale per chunk** (loop `for (const chunk of liveChunks)`), non unica chiamata su intero documento. `estimatePipelineCost` somma token contenuto su intero documento (corretto, contenuto non si duplica) ma moltiplica costo fisso prompt sistema per `chunks.length` — se cambia funzione, non tornare a "prompt pagato una volta sola", altrimenti preventivo torna sottostimare drasticamente documenti con molti chunk. Passata coerenza (`includeCoherence`) **esclusa di default**: azione separata dal pulsante "esegui", inclusa solo nel preventivo generale di `PipelineConfig` (badge pannello impostazioni pipeline), non nel badge accanto pulsante esecuzione in `PipelineSidebarRunSection`.

---

## Service layer (bridge Tauri)

| File | Funzione |
|---|---|
| `services/llmService.ts` | runStage, runStageStream, judgeTranslation, runCoherence, preflightPipeline, computeBlobs. Listener eventi: `stream-token`, `chunk-prompt`, `stream-alive`. |
| `services/pipelineService.ts` | CRUD pipeline, saveChunkCheckpoint, setPipelineRunState, computeBlobs, loadTranslations, restoreTranslations |
| `services/projectService.ts` | CRUD project, persistenza sorgente (path, metadata) |
| `services/fileService.ts` | Import DOCX/PDF (estrazione testo), export bilingue/monolingua |
| `services/dbService.ts` | Apre la connessione (pragma WAL/synchronous/foreign_keys) e legge via plugin SQL; tutte le write runtime passano a `execute_transaction` Rust. Non possiede più lo schema (v. `src-tauri/migrations/`, #211). |
| `services/customProviderService.ts` | Tauri invoke wrapper per comandi custom provider (list, save, delete, test_connection) |
| `services/iiifProviderService.ts` | Legge il registry IIIF e invoca `discover_iiif`: input provider-specifico → esito normalizzato `manifest`/`results`/`not_found`. La ricerca paginata passa sempre il numero pagina al backend. |
| `schemas/externalData.ts` | Schemi Zod ai confini esterni: backup completo prima dell'import, oggetto JSON per opzioni avanzate, profilo provider con nome e URL validi. |

---

## Componenti UI critici

| Componente | Responsabilità |
|---|---|
| `components/document/DocumentView.tsx` | Layout principale documento con barra navigazione fissa in alto (`h-20`, allineata testate pannelli laterali): sinistra due righe (indicatori stadi frammento + minimap pallini frammenti), destra (frecce prev/next + contatore m/n). Due pannelli bianchi a filo (Originale/Candidata) con header titolo + separatore; controlli testo in menu unico a scomparsa (non barra sempre visibile) aperto da pulsante header pagina. |
| `components/layout/shell-next/ShellNext.tsx` | Layout tre colonne shell nuova (#291): `ProjectRailNext` sinistra · documento centro · `ProjectInspectorNext` destra (solo Approfondimenti, #296). `inspectorOpen` guidato da `showInsightPanel` (era `showDocumentDrawer \|\| showChunkDrawer`). Collasso e larghezze persistiti su uiStore. |
| `components/layout/shell-next/ProjectRailNext.tsx` | Redesign #296. Header fisso `h-20`: collassa (ChevronLeft/Right) + Libreria. Corpo scrollabile: selezione/config pipeline inline + comandi run (`PipelineSidebarRunSection`) + `ChunkInspectorPanel` annidato (Audit/Note/Memoria/Riferimenti). Bottom fisso `h-12`: Workspace / Impostazioni / Importa / Esporta. Collassata: azione primaria per `workMode` + 4 icone bottom in colonna; in cima mostra il segno persistente del workspace, non il marchio Glossa. Non riceve più `onDryRun`/`onRunAuditOnly`; riceve `onReauditChunk`. `PipelineSidebarPipelinesSection`/`PipelineSidebarDocumentSection` (sotto-componenti dedicati previsti per questo, mai collegati) rimossi come dead code nella pulizia #324 — il contenuto vive direttamente qui. |
| `components/layout/shell-next/ProjectInspectorNext.tsx` | Pannello destro collassabile: solo `DocumentInsightTabs` (schede Approfondimenti index/search/stats/glossary/coherence). Tab Frammento rimossa (#296) — frammento vive ora in `ChunkInspectorPanel` dentro rail sinistra. Header unico fisso `h-20` (icona + collassa con `PanelRightClose`/`PanelRightOpen`), speculare a `ProjectRailNext`; `DocumentInsightTabs` non ha più header/close proprio (rimosso doppio header, #296). |
| `components/layout/PipelineSidebarSections/PipelineSidebarRunSection.tsx` | Azione primaria run/cancel e controlli work-mode della pipeline; entry point reale dei comandi di esecuzione. |
| `components/pipeline/StageCard.tsx` | Visualizza singolo stage (token, retry info) |
| `components/document/ConfigDrawer.tsx` | Finestra (Radix `Dialog`) config pipeline: mode, lingue, stage, persona, glossary. Variante drawer laterale legacy (`variant='drawer'`) rimossa: nessun chiamante la usava più dopo migrazione shell nuova (#291), restava solo `variant='modal'`. |
| `components/layout/Header.tsx` | Solo breadcrumb navigazione (Glossa // workspace // progetto); non contiene più pulsanti azione |
| `components/layout/AppStatusBar.tsx` | Barra stato basso. Shell nuova (#291), ridisegnata #296: sinistra solo pannello attivo (rimosso breadcrumb progetto/pipeline); centro `ChunkCenterStats` (§ N · X w · icona qualità reale via `qualityLabelKey` · stato, con tooltip su parole e qualità); destra console toggle (`Terminal`) + separatore + controlli vista documento + indicatore salvataggio. |
| `components/layout/ConsoleDrawer` (in `AppStatusBar.tsx`) | Drawer Operazioni (`OperationsTab` embedded) aperto da `showConsoleDrawer`, posizionato `absolute bottom-full` sopra status bar, altezza `h-64`. #296. |
| `components/dashboard/AppDashboard.tsx` | Dashboard app-level (home dell'applicazione): sinistra `SourceDiscoveryPanel` per discovery IIIF; destra riquadri panoramica (progetti totali, frammenti completati/totali, frasi in memoria, termini glossario), attenzione, riprendi e attività pipeline. La ricerca vive qui, non in Biblioteca. |
| `components/dashboard/SourceDiscoveryPanel.tsx` | Ricerca dashboard: provider pronti, input, risultati normalizzati con miniatura/metadati, una sola scheda espansa, paginazione e scelta persistita 3/4 schede per riga. Non crea fonti né scarica asset. |
| `components/workspace/LibraryCatalogArea.tsx` | Catalogo personale delle fonti 2.0. Nell'incremento #215 è volutamente vuoto: persistenza, collegamenti workspace, streaming/download/cache sono #216+. |
| `components/workspace/WorkspaceOverview.tsx` | Pagina del workspace attivo (vista `'workspace'`): identità/descrizione, azioni icon-only (Libreria, Configura, Elimina), lista progetti **solo di questo workspace** (`loadProjects` scoped su `activeWorkspace.id`) identificata dal segno scelto, `+` nuovo progetto |
| `components/workspace/TranslationsArea.tsx` | Area Traduzioni (vista `'translations'`): TUTTI i progetti di TUTTI i workspace (`listAllProjects`, cross-workspace, non scoped), ognuno con icona piccola del tipo Traduzione, segno grande e nome del proprio workspace; click apre il progetto via `projectStore.openProjectInWorkspace` (attiva prima il workspace del progetto se diverso da quello corrente). Vista distinta da `WorkspaceOverview` (che mostra solo il workspace attivo) — corretto 2026-07-18 dopo bug segnalato (l'area sembrava "incollata" all'ultimo workspace visitato perché in realtà era scoped come `WorkspaceOverview`, non una vista realmente separata) |
| `stores/projectStore.ts` → `openProjectInWorkspace(id, workspaceId)` | Azione condivisa "apri progetto da un workspace qualsiasi": se `workspaceId` è diverso dal workspace attivo, chiude il progetto corrente, attiva quel workspace, ricarica i suoi progetti, poi apre. Throw esplicito se il workspace non esiste (mai fallimento silenzioso). Usata da `AppDashboard` (Riprendi, Richiede attenzione) e `TranslationsArea` — introdotta 2026-07-18 per non triplicare la stessa logica |
| `components/workspace/CreateWorkspaceDialog.tsx` | Dialog creazione workspace condiviso (rail + dashboard) |
| `components/projects/CreateProjectDialog.tsx` | Dialog creazione progetto condiviso (TranslationsArea + WorkspaceOverview) |
| `components/workspace/WorkspaceWizard.tsx` | Primo avvio: crea primo workspace reale |
| `components/document/AnnotationContextMenu.tsx` | Menu contestuale (clic destro su testo traduzione) → «Aggiungi annotazione» con anchor pre-compilato |
| `utils/annotationMarkdown.ts` | `composeAnnotatedMarkdown()` — compone vista GFM con marcatori `[^a1]` e definizioni piè pagina; non modifica draft salvato |

### Primitive overlay (Radix UI)

Finestre modali, tooltip, menu poggiano su **Radix UI** (`@radix-ui/react-dialog`, `react-alert-dialog`, `react-tooltip`, `react-dropdown-menu`). Comportamento (focus trap, Escape, scroll-lock, portale, ARIA, navigazione tastiera) delegato a libreria — non si reimplementa a mano.

| Primitiva (`components/ui/`) | Uso |
|---|---|
| `Dialog` | Finestra modale generica (chrome editoriale, X alto destra). z-index `z-[200]`. |
| `AlertDialog` | Conferme (azione + annulla); `tone="danger"` per azioni distruttive. |
| `DialogConfirmButton` / `DialogCancelButton` | Pulsanti footer uniformi (conferma inchiostro, annulla bordo). |
| `Tooltip` | Tooltip editoriale su Radix (Provider interno, `z-[210]`). |
| `Menu` | Menu contestuale/tendina su Radix DropdownMenu (ancora virtuale `anchorRect`). |
| `IconButton` | Pulsante icona con tipp. CVA: size (`xs`/`sm`/`md`/`lg`), tone (`default`/`accent`/`success`/`charcoal`/`muted`/`running`). **Shell nuova (#291)**: taglia `xs` (`p-1`) per barre compatte (AppStatusBar). |

> **Stato 2026-07-03:** `EditorialModalShell` e `useFocusTrap` rimossi. `LibraryPanel`, `ProjectPanel`, `AppDashboard` (ex `WorkspaceHome`), `TranslationsArea` e `DashboardSidebar` usano `Dialog`; conferme usano `AlertDialog`.

> **Audit modali pipeline (2026-07-03):** `ImportPreviewDialog` e `ExportDialog`/`StageTraceDialog`/`ExtractTermDialog`/`PreflightDialog`/`ConfirmDialog` tutti allineati chrome `Dialog`/`AlertDialog` (stesso overlay `bg-editorial-ink/30 backdrop-blur-sm`, stesso `max-h-[90vh]`). `ImportPreviewDialog` costruisce proprio `RadixDialog.Content` invece usare wrapper `Dialog` perché header multi-riga (nome file, toggle vista, statistiche, preset, lingue/modello) non entra negli slot generici wrapper — classi overlay/contenuto tenute manualmente identiche a `Dialog` per coerenza visiva. Stile interno modali evita card arrotondate: sezioni piatte con `border-y`, barre laterali tonali e prompt alta leggibilità.

Popover badge costi sidebar (`SidebarCostPanel` in `PipelineSidebarRunSection.tsx`) è pannello autonomo via `createPortal`, non basato su `EditorialModalShell` né `Dialog`: resta popover non bloccante perché dettaglio contestuale al passaggio/focus, non finestra di lavoro.

---

## Architettura di prodotto 2.0

La destinazione architetturale di prodotto è definita in
[`PRODUCT_ARCHITECTURE_2_0.md`](PRODUCT_ARCHITECTURE_2_0.md).

Decisione principale: Biblioteca, Trascrizioni, Traduzioni e Analisi sono
cataloghi globali; i workspace sono contesti operativi trasversali che mostrano
gli stessi oggetti canonici senza copiarli. La shell descritta sotto documenta
lo stato 1.x da cui parte la migrazione incrementale della #180.

## Boundary prodotto corrente: App / Workspace / Pipeline

Glossa 2.0 separa tre livelli:

| Livello | Dove si configura | Cosa contiene |
|---|---|---|
| App | `SettingsModal` | Provider/API key, Ollama, segmentazione default, layout, backup/pricing |
| Workspace traduzioni | `WorkspaceSettingsModal` (da `WorkspaceOverview`, icona Configura) | Progetti traduzione, modello embedding, extractor Phrase Memory, memoria condivisa |
| Pipeline/progetto | `ConfigDrawer` | Lingue, persona, stage, prompt, glossario assegnato, toggle/search Phrase Memory |

Il workspace corrente è implementato soprattutto per **Traduzioni**. Nel
modello 2.0 Biblioteca e Trascrizioni diventano aree globali filtrabili per
workspace; le regole di condivisione di Phrase Memory e delle altre risorse
restano esplicite e non si deducono dalla sola navigazione.

### Shell UI — Layout Progetto

Layout tre colonne (#291, rail ridisegnata #296) — `ShellNext` con `react-resizable-panels`:
- **Colonna sinistra (`ProjectRailNext`)**: header fisso `h-20` (collassa + Libreria) · corpo scrollabile con selezione/config pipeline, comandi run (switch Chunk/Tutto + azione primaria icon-only, guidati da `configStore.workMode`) e `ChunkInspectorPanel` annidato (tab Audit/Note/Memoria/Riferimenti, scroll confinato al contenuto tab) · bottom fisso `h-12` (Workspace/Impostazioni/Importa/Esporta). Collassata: stesse 4 icone in colonna + azione primaria pipeline. Larghezze (default 240px, collassato 64px, min 180px, max 320px) e stato collapse sincronizzati con `uiStore.projectSidebarWidth` e `useUiStore.projectContextCollapsed`. Azione primaria (Traduci chunk / Esegui tutto) porta badge preventivo costi opzionale (`SidebarCostPanel`, visibile solo se `estimatePipelineCost` produce almeno uno stage con prezzo noto): in `workMode='chunk'` stima solo chunk selezionato, in `workMode='all'` intera pipeline (2026-07-02, era badge unico non distinto per scope).
- **Colonna centro**: Vista documento (`DocumentView`) — barra navigazione fissa in alto (h-24, indicatori stadi + minimap frammenti sinistra, token/costo frammento corrente destra); controlli frammento precedente/successivo spostati in testata rail sinistra (#296), non più testata centrale. Minimap: pallino "sei qui" segnalato da freccetta sotto (non più da dimensione/anello, per non sovrapporsi colore stato); riga si centra da sola su frammento corrente ogni cambio. Token/costo somma tutti stage/passaggi del frammento, senza indicare modello (pipeline può usarne più di uno). Due pannelli bianchi a filo (Originale/Candidata).
- **Colonna destra (`ProjectInspectorNext`)**: Pannello collapsabile, solo schede Approfondimenti (index/search/stats/coherence/glossary). Tab Frammento rimossa (#296): frammento vive in `ChunkInspectorPanel` in rail sinistra. Aperto quando `showInsightPanel` è `true`. Larghezze (default 430px, min 300px, max 620px, collassato 56px) sincronizzate con `uiStore.projectFlyoutWidth`.

`uiStore.activeProjectPanel` (`run|pipeline|document|insight|chunk`) è source-of-truth del rail. Setter `setShowInsightPanel` (#296) sostituisce `setShowDocumentDrawer`/`setShowChunkDrawer` come driver apertura pannello destro; `chunkRailTab`/`setChunkRailTab` selezionano scheda `ChunkInspectorPanel` in rail sinistra. `insight`/`chunk` non persistiti come pannello attivo (clamp a `run`).

**Shell home (ridisegnata 2026-07-18, #323; posizione tipizzata 2026-07-27, #210):** rail con **una sola selezione di navigazione, ogni voce naviga al proprio contenuto**. Ordine: `Dashboard` voce standalone in cima (home app-level) → sezione Aree globali (Traduzioni/Biblioteca/Trascrizioni/Analisi, tutte raggiungibili) → sezione Workspace (lista sciolta sempre visibile, `+` icon-only nell'header, click su un workspace = `setActive` + naviga alla sua pagina). Source-of-truth: `uiStore.location: AppLocation` (`src/navigation/appLocation.ts`), unione tipizzata che separa area/oggetto aperto/filtro workspace (`{area:'dashboard'} | {area:'workspace',workspaceId} | {area:'library'|'transcriptions'|'translations'|'analysis', itemId?, workspaceFilter?}`), non persistita, nessun fallback implicito — sostituisce la vecchia stringa piatta `activeWorkspaceView`. `workspaceFilter` predisposto nel tipo per un filtro futuro nelle aree globali, non ancora esposto in UI (rimandato, serve più di un workspace popolato per verificarlo). Contenuto: `AppDashboard` (dashboard) | `WorkspaceOverview` (pagina workspace: **solo** i progetti del workspace attivo) | `TranslationsArea` (area: **tutti** i progetti di tutti i workspace, badge workspace per riga) | `LibraryCatalogArea`/`TranscriptionsCatalogArea`/`AnalysisArea` (stato vuoto onesto, contenuto reale non ancora costruito, #214-227). Indicatore rail: un solo pallino accent per riga workspace, acceso solo quando quella riga è la vista corrente. `CreateProjectDialog`/`CreateWorkspaceDialog` condivisi. `PipelineSidebar`/`useEdgeResize` (sistema pre-#291) rimossi: risultavano codice morto al 100%, zero altri consumatori.

**Vista unica del progetto:** ogni progetto usa `ShellNext`, anche quando contiene un solo frammento. Se non c'è ancora un documento, la vista mostra il normale invito all'importazione. Non esiste un layout alternativo per documenti non segmentati.

#### Vista Documento

`DocumentView` espone due pannelli **a filo** (flush) con layout interno:
- **Barra navigazione** (altezza fissa `h-20`, allineata testate pannelli laterali):
  - Colonna sinistra due righe: indicatori stato stadi chunk corrente (riga 1), minimap pallini frammenti (riga 2).
  - Colonna destra: frecce prev/next + contatore m/n centrati.
- **Pannello Originale/Candidata**:
  - Header con titolo + separatore.
  - `MarkdownEditor` con `flatToolbar={true}` (barra tools a filo, no arrotondamento/ombra) e `menuOpen` controllato da pulsante header pagina.
  - Menu testo unico a scomparsa (modalità scrittura/anteprima/dividi, dimensione, formattazione markdown, copia) aperto da pulsante header pagina, in fila con controlli gestione pagina (cerca, blocca, modifica sorgente, stadi, confronto).
- **Controlli vista documento** (fuoco, scorrimento agganciato): spostati in `AppStatusBar` in basso, non più barra alta.
- **Confronto stadi**: pulsante auto-attivante — porta focus a sola-traduzione, accende confronto. Mostra precedente stage chunk corrente a fianco traduzione finale.

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
      - buildBlobContext(chunks, chunkId) → XML reference chunks
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

Provider `deepl` bypassa preflight LLM e `llmService.runStage()`. In `hooks/pipeline/engine.ts → executePipelineForChunk`, branch `provider === 'deepl'` chiama `deeplService.runDeeplStage()` → Tauri `run_deepl_stage` → HTTP POST `/v2/translate` verso API DeepL.

---

## Struttura del prompt (INVARIANTE — non modificare ordine)

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

**Perché quest'ordine:** Anthropic (breakpoint espliciti), OpenAI, Gemini (prefix caching automatico) cacheano prefisso comune più lungo. Qualsiasi inversione spezza caching, moltiplica costi su documenti lunghi.

---

## Stage — regole di isolamento

| Stage | Testo primario | Blob sorgente | previous_result | Blob traduzioni |
|---|---|---|---|---|
| Translation | chunk sorgente | ✅ | ❌ | ❌ |
| Refine | chunk sorgente | ✅ | ✅ output translation | ❌ | `audit_context` (opzionale) — findings del judge precedente, iniettato nel user turn |
| Format | output stage prec. | ❌ **cieco** | ❌ | ❌ |
| Judge | sorgente + traduzione | ❌ | ❌ | ❌ |
| Coherence Audit | — | ❌ | ❌ | ✅ blob traduzioni |

**Format volutamente cieco:** non vede sorgente né blob. Previene retraduzione.
**Coherence usa blob traduzioni** (non sorgente): confronta coerenza terminologica tra chunk già tradotti.

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

**Assemblaggio** (`src/hooks/pipeline/engine.ts`, `buildBlobContext()`):
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
| `src-tauri/src/iiif/discovery.rs` | `discover_iiif(provider_key, input, page)`: risolve manifest IIIF v2/v3 oppure cerca Internet Archive; restituisce un contratto normalizzato per la Dashboard e non persiste né scarica dati. |
| `src-tauri/src/iiif/mod.rs` | Registry provider/capability e routing della discovery. I provider non pronti restano dichiarativi: non vengono esposti come ricerca finché non hanno un handler reale. |
| `src-tauri/src/llm/pipeline.rs` | Comandi Tauri: run_stage, run_stage_stream, judge_translation, run_coherence_for_chunk, preflight_pipeline, compute_blobs, extract_phrase_memory_pairs, refine_prompt, test_provider_connection, cancel_stream, preview_stage_prompt (costruisce il prompt di uno stage senza contattare il provider, per la scheda Anteprima del pannello frammento) |
| `src-tauri/src/llm/blobs.rs` | Algoritmo assegnazione blob (globale vs finestre); `estimate_tokens` usa il massimo tra stima a parole e stima char-based (`/4`), per non sottostimare lingue con parole molto lunghe (composti tedeschi, forme latine) |
| `src-tauri/src/llm/prompts.rs` | Costruzione prompt 3-block, glossario, markdown rules, persona; `few_shot_examples` (esempi di traduzione scelti a mano) piegati nello stesso blocco static cacheable, non un blocco a parte (nessun breakpoint Anthropic aggiuntivo) — distinti dalla Phrase Memory, che resta nello stage-instructions non cacheable; `audit_context` iniettato nel user turn dei refine stage (cache-safe); blocco di riferimento della coherence audit è nel `system` (cacheable), non nello `user`; giudice restituisce `checkedSentenceIndices` (indici, non testo delle frasi) |
| `src-tauri/src/llm/provider.rs` | Trait LlmProvider, struct LlmRequest (`json_schema_strict: bool` per judge vs json_object per altri) |
| `src-tauri/src/llm/providers/` | Anthropic (cache breakpoint espliciti — **opt-in**, spenti di default: `AnthropicConfig.enable_caching`/`extended_cache_ttl` non attivano `cache_control` sui blocchi `cacheable` a meno che l'utente non li accenda esplicitamente per stage o per giudice/coerenza, dato che l'uso normale di Glossa lavora un frammento alla volta a distanza di minuti/ore, dove la cache di default non verrebbe mai riletta; `AnthropicConfig.temperature` 0-1 applicato sempre se impostato), OpenAI (prefix, `temperature` 0-2 applicato solo se il ragionamento non è attivo), Gemini (cacheControl + thinking, `temperature` 0-2 sempre applicabile insieme al thinking budget), DeepSeek (reasoning, stesso vincolo `temperature` di OpenAI), Ollama (locale). Il giudice impone nativamente il suo schema di risposta con OpenAI, Anthropic, Gemini e Ollama; DeepSeek e gli endpoint personalizzati restano in JSON normale, poi validato localmente. |
| `src-tauri/src/llm/stream.rs` | HTTP event stream reader, StreamGuard RAII |
| `src-tauri/src/llm/custom_profiles.rs` | CRUD profili endpoint custom su `custom_providers` (rusqlite diretto); verifica soltanto che lo schema TypeScript sia pronto, non esegue DDL. Comandi: list_custom_provider_profiles, save_custom_provider_profile, delete_custom_provider_profile, test_custom_provider_connection. resolve_provider() in pipeline.rs usa questo modulo per istanziare OpenAiCompatibleProvider::custom_endpoint(base_url) al runtime |
| `src-tauri/src/deepl/` | Client HTTP DeepL con comandi Tauri: run_deepl_stage, get_deepl_languages, list_deepl_glossaries, create_deepl_glossary, delete_deepl_glossary |
| `src-tauri/src/keystore.rs` | OS credential store per API key; chiave custom: `custom:<profile_id>`; helper sync save_api_key_sync/delete_api_key_sync per operazioni sincrone nei comandi |
| `src-tauri/src/db.rs` | `execute_transaction`, `backup_database_file` e `DbWriteCoordinator`: lock unico per tutte le write runtime. |
| `src-tauri/src/storage_config.rs` | Risolutore centrale della cartella dati (contiene `glossa.db`). `db.rs`, `vector/mod.rs`, `llm/custom_profiles.rs` delegano tutti a `storage_config::db_path()`/`resolve_data_dir()` invece di ricostruire il path — prima di questo modulo erano 3 punti duplicati indipendenti. Override letto da un file bootstrap fisso (`runtime-config.json`, sempre nella `app_config_dir()` di default OS, mai spostabile) — se l'override non contiene un `glossa.db` valido o non è scrivibile, fallback silenzioso al default (mai apre un DB vuoto per errore). Comandi: `get_data_dir` (stato corrente), `set_data_dir` (copia+verifica `PRAGMA quick_check`+switch pointer; **non cancella mai l'originale**, riavvio richiesto per usare la nuova posizione). Il frontend (`dbService.ts`) deve chiamare `get_data_dir` e costruire un URL sqlite **assoluto** prima di `Database.load()` — `tauri-plugin-sql` risolve un path relativo (`sqlite:glossa.db`) internamente contro `app_config_dir()` di default, non conosce l'override. |
| `src-tauri/src/vector/` | Connessione persistente sqlite-vec; comandi: vec_ping, get_embeddings, vec_list_phrase_memory, vec_delete_phrase_memory, vec_update_phrase_memory, vec_search_phrase_memory, vec_save_locked_phrases, vec_regenerate_all_embeddings. |
| `src-tauri/src/documents/` | Extract/export DOCX e PDF: extract_docx_text, extract_docx_markdown, export_markdown_docx, extract_pdf_text. |

---

## Phrase Memory

**Configurazione:**
- Workspace: `memoryExtractorProvider`, `memoryExtractorModel`, `memoryExtractorPrompt`; prompt templates con context `memory`.
- Pipeline: `usePhraseMemory`, `autoSearchPhraseMemory`, `phraseMemorySimilarityThreshold`, `phraseMemoryMaxResults`.

**Due tab distinti nel pannello del frammento** (`ChunkInspectorPanel`, rail sinistra): **Memoria** (`tabs/MemoryTab.tsx`, estrazione/cura) e **Riferimenti** (`tabs/ReferencesTab.tsx`, ricerca match + glossario, sola lettura). Le due responsabilità non condividono più stato né componenti.

**Estrazione e salvataggio (Tab Memoria):**
```
Frammento bloccato (translationLocked === true) — precondizione, bottone di estrazione disabilitato altrimenti
  ↓
click utente → phraseMemoryDraftStore (bozza in-memoria, per-chunk, non persistita su disco)
  ↓
extractPhraseMemoryPairs() → Tauri: extract_phrase_memory_pairs(provider, model, prompt, sourceText, targetText, languages)
  ↓
LLM JSON mode → { pairs: [{ sourcePhrase, targetPhrase, confidence }] }
  ↓
Validazione verbatim frontend + backend su source e target
  ↓
Revisione utente: accetta/scarta/modifica ciascuna candidate, aggiunta manuale libera (useMemoryExtractionDraft)
  ↓
Conferma → saveApprovedPhrasePairs() — embedding solo su sourcePhrase, poi vec_save_locked_phrases(..., confidence)
```

Nessun salvataggio automatico o in blocco: l'unico percorso di scrittura passa dal blocco del frammento + estrazione + revisione esplicita. No fallback locale: se extractor, JSON parsing o validazione falliscono, il frammento non salva coppie. Coppie vecchie e preset purgati dal bump schema perché formato precedente non compatibile.

Cambiando frammento a metà revisione, la bozza non confermata resta intatta in `phraseMemoryDraftStore` (Map per-chunk) — nessuna perdita, nessun blocco alla navigazione.

**Ricerca memoria (Tab Riferimenti):**
- Auto-search parte solo se `usePhraseMemory` attivo e `autoSearchPhraseMemory !== false`.
- Tab Riferimenti può sempre lanciare refresh manuale per chunk corrente quando memoria abilitata; mostra anche l'intero glossario di progetto (`config.glossary`, sola lettura, nessun filtro per chunk — è già così che viene iniettato nel prompt reale).
- Query embedding usa solo testo sorgente del chunk; match selezionati sono gli unici iniettati nel prompt di run/rerun. Le spunte di abilitazione sono preservate tra una ricerca e l'altra per gli id di match che ricompaiono (`phraseMemoryStore.setMatches` interseca gli abilitati precedenti con i nuovi risultati, non li azzera).
- Lo schema della memoria frasi (colonne e indici inclusi) viene creato o aggiornato una volta all'avvio dal servizio database frontend. Il backend mantiene una sola connessione SQLite con sqlite-vec per tutta la sessione, verifica soltanto lo schema già pronto e non esegue DDL durante questi comandi. Se la connessione non è disponibile all'avvio, l'app continua ad avviarsi e i comandi memoria restituiscono il motivo originale senza ricreare connessioni.

---

## Few-shot examples

Distinti dalla Phrase Memory: non è ricerca vettoriale per-chunk, ma un set fisso (tetto soft 5, consigliati 2-3) di traduzioni intere scelte a mano, persistito su `pipelines.few_shot_examples` (colonna JSON, stesso pattern di `stages`) e iniettato nel blocco **static** cacheable (`prompts.rs::format_few_shot_block`, dentro `build_stage_prompts`) invece che nello stage-instructions non cacheable.

- **Selezione**: bottone in `tabs/AuditTab.tsx` (non in `MemoryTab.tsx` — scelta deliberata: il momento naturale è quando l'audit del chunk è a posto e lo si blocca come definitivo), stesso gate `translationLocked`. Mostra anche il conteggio corrente (`N/5`) accanto al bottone. Copia `sourceDisplayText`/`translationDisplayText` del chunk corrente in un nuovo `FewShotExample` su `usePipelineStore().config.fewShotExamples`, con dedup per `sourceChunkId`.
- **Revisione**: `components/pipeline/FewShotExamplesConfig.tsx`, montato in `SettingsTabPanel.tsx` dopo `PhraseMemoryConfig` — sola gestione (edit/rimozione) di ciò che è stato pinnato dal chunk, nessun inserimento da zero qui.
- **Anteprima**: `promptPreview.ts` replica l'ordine reale (`few-shot-examples` dopo `glossary-constraints`, prima di `blob-context`, `kind: 'static'`).
- **Persistenza**: `pipelineService.ts` — colonna `pipelines.few_shot_examples` definita direttamente nella migrazione baseline (`src-tauri/migrations/0001_baseline_2_0.sql`).

---

## Schema DB (SQLite)

```
projects
  id, workspace_id FK, name, source_language, target_language
  source_display_text, source_processing_text, source_footnotes JSON
  document_format, render_profile, markdown_aware, experimental_import
  status ('active'|'trashed'), trashed_at — cestino (#211)
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
  few_shot_examples JSON[] (esempi di traduzione scelti a mano, tetto soft 5)
  use_phrase_memory, auto_search_phrase_memory
  phrase_memory_similarity_threshold, phrase_memory_max_results
  run_status ('idle'|'running'|'completed'|'interrupted')
  last_run_config JSON (fingerprint per resume)
  created_at, updated_at

translations  ← chunks
  id, project_id FK, pipeline_id FK, position
  source_display_text, source_processing_text, translation_display_text, translation_processing_text
  chunk_status ('ready'|'processing'|'completed'|'preview'|'error')
  stage_results JSON (Record<stageId, PipelineResult>)
  judge_status, judge_rating, judge_issues JSON
  translation_locked, coherence_result JSON
  footnotes JSON[], blob_id, blob_order, blob_reference_chunk_ids JSON
  created_at

glossaries / glossary_entries / project_glossaries
  CRUD standard, many-to-many project↔glossary
  workspace_id TEXT → riferimento logico a workspaces(id), colonna nullable a livello SQLite
  (ALTER TABLE non supporta ADD FOREIGN KEY/NOT NULL su colonna esistente) ma vincolo reale
  applicato lato TypeScript (#213): un glossario appartiene sempre a esattamente un workspace,
  createGlossary(...) richiede sempre un workspaceId, nessun "globale senza padrone".
  Riuso tra workspace = copia esplicita nel workspace di destinazione (nome modificabile),
  non condivisione live. Se la copia avviene da un progetto aperto, viene assegnata
  subito a quel progetto.
  listGlossaries(workspaceId) filtra solo quel workspace; listGlossaries() senza argomenti
  resta lo sfoglio cross-workspace non filtrato usato dalla Libreria generale (vedi sotto).

prompt_templates
  id, name, prompt, context ('stage'|'audit'|'persona'|'memory')
  workflow ('translation'|'transcription') — filtro workflow in PromptTemplatesTab
  default_model, default_provider

operation_logs
  id, project_id FK, pipeline_id, at TIMESTAMP
  level, scope, message, detail
  chunk_id, stage_id, meta JSON, phase, duration_ms, detail_kind
  idx: (project_id, at); (project_id, pipeline_id, at)

annotations
  id TEXT PK, chunk_id, pipeline_id FK (ON DELETE CASCADE)
  type TEXT ('comment'|'doubt'|'problem'|'approved'), content TEXT
  anchor_text TEXT nullable, sequence INT, created_at
  idx: (pipeline_id, chunk_id)

app_settings
  key PK, value
  — include 'active_workspace_id'
  — il versioning schema non passa più da questa tabella: sqlx tiene traccia delle
    migrazioni applicate nella sua tabella interna `_sqlx_migrations` (v. sotto)

Boot: le migrazioni sqlx girano lato nativo in `setup()` (`lib.rs` → `db::run_startup_migrations`),
prima che la finestra webview esista — `main.tsx` si limita ad aprire la connessione
(`initDatabase()`, solo pragma) e non tocca più lo schema. Nessun prompt di conferma
o reset distruttivo: le migrazioni sono additive (v. sotto), il DB utente non viene
mai droppato per un bump di schema.

phrase_memory
  id, workspace_id FK, source_phrase, target_phrase
  source_language, target_language, author, work, domain, tags, notes
  chunk_id, project_id, confidence, embedding, embedding_model, created_at
  idx: workspace_id; (chunk_id, project_id)

source_phrase_embeddings
  id, project_id FK, chunk_id, source_phrase, embedding, created_at
  idx: (chunk_id, project_id)

custom_providers
  id TEXT PK, name TEXT, base_url TEXT, requires_api_key INTEGER (0|1)
  created_at TEXT (ISO datetime)
  — CRUD Rust serializzata da `DbWriteCoordinator`
  — API key salvata nel keystore con chiave "custom:<id>", non in questa tabella
```

### Schema 2.0 — Biblioteca, Trascrizioni, job, artifact, provenance (#211)

Tabelle nuove, introdotte dalla migrazione baseline insieme a quelle 1.x sopra
(nessuna delle 1.x cambia forma). Realizzano il modello approvato in
`PRODUCT_ARCHITECTURE_2_0.md`: aree globali per tipo, workspace come raccolte
operative trasversali senza copie. Dettaglio implementativo demandato a #217
(asset/source policy), #218 (job runtime), #378 (provenance/metriche).

```
sources / source_versions
  sources: id, title, kind ('manuscript'|'print'|'pdf'|'iiif'|'web'|'other')
    primary_language, description, external_ref, status ('active'|'trashed'), trashed_at
  source_versions: id, source_id FK CASCADE, label, version_kind
    ('iiif_manifest'|'pdf'|'edition'|'copy'|'other'), source_url, metadata JSON, is_primary
    UNIQUE(source_id, label)

workspace_sources  ← N-N fonte↔workspace
  workspace_id FK CASCADE, source_id FK CASCADE, linked_at
  PK composita (workspace_id, source_id) — cascade cancella solo il link, mai la fonte

assets  ← inventario dettagliato demandato a #217
  id, source_version_id FK CASCADE (nullable), kind ('image'|'pdf'|'manifest'|'thumbnail'|'derived'|'other')
  locality ('remote'|'local'|'derived'), availability ('catalogued'|'partial'|'complete')
  vault_path, remote_url, derived_from_asset_id (self-ref, SET NULL), byte_size, checksum

transcription_documents / transcription_segments / transcription_revisions
  transcription_documents: id, source_version_id FK SET NULL (nullable: import senza fonte),
    workspace_id FK NOT NULL (home operativa obbligatoria), title, status ('active'|'archived'|'trashed')
  transcription_segments: id, document_id FK CASCADE, position, label, asset_id FK SET NULL
    UNIQUE(document_id, position)
  transcription_revisions: id, segment_id FK CASCADE, revision_number, text
    status ('draft'|'approved'|'rejected'), created_by ('user'|'ocr'|'import')
    UNIQUE(segment_id, revision_number)
    — "tutti i segmenti approvati" per abilitare l'origine traduzione è un invariante
      applicativo (service layer), non un CHECK SQL su aggregato cross-riga

translation_origins  ← origine testo di una traduzione, satellite 1:1 opzionale su projects
  project_id PK FK CASCADE, origin_type ('transcription'|'source_level'|'import')
  transcription_document_id FK SET NULL, source_version_id FK SET NULL, import_note
  CHECK di mutua esclusione fra i 3 origin_type
  — assenza di riga = import autonomo (comportamento di default per ogni progetto 1.x esistente)

jobs  ← un solo sistema condiviso per download/OCR/export/dataset (#218)
  id, job_type (stringa aperta, validata da registry Rust), status
    ('queued'|'running'|'pausing'|'paused'|'cancelling'|'cancelled'|'completed'|'error')
  priority, workspace_id SET NULL, owner_source_id/owner_transcription_document_id/
    owner_project_id/owner_asset_id (al più una NOT NULL, CHECK), depends_on_job_id (self-ref)
  config JSON, progress, message, attempt_count, max_attempts, error JSON, requested_by
  — protezione stati terminali da scritture tardive = UPDATE condizionale Rust (`WHERE status
    NOT IN (...)`), non vincolo SQL — implementazione in #218

artifacts  ← export/dataset/report tracciati, prodotti da un job
  id, source_id/transcription_document_id/project_id/workspace_id (esattamente una NOT NULL, CHECK)
  kind ('export'|'dataset'|'report'|'index'|'intermediate'), format, vault_path, config JSON
  job_id FK SET NULL

provenance_events  ← registro append-only unico, cross-dominio (#378)
  id, occurred_at, event_type (vocabolario aperto)
  entity_type (CHECK: source|source_version|transcription_document|transcription_segment|
    transcription_revision|project|translation_chunk|artifact|job), entity_id (NIENTE FK — la
    cronologia deve sopravvivere alla cancellazione fisica dell'entità)
  workspace_id SET NULL, actor ('user'|'system'|'model'), job_id SET NULL, input_ref/output_ref/config JSON
```

**Ownership e policy connessioni:** lo schema è posseduto da Rust/sqlx (`src-tauri/migrations/*.sql`, eseguite via `sqlx::migrate!` in `db::run_startup_migrations`, chiamata da `lib.rs::setup()` prima che la UI esista) — non più da TypeScript (#211, corregge il finding di audit "Rust ignora il DDL"). `services/dbService.ts` apre solo la connessione e imposta i pragma di sessione (`foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=10000`). Le write runtime frontend usano `db::execute_transaction`; vector e custom provider acquisiscono lo stesso `DbWriteCoordinator` prima di scrivere. Le tabelle senza consumatori (`macro_blocks`, `historical_techniques`, `technique_tags`, `phrase_memory_presets`) vengono droppate una tantum dalla migrazione baseline `0001_baseline_2_0.sql`.

**Migrazioni forward-only, additive, senza retrocompatibilità 1.x:** ogni nuovo file in `src-tauri/migrations/` usa `CREATE TABLE IF NOT EXISTS`/aggiunte pure — mai `ALTER`/`DROP` distruttivo sulle tabelle 1.x esistenti. Non c'è alcun percorso di conversione dati 1.x→2.0 perché le nuove entità (fonti, asset, trascrizioni, job, artifact, provenance — v. sotto) non hanno equivalente 1.x da cui migrare: nascono vuote. Il vecchio meccanismo "reset totale con backup" di `dbService.ts` è stato rimosso; resta solo come possibilità futura se un bump davvero incompatibile lo richiedesse (non necessario oggi, coerente con la scelta di non mantenere retrocompatibilità).

**Persistito vs in-memory:**
- ✅ Persistito: source, config, stage_results, translations, run_status, operation_logs
- ✅ Persistito workspace: progetti, configurazione extractor Phrase Memory, memoria frasi
- ❌ Solo in-memory: token stream real-time (ricostruito da stage_results su resume)

### Registry IIIF (#214)

`src-tauri/src/iiif/mod.rs` possiede il catalogo ordinato dei provider IIIF.
Ogni descriptor espone chiave stabile, nome, alias, placeholder, modalità
(`direct`, `fallback`, `search_first`), flag `is_enabled`, nomi stabili di
resolver e handler search, capacità direct/search e filtri dichiarativi.
`find_provider` normalizza le chiavi e gli alias; #215 aggancerà implementazioni
a questi nomi nello stesso registry, senza ramificazioni per provider nella UI.
Il comando `list_iiif_providers` espone al frontend solo provider abilitati e il
contratto dichiarativo, letto da `iiifProviderService`; la Biblioteca mostra
quindi capacità reali ma non avvia ancora chiamate a cataloghi remoti.

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

**Cache hit su OpenAI Responses API**: Responses API non supporta prefix caching cross-call indipendenti senza `previous_response_id`. Per cache hit reali su gpt-5.x, considerare passaggio a path Chat Completions (già usato da DeepSeek) con `prompt_cache_key` esplicito.

---

## Refactor pendenti noti

| Area | Descrizione | Priorità |
|---|---|---|
| `src-tauri/src/llm/providers/anthropic.rs` | Reasoning non supportato: nessun campo `thinking` nella request, parsing assume `content[0]` sia testo (corretto senza thinking). Per abilitare: aggiungere `"thinking": {"type":"enabled","budget_tokens":N}` + filtrare blocchi `"type":"thinking"` nel parsing. | alta |
| `src-tauri/src/llm/providers/gemini.rs` | Reasoning parziale: `thinkingConfig.thinkingBudget` inviato se configurato, ma parsing usa `parts[0]` — se thinking attivo, `parts[0]` è blocco thinking (campo `thought:true`), non testo finale. Fix: cercare primo part senza `thought:true`. | alta |
| OpenAI gpt-5.x — prompt caching | Bug lato OpenAI: prefix caching non funziona in modo affidabile su tutta famiglia gpt-5 (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.4). Su gpt-4o funziona 100%. Thread community aperto da ott 2025, non risolto a gen 2026. Da monitorare; non fixabile lato Glossa. Ref: [community.openai.com/t/1359574](https://community.openai.com/t/caching-is-borked-for-gpt-5-models/1359574) | monitoraggio |

---

---

## Note di Sicurezza (modello di minaccia: desktop single-user)

### Cache in-memoria delle API key

`keystore.rs` mantiene `HashMap<String, String>` statica (`API_KEY_CACHE`) contenente chiavi API in chiaro per durata processo, evita accessi ripetuti al keyring sistema. Chiavi restano nella heap del processo fino chiusura app.

**Implicazione**: attaccante con accesso locale al sistema (malware, processo con privilegi equivalenti) può recuperare chiavi da memory dump processo Glossa. Accettabile nel modello minaccia dichiarato (desktop single-user, no attaccante remoto), ma comportamento va tenuto presente: non estendere cache a token o credenziali vita breve senza rivalutare rischio.

### Logging in release e RUST_LOG

In release (`!debug_assertions`) livello log predefinito è `Info`. `RUST_LOG` letto a runtime (`lib.rs`) può sovrascrivere questo default.

**Implicazione**: impostare `RUST_LOG=debug` o `RUST_LOG=trace` su build release espone log verbosi, inclusi dettagli richieste LLM (provider, modello, timing). Non loggati contenuti prompt o risposte, ma provider e metadati sì. In contesto supporto tecnico, chiedere sempre verificare che `RUST_LOG` non sia impostato prima condividere log.

*Ultimo aggiornamento: 2026-07-13 — issue #320, ownership schema e write-path DB*
