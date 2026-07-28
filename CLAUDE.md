# Glossa — Istruzioni per lo sviluppo

## Stato del progetto
Sviluppo attivo (pre-1.0). Priorità assoluta modalità documento/editoriale. UI sandbox tocca solo regressioni bloccanti.

## Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, Vite
- **Backend**: Rust (Tauri v2), SQLite via SQLx, reqwest
- **Test**: Vitest + Testing Library (Frontend), tokio-test + wiremock (Backend)

## Principi Fondamentali
- **Semplicità**: Codice minimo. No feature speculative future.
- **Leggibilità**: Nomi descrittivi. Commenti solo per logiche non ovvie, vincoli nascosti, workaround.
- **Immutabilità**: No mutare oggetti esistenti (preferisci `let` a `let mut`, usa spread operator e metodi funzionali in JS).
- **File**: Max 400-800 righe. Organizza per dominio/feature, non per tipo file.
- **TypeScript**: Tipi espliciti (mai `any`), costanti nominate. Gestione esplicita `null`/`undefined`. Validazione rigorosa input esterni.
- **Rust**: No `.unwrap()` in produzione. Uso sistematico `?` e `thiserror`. Formattazione/linting rigorosi (`cargo fmt`, zero warning `clippy`). Evita `clone()` inutili.
- **Architettura**: Handler backend snelli (logica in moduli dominio). Frontend con hook custom; Zustand solo per stato globale reale.

## Invarianti della Pipeline
- **Prefix Caching (CRITICO)**: Ordine blocchi system prompt (`static → blob → stage-instructions`) **mai cambia**. Inversione spezza cache provider, moltiplica costi.

## Documentazione e Stato
- **Architettura**: Aggiorna `docs-dev/ARCHITECTURE.md` per modifiche flussi, comandi Tauri, schemi DB, store Zustand.
- **UI**: Consulta `docs-dev/UI_DESIGN_SYSTEM.md` prima di ogni modifica visiva.
- **Avanzamento**: Leggi `STATO_SESSIONE_2.0.md` inizio sessione, aggiorna obbligatorio fine task/feature. Aggiorna help in-app per modifiche funzionali.
- **Docs pubbliche VitePress**: Aggiorna `docs/` (IT) e `docs/en/` (EN) quando aggiungi/rimuovi/modifichi funzionalità utente, workflow, comportamento interfaccia. Sito pubblicato su GitHub Pages. Se aggiungi pagina, aggiorna sidebar in `docs/.vitepress/config.ts`.

## Comunicazione con l'utente (CRITICO)
Niki non scrive codice, non riconosce nomi tecnici. Spiegazioni utente:
- **Mai** citare nomi file, funzioni, variabili, hook, componenti
- **Sempre** descrivere comportamenti visibili: cosa utente vede, clicca, ottiene
- **Giusto**: "la finestra della Libreria ora mostra il nome del workspace nel titolo"
- **Sbagliato**: "LibraryPanel usa panelTitle derivato da activeWorkspace?.name"

## Git e Test
- **Git**: Aggiorna sempre `main` prima creare branch (`git checkout main && git pull origin main && git checkout -b nome-branch`).
- **Test**: Approccio TDD. Copertura minima 80%. Nomi test descrittivi su comportamento atteso. Mai sopprimere errori in silenzio.

---

## Strumenti e Ottimizzazione Token

### Repomix (Esplorazione Iniziale)
Prima di analizzare porzioni codebase estese o poco conosciute, usa **repomix** (`skill repomix-commands:pack-local`).
- **Scopo**: Vista compatta e indicizzata intero progetto in un'unica operazione, azzera catene esplorative costose filesystem, risparmia token.
- **Misura**: usa include mirati al dominio da modificare; non generare pack completi quando bastano pochi file noti.

### RTK (Rust Token Killer) - Filtro Output CLI
Per prevenire esaurimento finestra contesto, **ogni comando terminale deve iniziare con `rtk`**.

`rtk` intercetta output, filtra verbosità, restituisce formati iper-compatti, risparmia 60-90% token.
- **Uso corretto**: `rtk cargo test`, `rtk grep pattern`, `rtk read file.ts`
- **Catene**: Anche con `&&`, applica ogni step: `rtk git add . && rtk git commit -m "msg" && rtk git push`

### Economia di tempo e token

- **Comunicazione**: usa il skill `caveman` nelle attività operative, salvo casi in cui la chiarezza o la sicurezza richiedano prosa normale.
- **Verifica proporzionata**: esegui soltanto test direttamente pertinenti ai file o contratti modificati. Suite complete solo se l'utente le richiede, un rischio cross-cutting lo giustifica, o la CI fallisce.
- **Build**: non eseguire build dell'app, build Tauri, build della documentazione, E2E o installazioni di dipendenze salvo richiesta esplicita dell'utente o necessità indispensabile per diagnosticare un errore.
- **Esplorazione**: preferisci `rtk rg`, letture mirate e repomix compresso; evita scansioni o output completi non necessari al task.

### MCP Tools: code-review-graph
⚠️ **REGOLA DI INGAGGIO (OTTIMIZZAZIONE TOKEN):**
Strumenti grafo consumano molti token per esecuzione, aumentano latenza. Uso NON default.

1. **Usa strumenti MCP (es. `query_graph`, `get_impact_radius`) SOLO se:**
   - Utente chiede analisi architetturale o report impatto cross-file.
   - Devi mappare dipendenze complesse per refactoring strutturale profondo.
   - Stai esplorando parte completamente sconosciuta e interconnessa progetto.

2. **Usa comandi CLI standard (`rtk grep`, `rtk read`, `rtk ls`) o repomix come DEFAULT per:**
   - Fix locali, aggiunta componenti isolati o logica circoscritta.
   - Interventi dentro file già noti.
   - Lettura firme funzioni o ispezione file configurazione.
