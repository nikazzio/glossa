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
| `stores/uiStore.ts` | selectedChunkId, highlightsEnabled, highlightColors, uiFont, discoveryResultsPerRow, searchQuery, activePanel, showInsightPanel, chunkRailTab, showConsoleDrawer, showSettings/Help/ConfigDrawer | UI-only state. highlightsEnabled + highlightColors + uiFont + `discoveryResultsPerRow` (`3\|4\|'list'`) persisted (`glossa-ui-prefs` v17). activePanel enum sincronizzato coi boolean panel. `uiFont` ('jakarta'\|'geist'\|'inter'\|'plex') → `FontSync` (`App.tsx`) override runtime `--font-sans` su `:root`, come `HighlightColorSync` per colori. `showInsightPanel` (#296) sostituisce `showDocumentDrawer \|\| showChunkDrawer` come driver apertura `ProjectInspectorNext`. `chunkRailTab` (`ChunkRailTab = 'audit'\|'notes'\|'memory'\|'references'\|'promptPreview'`) seleziona scheda `ChunkInspectorPanel`, ora annidato in rail sinistra. `promptPreview` (dopo `references`) monta `ChunkPromptPreviewTab`, che con l'hook `useChunkPromptPreview` costruisce a comando (comando Tauri `preview_stage_prompt`) il messaggio letterale per una fase sul chunk corrente, senza contattare il provider. `showConsoleDrawer` apre/chiude drawer Operazioni sopra `AppStatusBar`. `chunkDrawerTab`/`showChunkDrawer` restano legacy per dashboard (pre-#291). |
| `stores/configStore.ts` | pipelineMode, pipelineTestChunkCount, ollamaStatus, ollamaModels, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPresetShort/Medium/Long, workMode | Config app. pipelineTestChunkCount, ollamaBaseUrl, newPipelineInit, maxPipelines, chunkPreset* persisted. ollamaStatus/Models transient. `workMode` (#296, `WorkMode = 'chunk'\|'all'`, default `'chunk'`) governa ramo `playFirst` di `PipelineSidebarRunSection`: `'chunk'` mostra § N + "Traduci chunk", `'all'` mostra Esegui tutto/Stop + progresso X/Y. Reset a `'chunk'` da `ConfigDrawer.handleResetAll`; letto da `useKeyboardShortcuts` per instradare `Ctrl+Enter`. |
| `stores/libraryStore.ts` | glossaries[], loadedForWorkspaceId, isLoaded, libraryScope | `libraryScope: 'workspace'\|'global'` (#213): `'workspace'` = dizionari del workspace da cui è aperta la Libreria, editabili; `'global'` = catalogo cross-workspace in sola lettura, con azione esplicita di copia nel workspace attivo. `setShowLibraryPanel(show, tab?, scope?)` riparte sempre da Dizionari se tab non specificato. In scope workspace non carica nulla prima che esista un workspace attivo; con id filtra solo quel workspace, senza id sfoglia tutti i workspace. |
| `services/workspaceItemsService.ts` + `workspace_items` | **Cosa contiene un workspace** (#213). Due forme di appartenenza, e non è una complicazione gratuita: **casa** — una traduzione e una trascrizione stanno in *un solo* workspace, colonna sulla loro riga, ed è da lì che prendono le risorse (se stessero in due, «quali dizionari vede questo lavoro» non avrebbe una risposta sola); **collegamento** — un libro è materiale di partenza e sta in più workspace insieme, e così un dizionario o le frasi importate: una riga in `workspace_items(workspace_id, item_type, item_id, is_origin)`, uguale per ogni tipo. Un tipo nuovo (i ritagli di caratteri delle trascrizioni, o quel che verrà) è **una stringa in più, non una migrazione**. `is_origin` dice dove la risorsa è nata: è la sua provenienza. Prima i libri avevano `workspace_sources` e tutto il resto una colonna `workspace_id`: ogni tipo nuovo chiedeva un'altra colonna e «sposta questo item» era un'operazione diversa per ognuno. |
| `glossary_entry_overrides` | **Ereditarietà e override** (#213). Un dizionario collegato a più workspace resta uno solo; ognuno può correggere una voce **a casa propria** senza toccare l'originale, o nasconderla. La riga esiste solo dove c'è una differenza, e `getGlossaryEntries(id, workspaceId)` la applica con `COALESCE`. Senza `workspaceId` si leggono le voci originali, che è ciò che serve al catalogo generale e all'esportazione. **Chi salva cambia a seconda di dove sta**: il workspace in cui il dizionario è nato (`is_origin`) modifica il dizionario; un workspace **ospite** scrive correzioni — voce cambiata diventa un override, voce tolta dall'elenco diventa `hidden`, voce riportata al valore originale perde l'override. Un **termine nuovo** entra invece nel dizionario per tutti: non si può correggere una voce che non esiste. Senza questa distinzione, salvare le voci «come le vede il workspace» le avrebbe riscritte per tutti e cancellato quelle nascoste. Il glossario che finisce nel prompt (`pipelineStore`) si legge con il workspace: le correzioni servono proprio lì. |
| `services/workspaceService.ts` | Il workspace come **contesto operativo** (#213). `workspaceContents` conta cosa c'è dentro — traduzioni, trascrizioni, dizionari, frasi in memoria, opere collegate — e `deleteWorkspace(id, disposal)` chiede **cosa farne**: `moveTo` sposta tutto in un altro workspace, `deleteEverything` lo elimina con lui. Prima il comando si rifiutava («ci sono dei progetti») e l'unica via d'uscita era svuotare a mano. Le **opere della Biblioteca non si toccano mai**: il collegamento cade per cascata e l'opera resta, perché può essere di più workspace insieme e perché i suoi file valgono gigabyte. `moveDocumentToWorkspace` sposta una traduzione o una trascrizione: **lo spostamento è esso stesso un fatto** (`workspace.moved`, chiave = workspace di destinazione, così due spostamenti sono due fatti e rifare lo stesso non ne aggiunge), e i fatti precedenti restano col workspace di allora — riscrivere il passato farebbe cambiare da soli i conti già chiusi. Il workspace di un documento **resta facoltativo** (decisione utente, 2026-08-17): un documento senza workspace vede solo le risorse generali. `archiveWorkspace(id, archived)` lo **mette da parte**: sparisce da dove si sceglie (`listWorkspaces()` lo esclude) e tutto quello che contiene resta dov'è — l'alternativa all'eliminazione per un lavoro finito che non si vuole buttare. Eliminando, se ne vanno solo i lavori che **abitavano** lì: libri, dizionari e frasi sono collegati e restano, perché possono stare anche altrove e servono comunque alle analisi. |
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
| `components/layout/AppStatusBar.tsx` | Barra stato basso. Shell nuova (#291), ridisegnata #296: sinistra solo pannello attivo (rimosso breadcrumb progetto/pipeline); centro `ChunkCenterStats` (§ N · X w · icona qualità reale via `qualityLabelKey` · stato, con tooltip su parole e qualità) in vista progetto, `DiscoveryCenterStats` (conteggio risultati ricerca/pagine, indicatore "altri disponibili") in vista Dashboard; destra console toggle (`Terminal`) + separatore + controlli vista documento + indicatore salvataggio. |
| `components/layout/ConsoleDrawer` (in `AppStatusBar.tsx`) | Drawer Operazioni (`OperationsTab` embedded) aperto da `showConsoleDrawer`, posizionato `absolute bottom-full` sopra status bar, altezza `h-64`. #296. |
| `components/dashboard/AppDashboard.tsx` | Dashboard app-level (home dell'applicazione): sinistra `SourceDiscoveryPanel` per discovery IIIF; destra riquadri panoramica (progetti totali, frammenti completati/totali, frasi in memoria, termini glossario), attenzione, riprendi e attività pipeline. La ricerca vive qui, non in Biblioteca. |
| `components/dashboard/SourceDiscoveryPanel.tsx` | Ricerca dashboard: provider pronti, input, risultati normalizzati con miniatura/metadati, paginazione. Stato di ricerca (query/risultati/pagina/scheda espansa) in `stores/discoverySearchStore.ts`, non locale al componente — sopravvive alla navigazione via e ritorno. Tre viste (`uiStore.discoveryResultsPerRow`: `3\|4\|'list'`) scelte da popup a click (`ClickPopover`) con icona trigger che riflette la vista attiva. Vista a schede: colonna sinistra fissa (barra ricerca ferma, risultati con scroll proprio, non l'intera app), altezza scheda sempre fissa (`h-40`), riga calcolata a `flex` (non CSS grid). Espandere una scheda non la stira mai in altezza: cresce solo in larghezza tenendo con sé SOLO la prima scheda della sua riga (`reorderForExpansion`, 1 unità + `columns-1` unità = riga sempre piena); le schede rimaste in mezzo fra le due passano subito dopo, mai indietro — mai riordino a ritroso, mai overlay sopra le vicine. Dati extra (autore/data/lingua/tipo/collezione/soggetti) su griglia 2 colonne nello spazio guadagnato, titolo mai troncato da espansa. Ogni risultato ha due azioni (`add-to-library`/`add-to-workspace`, quest'ultima apre scelta workspace) in una striscia intestazione piatta, non overlay; bottone "aggiungi" disabilitato anche per fonti già in Biblioteca da sessioni precedenti (`sourceLibraryStore.libraryManifestUrls`, non solo quelle appena aggiunte in sessione). Non crea fonti direttamente: chiama `sourceLibraryStore.addFromDiscovery`. |
| `components/workspace/LibraryCatalogArea.tsx` | Catalogo Biblioteca reale (#216): lista fonti (`sourceLibraryStore.sources`) o dettaglio singola fonte (`itemId` da `location`) con versioni e workspace collegati/scollegabili indipendentemente (mai dedotto da `activeWorkspace`). Vista griglia/lista con filtri/ordinamento rimandata a #398. |
| `services/libraryService.ts` | Logica dominio Biblioteca in TypeScript (pattern `glossaryService.ts`: `select`/`execute`/`runInTransaction` di `dbService.ts`, id via `generateId`): `addSourceToLibrary` (dedup su `source_versions.source_url`, insert atomico sources+source_versions+assets+workspace_sources), `listLibrarySources`, `listLibrarySourceUrls` (tutti gli url manifest già in Biblioteca, per segnare i risultati di ricerca come già presenti prima ancora di provare ad aggiungerli), `getLibrarySourceDetail`, `setWorkspaceSourceLink`. Nessun comando Rust dedicato: schema #211 (`sources`/`source_versions`/`workspace_sources`/`assets`) già sufficiente. |
| `stores/sourceLibraryStore.ts` | Stato Biblioteca lato UI: `sources`, `detail`, `addingUrls`/`addedManifestUrls` (per-URL, per bottone "aggiungi" reattivo senza bloccare l'intera vista), `libraryManifestUrls` (url già in Biblioteca, caricati da `loadLibraryManifestUrls` all'apertura della ricerca), `error`. `addFromDiscovery` deriva il payload da `IIIFManifestPreview`/`IIIFDiscoveryResult`. |
| `stores/discoverySearchStore.ts` | Stato ricerca Dashboard (non persistito su disco, sopravvive solo allo smontaggio componente): `providerKey`, `input`, `outcome`, `page`, `expandedId`, `searchError`. |
| `components/ui/ClickPopover.tsx` | Pannello a comparsa al click (Radix Popover, stato controllato dal chiamante) per poche opzioni senza aprire una finestra modale — trigger `IconButton` con `ariaPressed`. Riusato da selettore vista discovery e cambio pipeline (`ProjectRailNext.tsx`, sostituisce uso diretto di `@radix-ui/react-popover`). Diverso da `ui/Popover.tsx` (hover, non click) e da `ui/Menu.tsx` (ancorato a coordinate virtuali). Documentato in `UI_DESIGN_SYSTEM.md`. |
| `components/workspace/WorkspaceOverview.tsx` | Pagina del workspace attivo (vista `'workspace'`): identità/descrizione, azioni icon-only (Libreria, Configura, Elimina), lista progetti **solo di questo workspace** (`loadProjects` scoped su `activeWorkspace.id`) identificata dal segno scelto, `+` nuovo progetto |
| `components/workspace/TranslationsArea.tsx` | Area Traduzioni (vista `'translations'`): TUTTI i progetti di TUTTI i workspace (`listAllProjects`, cross-workspace, non scoped), ognuno con icona piccola del tipo Traduzione, segno grande e nome del proprio workspace; click apre il progetto via `projectStore.openProjectInWorkspace` (attiva prima il workspace del progetto se diverso da quello corrente). Vista distinta da `WorkspaceOverview` (che mostra solo il workspace attivo) — corretto 2026-07-18 dopo bug segnalato (l'area sembrava "incollata" all'ultimo workspace visitato perché in realtà era scoped come `WorkspaceOverview`, non una vista realmente separata) |
| `stores/projectStore.ts` → `openProjectInWorkspace(id, workspaceId)` | Azione condivisa "apri progetto da un workspace qualsiasi": se `workspaceId` è diverso dal workspace attivo, chiude il progetto corrente, attiva quel workspace, ricarica i suoi progetti, poi apre. Throw esplicito se il workspace non esiste (mai fallimento silenzioso). Usata da `AppDashboard` (Riprendi, Richiede attenzione) e `TranslationsArea` — introdotta 2026-07-18 per non triplicare la stessa logica |
| `components/workspace/CreateWorkspaceDialog.tsx` | Dialog creazione workspace condiviso (rail + dashboard) |
| `components/projects/CreateProjectDialog.tsx` | Dialog creazione progetto condiviso (TranslationsArea + WorkspaceOverview). Prop `workspaceId` opzionale: se passato (da `WorkspaceOverview`, che conosce il proprio workspace) crea lì direttamente; se assente (da `TranslationsArea`, area globale senza workspace in vista) mostra un selettore obbligatorio — mai dedotto da `activeWorkspace` residuo. `projectStore.createAndOpen(name, workspaceId)` richiede l'id esplicito. |
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
| `SectionLabel` / `FieldLabel` | Intestazione di sezione (icona 11px accento + etichetta `text-[11px]` maiuscola) ed etichetta di campo. Obbligatorie: il pattern scritto a mano esisteva in ventisei punti con cinque varianti. |
| `SettingRow` + `FIELD_CLASSNAME` | Riga di un'impostazione (etichetta `text-sm`, comando a destra, spiegazione nel tooltip) dentro lista `divide-y`/`border-y`, e trattamento unico dei campi nativi (fondo `editorial-textbox`). Nate dalla revisione della finestra Impostazioni (agosto 2026), dove ogni scheda aveva la sua altezza di riga e il suo tipo di campo. Dettagli e regole in `UI_DESIGN_SYSTEM.md`. |

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
| `src-tauri/src/llm/providers/` | Anthropic (cache breakpoint espliciti — **opt-in**, spenti di default: `AnthropicConfig.enable_caching`/`extended_cache_ttl` non attivano `cache_control` sui blocchi `cacheable` a meno che l'utente non li accenda esplicitamente per stage o per giudice/coerenza, dato che l'uso normale di Glossa lavora un frammento alla volta a distanza di minuti/ore, dove la cache di default non verrebbe mai riletta; `AnthropicConfig.temperature` 0-1 applicato sempre se impostato), OpenAI (prefix, `temperature` 0-2 applicato solo se il ragionamento non è attivo), Gemini (cacheControl + thinking, `temperature` 0-2 sempre applicabile insieme al thinking budget), DeepSeek (reasoning, stesso vincolo `temperature` di OpenAI), Ollama (locale). Il giudice impone nativamente il suo schema di risposta con OpenAI, Anthropic, Gemini e Ollama; DeepSeek e gli endpoint personalizzati restano in JSON normale, poi validato localmente. **Lo schema è uno solo** (#402): generato da `schemars` sui tipi in `llm/types.rs` e normalizzato da `audit_json_schema()` nella forma che tutte le API accettano — rimandi interni distesi (Gemini non li documenta), `additionalProperties: false` e `required` completo (obbligatori su OpenAI e Anthropic), via `$schema`/`title`/`format` che nessuno elenca fra i keyword supportati, vincoli numerici emessi come interi. Calcolato una volta in un `OnceLock`. Prima ce n'erano due — una scritta a mano per i tre cloud e una generata per Ollama — e quella generata era **la più debole**, perché tipo e gravità di un problema erano stringhe libere: Ollama riceveva istruzioni più permissive. Con il decoding vincolato attivo, su Ollama la **temperatura è forzata a zero** qualunque sia quella configurata: una risposta legata a uno schema dev'essere deterministica, e l'interfaccia lo dichiara accanto al campo (`ProviderRuntimeEditor.temperatureIgnored`). Il JSON normale resta con la temperatura scelta. |
| `src-tauri/src/llm/stream.rs` | HTTP event stream reader, StreamGuard RAII |
| `src-tauri/src/llm/custom_profiles.rs` | CRUD profili endpoint custom su `custom_providers` (rusqlite diretto); verifica soltanto che lo schema TypeScript sia pronto, non esegue DDL. Comandi: list_custom_provider_profiles, save_custom_provider_profile, delete_custom_provider_profile, test_custom_provider_connection. resolve_provider() in pipeline.rs usa questo modulo per istanziare OpenAiCompatibleProvider::custom_endpoint(base_url) al runtime |
| `src-tauri/src/deepl/` | Client HTTP DeepL con comandi Tauri: run_deepl_stage, get_deepl_languages, list_deepl_glossaries, create_deepl_glossary, delete_deepl_glossary |
| `src-tauri/src/keystore.rs` | OS credential store per API key; chiave custom: `custom:<profile_id>`; helper sync save_api_key_sync/delete_api_key_sync per operazioni sincrone nei comandi |
| `src-tauri/src/db.rs` | `execute_transaction`, `backup_database_file` e `DbWriteCoordinator`: lock unico per tutte le write runtime. |
| `src-tauri/src/storage_config.rs` | Risolutore centrale della cartella dati (contiene `glossa.db`). `db.rs`, `vector/mod.rs`, `llm/custom_profiles.rs` delegano tutti a `storage_config::db_path()`/`resolve_data_dir()` invece di ricostruire il path — prima di questo modulo erano 3 punti duplicati indipendenti. Override letto da un file bootstrap fisso (`runtime-config.json`, sempre nella `app_config_dir()` di default OS, mai spostabile) — se l'override non contiene un `glossa.db` valido o non è scrivibile, fallback silenzioso al default (mai apre un DB vuoto per errore). Comandi: `get_data_dir` (stato corrente), `choose_data_dir_folder` (apre la finestra di scelta **dal backend**, come l'import dopo #405 e la cartella del deposito — il percorso non attraversa la webview e nessun comando lo accetta come parametro; poi copia+verifica `PRAGMA quick_check`+switch pointer; **non cancella mai l'originale**, riavvio richiesto per usare la nuova posizione). Il frontend (`dbService.ts`) deve chiamare `get_data_dir` e costruire un URL sqlite **assoluto** prima di `Database.load()` — `tauri-plugin-sql` risolve un path relativo (`sqlite:glossa.db`) internamente contro `app_config_dir()` di default, non conosce l'override. |
| `src-tauri/src/vector/` | Connessione persistente sqlite-vec; comandi: vec_ping, get_embeddings, vec_list_phrase_memory, vec_delete_phrase_memory, vec_update_phrase_memory, vec_search_phrase_memory, vec_save_locked_phrases, vec_regenerate_all_embeddings. |
| `src-tauri/src/vault/` | Deposito dei file scaricati dalle biblioteche (#217, blocco 1 PR 1). `layout.rs`: disposizione per **provenienza** — `providers/<chiave>/<id-versione>/` con `pages/<dimensione>/0001.jpg`, miniature e manifesto originale; percorsi sempre **relativi** alla radice, componenti validate contro la risalita. `verification.rs`: la verifica del deposito come lavoro (D5, D5-bis), classe **processore** — il primo che non pesa sulla rete. Prende i percorsi che il database dichiara e guarda se sono ancora lì (rapida) o li apre e ne ricalcola l'impronta (completa); gli **orfani** — file sotto `providers/` che nessuna riga reclama — si trovano camminando le cartelle e si contano solo qui. Non corregge niente: riferisce «integri 198 · mancanti 12 · corrotti 0 · orfani 3». L'esito resta leggibile **dopo**: `vaultService.lastVaultCheck()` legge l'ultimo controllo completato dal registro dei lavori e le impostazioni lo mostrano finché non se ne fa un altro — prima viveva nella riga del pannello e dopo un giorno spariva. Cancellarli è `delete_vault_orphans` (D5-bis), che **riguarda il deposito nel momento in cui si preme** invece di fidarsi del conto: fra il controllo e la cancellazione può essere finito uno scaricamento, e quei file non sono più orfani; togliendo un file **pota le cartelle rimaste vuote**, che sono orfane anche loro. **La cancellazione non ricostruisce percorsi da una chiave.** `free_version_pages` riceve `versionId` e i `vaultPaths` che le righe delle carte dichiarano, ne accetta solo quelli nella forma `providers/<qualunque>/<versione>/pages/…` e riferisce **entrambi** gli elenchi: `deleted` (compresi i file che sul disco non c'erano già più) e `failed`. Chi chiama toglie le righe di `deleted` e solo quelle: tutto-o-niente sbagliava in una delle due direzioni — o una carta invisibile che occupa spazio, o una carta contata come presente che non c'è più. `delete_version_files` riceve il solo `versionId` e cerca la cartella **sotto tutte le biblioteche**. Prima entrambe componevano il percorso da una `providerKey` dedotta altrove: con la chiave sbagliata non trovavano niente, dichiaravano di essere riuscite senza errore, e chi chiamava toglieva le righe comunque — 153 carte rimaste sul disco senza più niente che le reclamasse, e nove cartelle su dieci di un deposito reale orfane. **Nessun comando accetta un percorso**: la radice la legge il backend da `app_settings` (`configured_root` non arriva più dalla webview), e la finestra di scelta la apre Rust. `integrity.rs`: `scan_reader` legge la sorgente — file o byte già in memoria — **una volta sola** e ne ricava insieme impronta FNV-1a e validità strutturale (firma + terminatore, tenendo da parte primi e ultimi byte durante lo scorrimento) — coglie i troncamenti che un controllo di dimensione non vede, senza raddoppiare la lettura su gigabyte. `mod.rs`: radice configurabile a parte dal database, marcatore `.glossa-vault` per riconoscere un deposito da ricollegare o rifiutare una cartella con altro contenuto (rifiuto applicato anche in `initialize_vault`, non solo in `check_vault_folder`: sono comandi distinti e la schermata potrebbe saltare il primo), **radice assente distinta da file mancante**, `directory_stats` conta file e byte in una camminata sola. Le verifiche non abortiscono l'intero lotto per un `vault_path` malformato: quella riga diventa `invalid` e le altre proseguono. `absolute_path` accetta solo percorsi che il layout produce davvero (`layout::validate_vault_path`: radice `providers/`|`derived/`, componenti safe, estensione `jpg`|`json`|`pdf`) — i percorsi da verificare arrivano dal frontend e la radice è un'impostazione scrivibile dalla webview, quindi il divieto di risalita da solo lascerebbe i comandi usabili come oracolo di esistenza. La scelta della cartella passa dal dialogo nativo aperto dal backend (`choose_vault_folder`), e `check_vault_folder` — che accettava un percorso dal frontend e ci faceva una write probe — **non esiste più**: nessun comando del deposito accetta percorsi. Comandi: `get_vault_status`, `choose_vault_folder`, `use_default_vault_folder`, `initialize_vault`, `expected_version_paths`, `verify_files_present`, `verify_files_integrity`, `free_version_pages`, `delete_version_files`, `enqueue_vault_verification`, `delete_vault_orphans`. Frontend: `services/vaultService.ts`. |
| `src-tauri/src/jobs/` | Orchestratore dei lavori in background (#218, blocco 1 PR 2). **Una coda sola dentro l'app**, avviata in `setup()`: `engine.rs` tiene i permessi per classe di risorsa (rete, processore, disco, servizi linguistici, documenti — limiti separati da `app_settings`, `0` = automatico), fa partire i lavori pronti e li fa decantare (`settle`); `store.rs` è tutta la SQL su `jobs`, con la **protezione della terminalità** nella clausola `WHERE status NOT IN ('completed','cancelled','error')` — un aggiornamento tardivo del gestore non resuscita un lavoro annullato; `mod.rs` porta stati, classi di risorsa, classificazione degli errori (`ErrorKind::is_retryable`, 403 ritentabile con raffreddamento lungo) e `BackoffProfile` (base 20 s, tetto 300 s, cooldown 600 s), che resta il ripiego per i tipi di lavoro senza profilo proprio: lo scaricamento allega all'errore l'attesa calcolata **dal profilo della biblioteca** (`JobContext::attempt` glielo permette), e i tentativi del lavoro sono `profile.max_attempts` (D16, D18). `max_attempts` conta i tentativi **falliti di fila**: `resume` e `retry` chiamano `store::reset_attempts` subito dopo `requeue`, perché il conto si alza a ogni avvio e senza azzerarlo ogni ripresa ne consumava uno — un libro lungo messo in pausa cinque volte arrivava a 5/5 senza che niente fosse mai andato storto, e il primo errore di rete diventava definitivo. Pausa e annullamento sono **cooperativi**: `JobControl` alza un flag, il gestore lo guarda al confine dell'unità di lavoro e restituisce `Outcome::Paused`/`Cancelled`. `JobContext::report_phase` dichiara **cosa sta facendo adesso** dentro lo stato — chiave breve decisa dal tipo di lavoro (`starting`, `manifest`, `negotiating`, `downloading`), tradotta dall'interfaccia, che mostra la chiave grezza per quelle che non conosce: così il pannello dice momento per momento a che punto è invece di un generico «in corso». `JobContext::report_progress` scrive al massimo una volta al secondo (D17) e `report_waiting` dichiara `waiting_reason = 'libraryLimits'` quando il lavoro è fermo per i limiti della biblioteca — fermo per cortesia e fermo per errore sono la stessa immobilità con significati opposti; `save_checkpoint` registra dove si è arrivati (D13). `NewJob.message` dà un nome al lavoro **già in coda**, prima che il gestore parta. Alla riapertura `recover_interrupted` porta i `cancelling` a `cancelled`, i riprendibili a `paused` (o in coda se `auto_resume_downloads` è acceso e la classe è rete) e gli altri in coda col progresso azzerato — **niente riparte da solo**. Ogni cambiamento esce come evento `jobs:updated`. La `duration_ms` del fatto `job.finished` è **quanto è durata l'esecuzione che ha portato all'esito**, misurata da `spawn` e passata a `settle`: dagli orari della tabella non si ricava, perché `started_at` segna il primo avvio e non si azzera più, quindi un lavoro messo in pausa la sera e ripreso la mattina dichiarava dodici ore di lavoro. **I log** hanno una forma sola — `job <evento> id=… key=value`, così una ricerca su `id=` ricostruisce la storia di un lavoro: `error` per ciò che è finito male e richiede una decisione, `warn` per ciò che si rimedia da solo (tentativo rimandato, misura rifiutata, raffreddamento, punto non salvato), `info` per il ciclo di vita (in coda, avviato, in pausa, ripreso, annullato, finito, recupero all'avvio, limiti letti), `debug` per il dettaglio a carta e le attese di cortesia. Il taglio fra `debug` e `info` è quello fra build di sviluppo e applicazione compilata, deciso in `lib.rs`; `RUST_LOG` scavalca entrambi. Le scritture passano dal `DbWriteCoordinator` come tutto il resto. Gestori registrati: solo i due finti delle build di sviluppo (`testing.rs`), il primo reale è lo scaricamento della PR 4. Tipi di lavoro registrati: `source_download` (uno solo per digitalizzazione: le miniature si ricavano dalle carte, non si scaricano), `vault_verification`, più i due finti delle build di sviluppo. Comandi: `create_job`, `list_active_jobs` (i non finiti **più i terminati nelle ultime 24 ore**, altrimenti la sezione «terminati oggi» si svuota a ogni riavvio), `get_job`, `pause_job`, `resume_job`, `cancel_job`, `retry_job`, `clear_finished_jobs`. Frontend: `services/jobsService.ts`. |
| `components/workspace/LibraryCatalogArea.tsx` | Il catalogo mostra **sempre tutti i libri** (#213): la Biblioteca è un catalogo, non la vista di un workspace, e filtrarla nascondeva libri che ci sono. A quali workspace appartiene un'opera si **vede** sulla scheda come etichette cliccabili — cliccarne una scollega — e un comando accanto apre la scelta di dove collegarla. I comandi sono in **due gruppi separati**: cosa fai al libro (scarica, verifica, libera spazio, elimina) e dove sta. `listLibraryCatalog()` porta i workspace di tutte le opere in una lettura sola (`workspacesOfMany`), non una query per scheda. |
| `src/components/jobs/` + `stores/jobsStore.ts` | Coda visibile (blocco 1 PR 3). `JobsIndicator` sta nella **zona destra della barra di stato, presente in ogni sezione** (D19, con la modifica chiesta dall'utente il 2026-08-14: sta con gli altri comandi globali, non al centro): icona + riga densa `3 lavori · Beatus, 34/210 · ~12 min`; con tutto fermo dice **perché** è fermo — `in pausa`, `in attesa · limiti della biblioteca`, `riprovo da solo fra 2 min` — e **l'icona non gira**: animare un'attesa la farebbe leggere come avanzamento (D17). Il motivo lo sceglie `stillReasonOf` in ordine di importanza (pausa, limiti, nuovo tentativo, coda); prima erano tutti «riprova da sola fra…», con il tempo che manca **a finire** al posto di quello del tentativo. Lo stesso stato appare nella scheda dell'opera in Biblioteca, che mostrava la rotellina anche su uno scaricamento in pausa. `JobsPanel` è la scheda Lavori del drawer in basso, accanto ai messaggi (D20, modello pannello VS Code): sezioni in corso / in attesa / terminati oggi, per riga solo i comandi ammessi dallo stato, come `IconButton` neutri. Ogni riga porta il **tipo di lavoro** in un contrassegno breve (pagine, miniature, verifica), il nome, le unità fatte sul totale e **quanto è arrivato sul totale previsto** — il peso della sola unità in corso non direbbe niente su quanto manca. Il riepilogo è un pulsante che **apre la riga** con un'animazione sulle righe della griglia (`grid-rows-[0fr]` → `[1fr]`, l'unico modo di animare un'altezza sconosciuta) e mostra i dettagli in due blocchi: **questa opera** (fase, misura massima chiesta, misure dichiarate dalla biblioteca, host, tentativi, orari, identificativo) e **ultima pagina passata**, con i dati veri di quella pagina — numero ed etichetta, misura chiesta per lei, dimensioni reali quando la biblioteca le dichiara, peso sul disco, se è stata scaricata adesso o ritrovata sul disco, indirizzo. La distinzione conta: su una pagina ritrovata non c'è stata nessuna richiesta, e la misura mostrata ripiega sul tetto — leggerla sotto un'unica etichetta «risoluzione» faceva sembrare un'impostazione ciò che era il risultato di una trattativa, e viceversa. I valori lunghi (misure dichiarate, indirizzo) stanno chiusi su una riga e si aprono su richiesta. I dettagli arrivano dalla colonna `jobs.detail`, JSON scritto dal gestore e letto da `parseJobDetail` senza fidarsi della forma: un gestore più nuovo dell'interfaccia può aggiungere chiavi, quelle sconosciute restano fuori invece di comparire a metà. Dentro il drawer valgono **solo** i token `terminal-*`. La barra di avanzamento interpola con `motion-safe:transition-[width]` quando il lavoro gira, resta immobile quando è fermo e ha una larghezza minima di 2 px, perché una carta su trecento arrotonda a zero e sembrerebbe una barra rotta. Accanto a «riprende fra…» c'è il tempo che manca **al tentativo**, contato dall'orario del prossimo tentativo (`retryCountdownSeconds`): il campo della stima invecchiava mentre la riga restava ferma sullo schermo. `jobsStore` tiene l'elenco (stato globale vero: un lavoro non appartiene a una schermata) aggiornato **per eventi** `jobs:updated`, non per letture a intervalli; `useJobsFeed` lo collega una volta sola in `App`. `useCloseGuard` intercetta la chiusura della finestra: con lavori attivi chiede conferma con l'elenco e li mette **in pausa** — non annullati — prima di chiudere (D12). Il drawer ha ora due schede: `uiStore.drawerTab` (`console` \| `jobs`); fuori da un progetto la scheda messaggi non esiste e resta solo Lavori. |
| `src/components/settings/VaultSection.tsx` + `JobsSettingsTab.tsx` | Impostazioni di deposito e lavori (blocco 1 PR 3-bis). **La finestra di scelta cartella la apre il backend** (`vault::commands::choose_vault_folder`, `tauri-plugin-dialog` + oneshot come `import_document` dopo #405): il percorso non attraversa mai la webview, il comando non lo accetta come parametro, e il backend stesso classifica la cartella, scrive `vault_root` in `app_settings` e crea il marcatore. Rifiuta cartella non vuota o non scrivibile (D1); avverte se il percorso contiene il nome di un client di sincronizzazione (D1-bis — riconoscimento **per indizio**, non certezza: il contrassegno vero dei segnaposto è leggibile solo su Windows). `use_default_vault_folder` è il "tieni tutto insieme". Scheda **Lavori** in Impostazioni: i cinque limiti per classe di risorsa (`0` = automatico, tetto più basso sulla rete perché il collo di bottiglia è il server della biblioteca, D11) e l'interruttore della ripresa automatica degli scaricamenti, spento di default (D13). Servizio: `services/jobSettingsService.ts`, che riporta sempre i valori dentro i limiti prima di salvarli. |
| `src/components/settings/DownloadSettingsTab.tsx` + `LibrariesSettingsTab.tsx` | Le due schede, nell'idioma visivo di Tipografia e Traduzioni: intestazione di sezione con icona da 11 px in accento e testo in maiuscoletto spaziato, elenco a righe con bordo sinistro in accento sulla voce attiva, numeri in `font-mono` dentro riquadri con l'etichetta sopra, nomi in `font-display` corsivo. **Scaricamento**: misura delle pagine e delle miniature, spiegazioni al passaggio del mouse invece che a schermo. **Biblioteche**: i profili di rete come elenco a due colonne — nome e quante biblioteche lo usano — con i valori del profilo scelto sotto (`NetworkProfileFields.tsx`, dodici campi dichiarati in una tabella), il comando per crearne uno e quello per eliminarlo, disattivato finché qualcuno lo usa; sotto, una riga per biblioteca con il menu del profilo. Il salvataggio **non è a ogni tasto**: un campo a metà non deve diventare la politica verso una biblioteca. |
| `src/components/workspace/LibraryCatalogArea.tsx` | Catalogo della Biblioteca (#398, ritaglio). Elenco o griglia (`uiStore.libraryView`), copertina dai metadati della digitalizzazione, e per ogni fonte **quante carte sono davvero sul computer** — contate dalle righe locali degli asset, non da uno stato tenuto a parte (D7). Comandi per riga: **scarica** (mette in coda il lavoro di #218 e mostra la percentuale mentre gira) e **togli dalla Biblioteca**, con conferma che dice esplicitamente che i file scaricati restano sul disco, perché liberare spazio è un'azione diversa (D6). La ricerca resta in Dashboard. |
| `src-tauri/src/download/` | Scaricamento delle fonti: primo gestore reale della coda (#218, blocco 1 PR 4). `courtesy.rs` tiene pausa fra richieste, limite a raffica a finestra scorrevole, concorrenza **per host** (dal profilo: 2 su Gallica, 4 altrove) e **raffreddamento dell'host** dopo un 403/429 — che vale per chiunque parli con quel server, non solo per il lavoro che l'ha incassato — il profilo lo dichiara il provider ma i contatori stanno sull'host, perché ricerca e immagini possono venire da macchine diverse (D18). `fetch.rs` classifica le risposte: **403 = «stai correndo troppo»** con il raffreddamento del profilo (Gallica 600 s), 429 con `Retry-After` quando c'è, 404 non ritentabile, 5xx trasporto, con **tre tentativi ravvicinati sulla singola richiesta** (primo livello di D16, invisibili al lavoro) prima di far salire l'errore al motore, dove la crescita è esponenziale; identifica l'applicazione come chiede la buona pratica IIIF. `manifest.rs` legge Presentation 3.0 e 2.1 conservando ordine, etichette, licenza, attribuzione e collegamento all'originale, e ricava per ogni carta **dimensioni dichiarate e livello di conformità del servizio**, che servono a scegliere la misura. `size.rs` sceglie **cosa chiedere** e conserva le alternative (`available_sizes`), che il pannello mostra accanto alla misura scelta: «1299» da solo non dice se era il massimo o il minimo che la biblioteca sa servire. Poi: il tetto è una politica (D4), la misura effettiva è quella dichiarata dal descrittore dell'immagine più vicina al tetto sul lato lungo, sopra o sotto. **Non si tenta niente alla cieca**: si legge `info.json`, si sceglie fra le misure di `sizes` (o quelle implicite in `tiles`, garantite dalla specifica a qualunque livello) e si chiede quella, **ricordando la scelta per tutte le carte con le stesse dimensioni**: le carte di uno stesso libro non hanno tutte la stessa dimensione, e archive.org dichiara `level2` ma risponde 500 a una larghezza arbitraria. Se il descrittore non si può usare — non arriva, è illeggibile, o non dichiara nessuna misura — **la carta si salta**, come una che la biblioteca non ha: un `info.json` che non rispondeva ha portato via lo stesso manoscritto due volte, al 47% e al 48%, quindici richieste e dieci minuti per volta, e alla sessione dopo la stessa carta rispondeva. Il ripiego sul riquadro `!tetto,tetto` è caduto (2026-08-18): `!w,h` è una funzione di livello 2 mentre `max` lo è dal livello 0, archive.org rifiuta le misure non dichiarate (`400` e `501` su `full/2000,` nel registro) e un `400` non è ritentabile, e soprattutto una misura si ricorda per tutto il gruppo — un ripiego ricordato si sarebbe portato dietro le otto carte medie del gruppo, o il libro intero dove le carte hanno una dimensione sola, anche attraverso le riprese, perché il punto salvato lo conserva e «riprova» non lo azzera. Un 403 o un 429 su `info.json` **non** si aggirano: quelli devono arrivare al motore, che aspetta e ritenta. `handler.rs` è il lavoro: manifesto, poi carte una per una, **saltando quelle già valide sul disco**, scrivendo prima nell'area di transito e promuovendo solo dopo la validazione (D16-bis), salvando a ogni carta un checkpoint che conta **quante carte sono fatte** — non il numero dell'ultima, che diverge appena una carta non è scaricabile — e che porta con sé **le misure già negoziate** per gruppo di dimensioni (`{"done": 288, "sizes": {"2583x4126": "1292,"}}`, con `sizes` opzionale perché i punti salvati di prima si leggono ancora): tenute solo in memoria, ogni ripresa le richiedeva da capo — 70 letture del descrittore per 39 gruppi distinti sullo stesso libro, dove D4 prevede una lettura per gruppo — e la stima del tempo dal **ritmo vero** — pagine fatte diviso tempo trascorso da quando il lavoro è partito, con la pausa dichiarata come ripiego finché le pagine sono meno di tre (D17, corretta il 2026-08-16: la pausa dichiarata è il minimo che aspettiamo noi, non quanto ci mette la biblioteca). Una carta trovata sul disco **senza la sua riga** (chiusura brusca fra promozione e scrittura) viene registrata invece che saltata, altrimenti il conteggio resterebbe sotto il vero per sempre. Una carta che la biblioteca **non ha** (404, non ritentabile) si conta come fatta e si va avanti: prima portava via il libro intero, e rilanciarlo tornava a morire sulla stessa carta, quindi un manoscritto con una pagina mancante non era scaricabile mai. Quante ne sono state saltate sta **nel punto salvato** — così regge attraverso le riprese — si legge nel registro alla fine (`job download complete … unavailable=…`) e nel pannello accanto a «fatte su totali», che da solo direbbe «328 su 328» di un libro che sul disco ne ha 326. Se **nessuna** carta è arrivata il lavoro non si dichiara riuscito: se la biblioteca ritira l'opera il ciclo le salterebbe tutte e chiuderebbe «completato» con il deposito vuoto, e a un lavoro riuscito nessuno va a guardare. L'errore è di trasporto, con l'attesa del profilo della biblioteca, perché sul campo questi silenzi sono passeggeri. Di ogni carta scaricata **ricava la miniatura** con `images.rs` (D6, corretta il 2026-08-16): decodifica, ridimensionamento al lato lungo configurato e ricodifica JPEG avvengono in `spawn_blocking`, perché sono lavoro del processore e dentro il filo del runtime terrebbero ferma la coda; la miniatura passa dalla stessa area di transito e prende una riga `assets` con `kind = 'thumbnail'` e identificativo `<versione>:thumbnail:<carta>`, senza `remote_url` perché non l'ha servita nessuno. Se la derivazione fallisce **il libro non fallisce**: si scrive nel registro e si va avanti. Una carta già sul disco a cui manca la miniatura la fa ricavare rileggendo il file, una volta sola. L'area di transito è **una per digitalizzazione** — carta e miniatura ci passano con nomi diversi — si scarta su **ogni** uscita, non solo a lavoro finito (D15), e **all'avvio** si butta quello che una chiusura brusca ha lasciato lì dentro (`vault::discard_stale_staging`): è roba mai promossa, e un lavoro ripreso riscarica quella carta. Il messaggio del pannello è `titolo · 34/210 · 46 MB`. Comando: `enqueue_source_download`, **un lavoro solo** per digitalizzazione: il tipo `source_thumbnails` non esiste più, perché costava una seconda richiesta per carta a servizi che rispondono fra 1 e 19 secondi. Il lato lungo delle miniature si legge da `app_settings.thumbnail_long_edge` alla messa in coda (predefinito 300 px, ammessi 100-800). I profili stanno in `iiif/network.rs`, dentro il registro dei provider. |
| `src-tauri/src/iiif/settings.rs` + `commands.rs` | **I profili di rete** e la misura delle pagine (#421, #422). Un profilo è **un ritmo, non una biblioteca**: nel registro i ritmi tarati sono due — quello prudente e quello di Gallica — e si applicano a undici biblioteche, che *scelgono* quale seguire (`library_network_profiles`). Due profili nascono con l'applicazione (`ensure_builtin_profiles`, all'avvio) prendendo i valori **dal registro**, che resta l'unico posto dove una biblioteca nuova si compila; si modificano ma non si eliminano, e nemmeno si elimina un profilo in uso — le biblioteche resterebbero senza politica. `effective_profile` cerca il profilo scelto per la chiave, poi per l'host (opere aggiunte per indirizzo diretto, D18), poi il predefinito. Fuori dai profili restano le caratteristiche della singola biblioteca — preriscaldamento del visualizzatore, intestazione di provenienza — che non sono un ritmo. `within_limits` riporta ogni profilo dentro gli estremi prima dell'uso: **il tetto di 4 richieste insieme per host vive qui e non solo nel menu** (D11). La misura delle pagine ha **due livelli** (D4): l'opera e l'impostazione generale — chi conserva il libro non c'entra con quanto è fitta la scrittura. Comandi: `list_network_settings`, `save_network_profile`, `delete_network_profile`, `set_library_network_profile`, `get_version_size_cap`, `set_version_size_cap`. Migrazioni `0007` (misura per opera) e `0009` (i profili, che sostituiscono i valori per biblioteca). Frontend: `services/downloadSettingsService.ts`. |
| `src-tauri/src/provenance.rs` | Il registro dei fatti (#378, D23-D29). Tre registri con tre nature diverse: **`provenance_events`** tiene ciò che si raggrupperebbe in un grafico ed è **append-only, mai cancellato automaticamente** (D28); `operation_logs` resta il log tecnico, effimero; **`derived_metrics`** tiene i valori calcolati dopo, separati perché un fatto non si invalida mai — è successo — mentre una metrica sì, quando cambia l'input o l'algoritmo, e per poterla rifare dichiara `algorithm_version` e `input_hash`. `event_id` deriva l'identificativo da lavoro, entità, tipo e discriminante (`key_ref`): riscrivere lo stesso fatto **sostituisce invece di duplicare** (D27), e **il numero del tentativo non entra nella chiave** — se ci entrasse produrrebbe la duplicazione che la regola vuole impedire. `fnv1a_hex` è l'impronta del contenuto (D25), la stessa funzione che il frontend calcola in `provenanceService.ts`: il riferimento dice cosa c'è adesso, l'impronta cosa c'era allora. Il costo sta qui e non in una tabella dedicata (D23): è un attributo del fatto, accanto a modello, token e durata. Le revisioni di **trascrizione** hanno la stessa forma di quelle di traduzione dalla migrazione `0010`: testo immutabile, da quale revisione deriva, impronta del contenuto, e il puntatore alla revisione approvata sul segmento — così il costruttore di dataset tratta i due casi allo stesso modo invece che come due mondi. |
| `src-tauri/src/images.rs` | Manipolazione delle immagini: **funzioni pure**, byte dentro e byte fuori, senza rete e senza deposito. `thumbnail(bytes, lato_lungo)` decodifica, riporta l'immagine dentro un quadrato di lato dato conservando le proporzioni — **senza mai ingrandire** — e ricodifica in JPEG a qualità 80, che resta interna perché è una scelta di resa e non una preferenza. Filtro Lanczos: su una miniatura la differenza si legge nelle lettere. La libreria è `image`, **puro Rust** con `default-features = false` e i soli formati `jpeg` e `png`, così le build per Windows, macOS e Linux non acquisiscono dipendenze di sistema. Chi la chiama da un contesto asincrono la esegue in `spawn_blocking`. |
| `src/services/provenanceService.ts` + `translationRevisionsService.ts` | La registrazione dal lato dell'interfaccia (#378, D22-D29). `provenanceService` scrive nella stessa tabella del backend **con la stessa regola di identità e la stessa impronta**: due formule diverse produrrebbero due registri sovrapposti. `translationRevisionsService` porta lo storico delle traduzioni che finora esisteva solo per le trascrizioni: **non una revisione per salvataggio** — si scriverebbero centinaia di righe per battitura — ma i due soli momenti che contano, la proposta del modello e la versione che l'utente approva. Le revisioni **non hanno stato di approvazione**: approvare e ritirare sono fatti che puntano a una revisione, e `translations.approved_revision_id` dice qual è quella in vigore adesso. Una revisione ritirata resta e vale: «approvata e poi superata» è informazione, non rumore. L'approvazione si registra **anche quando l'utente non cambia niente**, perché accettare è un giudizio e registrare solo le correzioni sbilancerebbe l'insieme verso gli errori. Punti in cui i fatti accadono: `hooks/pipeline/engine.ts` (proposta del modello) e `components/document/DocumentView.tsx` (approvazione e ritiro). Una registrazione che fallisce **non impedisce il gesto**: si scrive nel log tecnico e si va avanti. Le chiamate ai modelli le registra `pipelineProvenance.ts`: token, costo davvero speso, durata, coppia linguistica, esito e tipo di errore, con l'identità **frammento più stadio** — rieseguire sostituisce invece di accumulare. **Tutte le chiamate**, non solo gli stadi: il giudice (`judge`), la verifica di coerenza (`coherence`), il ciclo che riscrive dopo un giudizio negativo (`refine-after-judge`) e l'estrattore della memoria di frasi (`memory-extractor`, che ritenta **una volta sola** quando la risposta è malformata — gli errori del provider propagano subito, perché una seconda chiamata identica costerebbe il doppio per lo stesso errore — e resta un fatto solo, come ogni ritentativo) hanno ognuno il proprio stadio, perché contarli insieme a quello che traduce li farebbe sostituire a vicenda (D27); la rigenerazione degli embedding è un fatto **del workspace** (`embeddings.regenerated`), con quante frasi ha rifatto e senza token, che il comando non dichiara. Il costo distingue i token letti da cache, che costano una frazione dell'ingresso (`CACHE_READ_FACTOR`: un decimo su Anthropic): i provider non li dichiarano allo stesso modo — Anthropic li tiene fuori dal totale d'ingresso, gli altri dentro — e il conto usa `cacheMissInputTokens`, calcolato dal backend che ha letto la risposta. Per DeepL, che fattura caratteri, il numero dichiarato finisce nel JSON del fatto. Il verdetto del giudice diventa un fatto **legato alla revisione che ha giudicato** (D22), e lo scrive anche il rilancio della sola revisione — non solo il giro completo della pipeline, che è il caso in cui prima non restava traccia; se il testo giudicato non corrisponde a nessuna revisione in archivio, il fatto porta la sua impronta. La riscrittura dopo il giudizio **scrive una revisione**, perché cambia il testo. |
| `src-tauri/src/backup.rs` | Il file di backup: sceglierlo, scriverlo, rileggerlo (#345, #407, D31). **Il percorso non attraversa mai l'interfaccia**: la finestra la apre il backend, come per l'import dei documenti dopo #405, e il frontend manda e riceve solo il contenuto. L'archivio è compresso (zip, deflate) e porta un **manifesto** con versione del formato, impronta e dimensione del contenuto: un file troncato si riconosce **prima** di iniziare il ripristino, che altrimenti se ne accorgerebbe a database già svuotato. Un file che non è un archivio si legge come JSON semplice — sono i backup scritti prima che il formato fosse compresso, e rifiutarli vorrebbe dire buttarli. Dentro c'è solo il database, mai le immagini (D31): al loro posto l'elenco delle opere che erano scaricate e a che misura, da cui il ripristino propone di riprenderle. **Il backup è del programma intero, non di un workspace**: il comando sta in `StorageSettingsTab` → `BackupSection` (Impostazioni → Archiviazione), non più nelle impostazioni del workspace, e il ripristino sostituisce tutti i workspace. Le colonne che il ripristino riscrive si chiedono al database (`PRAGMA table_info`) invece di stare in un elenco scritto a mano: quell'elenco restava indietro e le colonne dimenticate sparivano in silenzio (fra le altre `glossaries.workspace_id`, `workspaces.icon_key`, il formato dei progetti). L'esportazione/importazione di un **singolo** workspace è lavoro a parte: richiede identificatori nuovi e le regole di ambito di #213. **Il ripristino conserva le righe delle pagine già sul disco**: stanno appese alle opere e la sostituzione se le portava via per cascata, lasciando il deposito pieno di file che il database non conosceva più. Una copia temporanea sulla stessa connessione le tiene al riparo, e tornano solo quelle di un'opera presente nel backup. Subito dopo si mette in coda il controllo del deposito, e **solo quando finisce** si propone di riprendere le pagine mancanti (`services/restoreFollowUp.ts`, `hooks/useRestoreFollowUp.ts`): l'attesa è scritta in `app_settings`, perché il ripristino ricarica l'applicazione e il controllo può finire in una sessione successiva. I puntatori che al momento dell'inserimento non possono valere — la revisione approvata di un frammento o di un segmento, la pagina di un segmento — si inseriscono vuoti e si riscrivono alla fine **solo dove la riga puntata esiste**: `INSERT OR IGNORE` non salta le violazioni di chiave esterna (la risoluzione dei conflitti vale per unicità, non nullo e controlli), quindi un puntatore prematuro **fermerebbe l'intero ripristino**. |
| `src-tauri/src/documents/` | Import ed export documenti. `import_document` apre la finestra di scelta file **dal backend** (`tauri-plugin-dialog`, callback + oneshot) e restituisce `ImportedDocument` (nome, testo, formato, marcatore sperimentale): il percorso non raggiunge mai la webview e nessun comando accetta un percorso dal frontend, quindi non serve più alcun vincolo di cartella — l'import funziona da qualunque posizione. Chiude #371 e supera #367 con la preferenza opzionale che ne derivava. I filtri della finestra ricalcano quelli del dialog precedente, **compreso `All files`**: senza quella voce i formati fuori elenco non sarebbero selezionabili pur essendo importabili. `read_picked_document` (funzione pura, testabile senza app) sceglie il decoder da `DocumentKind::from_path`: `docx` → Markdown sperimentale, `pdf` → testo piano, `md`/`markdown` → Markdown, tutto il resto → testo piano UTF-8 (errore `text_not_utf8` se la codifica non è valida, gestito con messaggio dedicato dalla UI). Limiti: 100 MB DOCX, 50 MB PDF, 50 MB testo. Export: `export_markdown_docx`. | 

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
| Resa grafica su Linux/WebKitGTK | Su un portatile sotto WSL2 (agosto 2026) comparivano **rettangoli chiari che apparivano e sparivano al movimento del mouse**: aree danneggiate che il compositore non ripuliva, non un difetto della pagina. Spariscono avviando con `WEBKIT_DISABLE_COMPOSITING_MODE=1`. **Non messo di default**: potrebbe essere specifico di quella macchina/driver, e disattivare la composizione ha un costo su tutti gli altri sistemi. Da riprodurre altrove prima di decidere; se confermato, va accanto a `GTK_OVERLAY_SCROLLING` in `main.rs`, solo per Linux. | monitoraggio |
| Scrollbar (Linux) | `GTK_OVERLAY_SCROLLING=0` + CSS provider GTK risolvono lo z-index ma il risultato **non convince esteticamente**: si vede la scrollbar classica invece di quella overlay. Serve una soluzione vera (scrollbar disegnate dalla pagina, o overlay ripristinato senza sfondare lo z-index), non un altro rattoppo. | media |
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
