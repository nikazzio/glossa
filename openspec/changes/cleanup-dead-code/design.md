# Design

## Context

Le voci vengono da una ricognizione del 22/11/2026 al commit `cc9508fc`:
ricerca testuale di ogni nome esportato nel codice dell'interfaccia (esclusi i
test) e di ogni comando registrato nel motore fra le chiamate dell'interfaccia
e dei test E2E, confrontata con il grafo del codice. Il grafo da solo dà troppi
falsi positivi (strutture Rust usate per serializzazione, gestori locali dei
componenti) e non è la fonte di verità.

Per ogni voce senza usi si è guardata la storia git (quando è nata, quando è
sparita l'ultima chiamata) e si sono confrontate le 44 issue aperte e la
roadmap. Una voce si toglie solo se è un avanzo: la sua ultima chiamata è
sparita con una schermata o un flusso rifatti, oppure non è mai stata collegata
e nessuna issue aperta la richiede.

## Goals / Non-Goals

**Goals:**

- Togliere gli avanzi elencati sotto dopo averli riverificati sul ramo corrente.
- Togliere ciò che resta orfano a cascata (aiuti interni, tipi, testi) solo se a
  sua volta senza altri usi e non legato a una voce che resta.
- Lasciare typecheck, lint, clippy e test verdi.

**Non-Goals:**

- Le voci «possibili evoluzioni» e «funzioni a metà» della proposta.
- Riorganizzare file o unire duplicati (revisione di Biblioteca e Ricerca).
- Togliere `export` superflui da nomi usati nel proprio file.

## Decisions

### Avanzi da togliere

Interfaccia (`src/`):

| Voce | Posizione | Origine | Test da togliere |
|---|---|---|---|
| `listSegments` | `services/transcriptionService.ts` | sostituita dal testo per pagina (set. 2026) | — |
| `initializeVault` | `services/vaultService.ts` | mai collegata; la radice si crea già negli altri comandi del deposito | — |
| `deleteVersionFiles` | `services/vaultService.ts` | sostituita da `deleteSourceFiles` (set. 2026) | — |
| `countGlossaryEntries`, `countPhraseMemoryEntries` | `services/glossaryService.ts`, `services/phraseMemoryService.ts` | vecchia Dashboard (set. 2026) | — |
| `listAllProjects`, `listRecentPipelineRuns`, `getDashboardOverviewStats` | `services/projectService.ts` | vecchia Dashboard e catalogo Traduzioni rifatto | `projectService.test.ts` (casi di `getDashboardOverviewStats`) |
| `recommendChunkCount` | `utils/index.ts` | sandbox tolta (#362) | `utils.test.ts` (relativi casi) |
| `relativeDateUnit` + tipo `RelativeUnit` | `utils/index.ts` | schermata di ricerca rifatta (set. 2026) | — |
| `buildSplitPreview` | `utils/documentWorkflow.ts` | refactor del motore (mag. 2026) | `documentWorkflow.test.ts` (relativi casi) |
| `listRunsForCategory` | `utils/operationLogStats.ts` | barra laterale rifatta (#300) | `operationLogStats.test.ts` (relativi casi) |
| `providerNeedsApiKey` | `hooks/useProviderKeyStatus.ts` | refactor del motore (mag. 2026) | `useProviderKeyStatus.test.ts` (relativi casi) |
| `isWaiting` | `stores/jobsStore.ts` | elenco dei lavori rifatto (set. 2026) | `jobsStore.test.ts` (relativi casi) |
| `ChunkMetric` | `components/document/DocumentViewControls.tsx` | pannello costi unificato (ago. 2026) | — |
| tipi `IconButtonDisabledStyle`, `DownloadedSize`, `CustomProviderProfileInput` | `components/ui/IconButton.tsx`, `schemas/externalData.ts` | mai usati; gli schemi Zod restano | — |
| testi `common.relative.*` | `i18n/it.json`, `i18n/en.json` | usati solo da `relativeDateUnit` | — |

Motore (`src-tauri/src/`):

| Voce | Posizione | Nota |
|---|---|---|
| comando `initialize_vault` | `vault/commands.rs` + `lib.rs` | `ensure_root` e `classify_folder` restano: usati da altri comandi |
| comando `delete_version_files` | `vault/commands.rs` + `lib.rs` | `wipe_version` resta: lo usa `delete_source_files` |
| comando `vec_ping` | `vector/mod.rs` + `lib.rs` | comando di prova del primo prototipo |
| metodo `api_key_env_var` | trait in `llm/provider.rs`, provider e provider di prova in `llm/tests.rs` | commento «reserved for future tooling», nessuna issue |

### Voci che restano

Restano invariate, con il motivo nella proposta: `getJob` / `get_job`,
`workspacesOf`, `itemIdsOf`, `linkItem`, `estimateEmbeddingCostUsd`,
`estimateTokenCount`, `vec_get_phrase_memory`, `MULTI_VALUE_SOURCE_FIELDS`,
`stripSuperscriptMarkers`, `backup_database_file`, `overrideGlossaryEntry`,
`clearGlossaryEntryOverride`, `getSourceReadMode`. Restano anche gli strumenti
dei test (`clearRetainedImageUrls`, `EMPTY_SOURCE_FIELDS`, fabbriche in
`src/test/`, `getMissingPricingModels`, che un test usa per controllare che
ogni modello a pagamento del catalogo abbia un prezzo) e i tipi `Judge*` con `#[allow(dead_code)]`, che servono a
derivare lo schema JSON.

### Verifica prima di ogni rimozione

Per ogni voce, sul ramo corrente: ricerca della parola intera in `src/`,
`src-tauri/src/`, `e2e/`, `scripts/`, compresi usi dinamici (nomi di comandi
come stringa, chiavi i18n composte). Se compare un uso nuovo, la voce esce
dall'elenco e si annota nel resoconto.

### Cascata

Nel motore le funzioni `pub` non generano avvisi di codice morto, quindi gli
aiuti chiamati dai comandi tolti si cercano a mano. Un aiuto rimasto senza usi
si toglie solo se non serve a una delle voci che restano.

### Documentazione

Solo per sviluppatori: `docs-dev/ARCHITECTURE.md` indica `delete_version_files`
come strada della rimozione di un'opera, che in realtà usa
`delete_source_files`. Guida in-app e documentazione pubblica non cambiano.

## Risks / Trade-offs

- [Un uso dinamico sfugge alla ricerca testuale] → ricerca anche delle stringhe
  dei comandi e delle chiavi i18n; typecheck e test completi a fine lavoro.
- [Una voce tolta sarebbe servita a un'evoluzione non scritta nelle issue] →
  si recupera dalla storia git; le voci con un legame anche debole a un'issue
  restano.
- [Togliere un caso di test riduce la copertura] → si tolgono solo casi che
  controllano voci tolte.
