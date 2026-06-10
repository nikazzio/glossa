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

## Invarianti architetturali della pipeline

Dettagli completi in `docs/ARCHITECTURE.md`. Regola fondamentale: l'ordine dei blocchi nel system prompt (`static → blob → stage-instructions`) **non si cambia mai** — qualsiasi inversione spezza il prefix caching su tutti i provider e moltiplica i costi su documenti lunghi.

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

> **Lavoro su componenti?** Leggi `docs/UI_DESIGN_SYSTEM.md` prima di toccare qualsiasi elemento visivo. Contiene palette, tipografia, pattern codice completi per pulsanti, barre filtro e label.

## Comunicazione con l'utente

Quando descrivi il funzionamento del codice o l'analisi di una feature, ragiona a livello **logico-funzionale**: spiega cosa fa il sistema, cosa manca, quale comportamento cambia — senza citare nomi di variabili, funzioni, tipi o file specifici. L'utente non ha il codice in testa e quei nomi non gli dicono nulla; ciò che serve è capire il comportamento, non la struttura interna.

## Git — Regole obbligatorie

**Prima di creare qualsiasi branch**, aggiorna sempre main:

```bash
git checkout main
git pull origin main
git checkout -b nome-branch
```

Non partire mai da un branch esistente non aggiornato. Ogni branch deve avere come base il commit più recente di main al momento della creazione. Altrimenti la PR avrà conflitti garantiti.

## Contributing

1. Apri un issue prima di iniziare lavori grandi
2. Un PR per feature/fix — non accorpare cose non correlate
3. Assicurati che `npm run lint` e `cargo clippy` passino prima del PR
4. I test devono passare: `npm test` e `cargo test`
5. Breaking changes: documentali nella descrizione del PR e aggiorna i punti interessati

## Documentazione architetturale

`docs/ARCHITECTURE.md` è la mappa di riferimento dei flussi interni per Claude.

**Aggiornala obbligatoriamente quando:**
- Cambia un flusso di esecuzione (pipeline, streaming, cancellazione)
- Viene aggiunto/rimosso/rinominato uno store Zustand o un'action
- Viene aggiunto/modificato un comando Tauri (`#[tauri::command]`)
- Cambia lo schema DB (nuova tabella, colonna, tipo)
- Cambia la struttura del prompt (ordine blocchi, nuovi stage, isolamento stage)
- Viene risolto un refactor pendente elencato in fondo al file

Non aggiornare per: rinominare variabili locali, aggiungere componenti UI puri, modificare stili.

`docs/UI_DESIGN_SYSTEM.md` va aggiornato quando cambiano palette, tipografia, componenti base o pattern visivi consolidati.

## Help utente dell'app

Ogni modifica funzionale visibile all'utente (nuova feature, cambiamento di comportamento, rimozione di funzionalità) **richiede aggiornamento dell'help in-app**. Prima di chiudere il branch verifica che i testi di aiuto riflettano il comportamento attuale.

## Stato sessione

`STATO_SESSIONE.md` (root del progetto) è la fonte di verità sullo stato corrente del progetto: feature completate, in corso, priorità, debito tecnico aperto.

**Leggi sempre STATO_SESSIONE.md all'inizio di ogni sessione** per capire da dove riprendere.

**Aggiornalo obbligatoriamente quando:**
- Una feature viene completata o abbandonata
- Cambia la priorità di un task
- Emerge nuovo debito tecnico rilevante
- Si chiude un branch significativo

## Ottimizzazione token

Prima di esplorare codebase grandi o poco conosciuti, usa **repomix** (`skill repomix-commands:pack-local`) per ottenere una vista compatta dell'intero progetto. Riduce drasticamente i token spesi in Grep/Read ripetuti.

Usa le **skill disponibili** (es. `ecc:plan`, `ecc:code-review`, `ecc:rust-review`) ogni volta che il task lo giustifica: le skill strutturano il lavoro in modo più efficiente di un approccio ad-hoc.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

This project has a knowledge graph built by a hook at every file change. When the `code-review-graph` MCP tools are available in session, prefer them over Grep/Glob/Read — they are faster, cheaper (fewer tokens), and give structural context (callers, dependents, test coverage) that file scanning cannot.

**If the tools are not connected** (not listed in the available tool set), fall back to Grep/Glob/Read normally.

### When to use graph tools (when available)

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
