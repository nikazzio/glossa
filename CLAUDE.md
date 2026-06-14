# Glossa — Istruzioni per lo sviluppo

## Stato del progetto
Sviluppo attivo (pre-1.0). Priorità assoluta alla modalità documento/editoriale. La UI sandbox si tocca solo per regressioni bloccanti.

## Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, Vite
- **Backend**: Rust (Tauri v2), SQLite via SQLx, reqwest
- **Test**: Vitest + Testing Library (Frontend), tokio-test + wiremock (Backend)

## Principi Fondamentali
- **Semplicità**: Codice minimo necessario. Nessuna feature speculativa per il futuro.
- **Leggibilità**: Nomi descrittivi. Commenti riservati a logiche non ovvie, vincoli nascosti o workaround.
- **Immutabilità**: Non mutare oggetti esistenti (preferisci `let` a `let mut`, usa spread operator e metodi funzionali in JS).
- **File**: Max 400-800 righe. Organizzazione per dominio/feature, non per tipo di file.
- **TypeScript**: Tipi espliciti (mai `any`), costanti nominate. Gestione esplicita di `null`/`undefined`. Validazione rigorosa degli input esterni.
- **Rust**: Nessun `.unwrap()` in produzione. Uso sistematico di `?` e `thiserror`. Formattazione e linting rigorosi (`cargo fmt`, zero warning `clippy`). Evita `clone()` inutili.
- **Architettura**: Handler backend snelli (logica nei moduli di dominio). Frontend con hook custom; Zustand riservato allo stato globale reale.

## Invarianti della Pipeline
- **Prefix Caching (CRITICO)**: L'ordine dei blocchi nel system prompt (`static → blob → stage-instructions`) **non si cambia mai**. L'inversione spezza la cache del provider e moltiplica i costi.

## Documentazione e Stato
- **Architettura**: Aggiorna `docs-dev/ARCHITECTURE.md` per modifiche ai flussi, comandi Tauri, schemi DB o store Zustand.
- **UI**: Consulta `docs-dev/UI_DESIGN_SYSTEM.md` prima di qualsiasi modifica visiva.
- **Avanzamento**: Leggi `STATO_SESSIONE.md` a inizio sessione e aggiornalo obbligatoriamente a fine task/feature. Aggiorna l'help in-app per modifiche funzionali.

## Git e Test
- **Git**: Aggiorna sempre `main` prima di creare un branch (`git checkout main && git pull origin main && git checkout -b nome-branch`).
- **Test**: Approccio TDD. Copertura minima 80%. Nomi dei test descrittivi sul comportamento atteso. Mai sopprimere gli errori in silenzio.

---

## Strumenti e Ottimizzazione Token

### Repomix (Esplorazione Iniziale)
Prima di analizzare porzioni di codebase estese o poco conosciute, usa **repomix** (`skill repomix-commands:pack-local`).
- **Scopo**: Ottenere una vista compatta e indicizzata dell'intero progetto in un'unica operazione, azzerando le costose catene esplorative di file system e risparmiando token.

### RTK (Rust Token Killer) - Filtro Output CLI
Per prevenire l'esaurimento della finestra di contesto, **ogni comando da terminale deve iniziare con `rtk`**. 

`rtk` intercetta l'output, filtra la verbosità e restituisce formati iper-compatti, risparmiando dal 60% al 90% dei token.
- **Uso corretto**: `rtk cargo test`, `rtk grep pattern`, `rtk read file.ts`
- **Catene**: Anche con `&&`, applica a ogni step: `rtk git add . && rtk git commit -m "msg" && rtk git push`

### MCP Tools: code-review-graph
⚠️ **REGOLA DI INGAGGIO (OTTIMIZZAZIONE TOKEN):**
Gli strumenti del grafo consumano elevati token per esecuzione e aumentano la latenza. Il loro uso NON è il default.

1. **Usa gli strumenti MCP (es. `query_graph`, `get_impact_radius`) SOLO se:**
   - L'utente chiede un'analisi architetturale o un report di impatto cross-file.
   - Devi mappare dipendenze complesse per un refactoring strutturale profondo.
   - Stai esplorando una parte completamente sconosciuta e interconnessa del progetto.

2. **Usa i comandi CLI standard (`rtk grep`, `rtk read`, `rtk ls`) o repomix come DEFAULT per:**
   - Fix locali, aggiunta di componenti isolati o logica circoscritta.
   - Interventi all'interno di file già noti.
   - Lettura di firme di funzioni o ispezione di file di configurazione.
