# Glossa — MVP Tasks

> Roadmap attiva e priorità operative.
> Aggiornata al 2026-04-26 dopo il merge della PR `#40` (S4-T4) e della PR `#41` (import `docx`/`pdf`) su `main`.

---

## Valutazione oggettiva

- Il repo non è più un wireframe fragile: lo Sprint 1 è chiuso, `S4-T1`, `S4-T2`, `S4-T3` e `S4-T4` risultano integrati su `main`.
- Il frontend è in uno stato sano per continuare il refactor: `npm run lint`, `npm test` e `npm run build` sono verdi; i test Vitest passano (`56/56`) e i test Rust su `documents` (`5/5`).
- Il workflow documento è ora il default operativo: autosave con stato esplicito, anteprima import multi-formato (`txt` / `md` / `docx` / `pdf`), split manuale del chunk e promozione esplicita da Sandbox a Documento sono tutti su `main`. Il pezzo residuo è la semplificazione profonda dei pannelli di `DocumentView` (drawer audit/indice, riordino superfici), tracciato come `S4-T4b`.
- Priorità reale oggi:
  1. chiudere `S4-T4b` (semplificazione `DocumentView` con drawer/pannelli a scomparsa) per consolidare la UX documento prima di aprire nuove superfici;
  2. sopra quella base, aggiungere librerie riusabili e rifiniture UX (`S4-T5a`, `S4-T5b`, `S4-T6`);
  3. prima della prima release pubblica, chiudere i blocker di stabilità, sicurezza e packaging (`S2-*`);
  4. solo dopo, affrontare il refactor profondo di `llm.rs` e il resto della qualità interna (`S3-*`).

In breve: se la domanda è "cosa fare adesso?", la risposta non è Sprint 2 o Sprint 3. La risposta è chiudere `S4-T4b` (drawer audit/indice in `DocumentView`) prima di passare a `S4-T5`.

---

## Come usare questo file

- Questo documento è ordinato per **priorità corrente**, non per cronologia.
- Gli ID esistenti (`S2-T4`, `S4-T3`, ecc.) restano invariati per continuità.
- Stati ammessi:
  - `da fare`
  - `in corso`
  - `in verifica`
  - `completata`
- Regola operativa:
  - non aprire nuove superfici UX finché non sono chiusi i fondamenti strutturali;
  - non lavorare sul refactor profondo backend finché il flusso utente MVP non è stabile.

---

## Stato attuale del repo

### Gia chiuso

- `S1-T1` CSP Tauri
- `S1-T2` restrizione capability filesystem
- `S1-T3` cancellazione stream lato Rust
- `S1-T4` sanitizzazione errori provider
- `S1-T5` idempotenza `runPipeline` / `runAuditOnly`
- `S4-T1` protezione dei blocchi completati
- `S4-T2` rilancio per blocco e drill-down audit
- `S4-T3` split degli store (`uiStore` / `pipelineStore` / `chunksStore`) e selettore Sandbox/Documento
- `S4-T4` workflow documento, anteprima import multi-formato (`txt` / `md` / `docx` / `pdf`), split manuale del chunk e autosave con stato esplicito

### Evidenze concrete nel codice

- `src/App.tsx` usa gia `runSingleChunk` e `auditSingleChunk` e commuta tra `Sandbox` e `Documento`.
- `src/stores/chunksStore.ts` e `src/stores/uiStore.ts` esistono gia e hanno assorbito runtime dei blocchi, view mode e selezione corrente.
- `src/components/document/DocumentView.tsx` introduce gia una lettura dedicata con navigazione chunk e layout `Standard` / `Book` / `Auto`.
- `src/services/projectService.ts` e `src/stores/projectStore.ts` persistono gia `view_mode`, ma salvataggio e import restano ancora troppo semplici per il flusso "documento reale".

---

## Priorita 0 — Refactor UX core

> Questo e il lavoro attuale. Va finito prima di aprire nuove feature laterali.

### Sequenza consigliata

1. `S4-T4b` — semplificazione `DocumentView` con drawer/pannelli a scomparsa
2. `S4-T5a` — libreria prompt
3. `S4-T5b` — dizionari riusabili
4. `S4-T6` — export combinato e polish UX

### S4-T4 — Workflow documento, anteprima import, split manuale e autosave

- **Stato**: `completata`
- **Mergiata in**: PR `#40` (workflow / anteprima import / autosave / split manuale) e PR `#41` (estrattori `docx` / `pdf`).
- **Cosa è dentro**:
  - modalità `Documento` come default operativo, con default coerente anche all'apertura di progetti vuoti (`src/stores/uiStore.ts`, `src/stores/projectStore.ts`);
  - autosave per progetti esistenti con stato esplicito `draft` / `dirty` / `saving` / `saved` / `error`, hook dedicato (`src/hooks/useProjectAutosave.ts`, snapshot cachato durante `isProcessing` per evitare `JSON.stringify` ad ogni token) e indicatore in header (`src/components/layout/Header.tsx`);
  - `ImportPreviewDialog` per `txt`, `md`, `text`, `docx` e `pdf` con stima parole/paragrafi/chunk e regolazione segmentazione prima della conferma (`src/components/document/ImportPreviewDialog.tsx`, `src/services/fileService.ts`, `src/utils/documentWorkflow.ts`); l'estrazione testuale di `docx` e `pdf` è gestita da comandi Tauri dedicati su `spawn_blocking` (`src-tauri/src/documents.rs`);
  - promozione esplicita da Sandbox a Documento via "apri nel lettore documento" (`src/components/pipeline/ProductionStream.tsx`);
  - split manuale del chunk con preview A/B basata su cursore (`src/components/document/DocumentView.tsx`, `splitChunkAt` in `src/stores/chunksStore.ts`).
- **Spostato a `S4-T4b`**: la semplificazione profonda dei pannelli di `DocumentView` (drawer audit/indice, riordino superfici) è scorporata in un task dedicato per non bloccare il merge del workflow.

### S4-T4b — Semplificazione `DocumentView` (drawer audit/indice)

- **Stato**: `da fare`
- **Priorità**: prima cosa del blocco UX core, prosegue il lavoro di `S4-T4`.
- **Esito atteso**:
  - testo al centro come superficie dominante;
  - trace degli stage compatta, sempre visibile;
  - indice chunk e audit nello stesso pannello laterale a scomparsa, non più sempre aperti nel flusso verticale;
  - colonna `PipelineConfig` meno dominante quando si è in Documento.
- **Accettazione**:
  - in Documento il canvas centrale è il testo, mentre indice chunk e audit non occupano in modo fisso il canvas centrale.

### S4-T5a — Libreria di modelli di prompt

- **Stato**: `da fare`
- **Priorita**: alta, ma solo dopo `S4-T3` e `S4-T4`
- **Motivo**: e una feature ad alto valore per l'utente esperto, ma non ripara i difetti strutturali del flusso documento.
- **Esito atteso**:
  - tabella `prompt_templates`;
  - editor prompt dedicato;
  - salvataggio/caricamento cross-project;
  - variabili evidenziate e contatore token approssimativo.

### S4-T5b — Dizionari riusabili

- **Stato**: `da fare`
- **Priorita**: alta, ma dipende dalla stabilizzazione del flusso progetto
- **Motivo**: il database ha gia strutture parziali (`glossaries`, `glossary_entries`, `project_glossaries`), ma la UX e il servizio non sono ancora portati a compimento.
- **Esito atteso**:
  - CRUD dizionari;
  - collegamento molti-a-molti ai progetti;
  - migrazione morbida del glossario in memoria verso dizionari persistenti.

### S4-T6 — Esportazione combinata e rifiniture UX

- **Stato**: `da fare`
- **Priorita**: ultima del blocco UX core
- **Motivo**: e polishing utile, ma non e il primo collo di bottiglia del flusso utente.
- **Esito atteso**:
  - export combinato con opzioni;
  - warning chiari sui chunk mancanti;
  - empty state migliore;
  - badge stati blocco piu chiari.

---

## Priorita 1 — Blocker prima della release pubblica

> Questi task non sono il focus di implementazione di oggi, ma bloccano una release pubblica credibile.

### Ordine consigliato

1. `S2-T4` — watchdog frontend su stream bloccato
2. `S2-T5` — whitelist `ensureColumn`
3. `S2-T2` — audit dipendenze nel CI
4. `S2-T1` — build macOS nel workflow release
5. `S2-T3` — profilo release Cargo

### S2-T4 — Watchdog frontend su chunk bloccato

- **Stato**: `da fare`
- **Perche e un blocker**: se uno stream resta appeso, l'app sembra viva ma il lavoro dell'utente si ferma in stato zombie.

### S2-T5 — Whitelist di tabelle e colonne in `ensureColumn`

- **Stato**: `da fare`
- **Perche e un blocker**: oggi `dbService.ts` interpola `table` e `column` senza whitelist. Il rischio attuale e basso, ma il pattern va chiuso prima di espandere le migrazioni.

### S2-T2 — Audit dipendenze nel CI

- **Stato**: `da fare`
- **Perche e un blocker**: senza `npm audit` / `cargo audit` automatici, il repo non ha un presidio continuo sulle regressioni di supply chain.

### S2-T1 — Build macOS nel workflow di release

- **Stato**: `da fare`
- **Perche e un blocker**: il README promette output macOS, ma il documento precedente segnalava che il workflow non li produce ancora in modo coerente.

### S2-T3 — Profilo release ottimizzato in Cargo

- **Stato**: `da fare`
- **Perche e secondario**: utile per dimensione e ottimizzazione del binario, ma non corregge un rischio funzionale o UX.

---

## Priorita 2 — Qualita interna dopo stabilizzazione UX

> Importante, ma non sul critical path del refactor UX attuale.

### S3-T1 — Refactor di `llm.rs` con trait `LlmProvider`

- **Stato**: `da fare`
- **Nota**: e il refactor tecnico piu pesante del repo. Va affrontato quando il contratto UX dell'MVP e gia stabile.

### S3-T2 — Idle timeout sullo stream HTTP

- **Stato**: `da fare`

### S3-T3 — Test end-to-end della pipeline con provider mock

- **Stato**: `da fare`

### S3-T4 — Test di integrazione frontend

- **Stato**: `da fare`

### S3-T5 — Allineare il timeout di Ollama

- **Stato**: `da fare`

---

## Completati

### Sprint 1 — Sicurezza e robustezza

- [x] `S1-T1` — Content Security Policy attiva (`61b40b3`)
- [x] `S1-T2` — Capability filesystem ristrette (`9776536`)
- [x] `S1-T3` — Cancellazione stream lato Rust (`8944c19`)
- [x] `S1-T4` — Sanitizzazione errori provider (`a434da1`)
- [x] `S1-T5` — Idempotenza pipeline (`e05c002`)

### Refactor UX gia integrato

- [x] `S4-T1` — Protezione dei blocchi completati (`190aa11`)
- [x] `S4-T2` — Rilancio per blocco e drill-down audit (`572dd17`)
- [x] `S4-T3` — Suddivisione store e selettore Sandbox/Documento

---

## Backlog post-MVP

- `B-1` — Cifrare SQLite con SQLCipher
- `B-2` — Logging strutturato attivabile in release
- `B-3` — Crash reporting opt-in
- `B-4` — `optimize_prompt` allineato alle impostazioni utente
- `B-5` — Memoizzazione di `useJudgeModelOptions`
- `B-6` — Ulteriore split di componenti molto lunghi se tornano a crescere
- `B-7` — Rimuovere `console.log` da `dbService.ts`
- `B-8` — Garanzia di init i18n prima del primo render
- `B-9` — Import `.docx` e `.pdf`

---

## Decisione operativa

Se il focus resta il refactor che stai gia implementando, il prossimo lavoro corretto e:

1. chiudere i residui di `S4-T4` (import `docx`/`pdf` e drawer audit/indice)
2. poi scegliere fra `S4-T5a` e `S4-T5b` in base a cosa vuoi rendere riusabile per primo

Se invece il focus cambia da "finire il refactor" a "spedire una prima release pubblica", allora dopo `S4-T4` vanno anticipati `S2-T4`, `S2-T5` e `S2-T2`.
