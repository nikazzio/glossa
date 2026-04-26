# Glossa — MVP Tasks

> Roadmap attiva e priorità operative.
> Aggiornata al 2026-04-26 sulla base del branch `feat/s4-t3-document-book-view`, del file Repomix, della PR `#39` e dei test frontend correnti.

---

## Valutazione oggettiva

- Il repo non è più un wireframe fragile: lo Sprint 1 è chiuso, `S4-T1` e `S4-T2` risultano già integrati su `main` (`190aa11`, `572dd17`).
- Il frontend è in uno stato sano per continuare il refactor: `npm run lint` e `npm test` sono verdi; i test Vitest passano (`46/46`).
- Il file precedente era dettagliato, ma non era più un buon strumento di prioritizzazione:
  - ordinava il lavoro per storia degli sprint, non per focus attuale;
  - lasciava il refactor UX in fondo anche se è il track già in corso;
  - marcava `S4-T2` come ancora aperto, mentre il codice e i test mostrano il contrario.
- Priorità reale oggi:
  1. chiudere la base strutturale del refactor UX documento (`S4-T3`, `S4-T4`);
  2. sopra quella base, aggiungere librerie riusabili e rifiniture UX (`S4-T5a`, `S4-T5b`, `S4-T6`);
  3. prima della prima release pubblica, chiudere i blocker di stabilità, sicurezza e packaging (`S2-*`);
  4. solo dopo, affrontare il refactor profondo di `llm.rs` e il resto della qualità interna (`S3-*`).

In breve: se la domanda è "cosa fare adesso?", la risposta non è Sprint 2 o Sprint 3. La risposta è completare il refactor UX già in atto, con la modalità Documento come home reale del prodotto.

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

### Evidenze concrete nel codice

- `src/App.tsx` usa gia `runSingleChunk` e `auditSingleChunk` e commuta tra `Sandbox` e `Documento`.
- `src/stores/chunksStore.ts` e `src/stores/uiStore.ts` esistono gia e hanno assorbito runtime dei blocchi, view mode e selezione corrente.
- `src/components/document/DocumentView.tsx` introduce gia una lettura dedicata con navigazione chunk e layout `Standard` / `Book` / `Auto`.
- `src/services/projectService.ts` e `src/stores/projectStore.ts` persistono gia `view_mode`, ma salvataggio e import restano ancora troppo semplici per il flusso "documento reale".

---

## Priorita 0 — Refactor UX core

> Questo e il lavoro attuale. Va finito prima di aprire nuove feature laterali.

### Sequenza consigliata

1. `S4-T3` — split degli store e selettore Sandbox/Documento
2. `S4-T4` — workflow documento, preview import, split manuale, autosave
3. `S4-T5a` — libreria prompt
4. `S4-T5b` — dizionari riusabili
5. `S4-T6` — export combinato e polish UX

### S4-T3 — Suddivisione degli store e selettore Sandbox/Documento

- **Stato**: `in verifica`
- **Perche adesso**: e la base che rende sostenibili i punti successivi. Senza questo split, `S4-T4` aggiunge altra complessita su uno store gia troppo carico.
- **Problema reale**:
  - `pipelineStore` tiene insieme stato UI, configurazione persistente, runtime dei chunk, flags di elaborazione e stato modali;
  - l'app ha ancora un solo layout principale, mentre il caso "sandbox breve" e il caso "documento lungo" hanno bisogni diversi.
- **Esito atteso**:
  - `uiStore` per modalita, modali e stato volatile;
  - `pipelineStore` ridotto alla configurazione persistente;
  - `chunksStore` per blocchi, processing e dirty state;
  - selettore `[Sandbox | Documento]` in testata, inerte durante `isProcessing`;
  - dentro `DocumentView`, variante di layout `Book` come opzione di lettura per schermi ampi, con default `auto` che la attiva quando c'e abbastanza spazio.
- **Accettazione**:
  - cambiare modalita non distrugge i blocchi;
  - aprendo un progetto la modalita viene derivata correttamente;
  - in Sandbox un progetto multi-blocco non viene perso, ma presentato come vista ridotta con invito a passare a Documento;
  - in Documento il flusso di lettura non e piu una colonna infinita di chunk, ma una vista di dettaglio con navigazione esplicita.

### S4-T4 — Workflow documento, anteprima import, split manuale e autosave

- **Stato**: `da fare`
- **Perche subito dopo `S4-T3`**: e il vero salto da demo a strumento usabile su documenti reali. Oggi il rischio non e solo la perdita lavoro: e anche un ingresso troppo debole nel flusso documento e una UI ancora troppo dispersiva.
- **Problema reale**:
  - la Sandbox e ancora troppo visibile rispetto al caso d'uso principale, che ormai e il documento;
  - import: inserisce testo senza preview del chunking e senza profilo esplicito di segmentazione;
  - split: il comando va reso controllabile dall'utente, non implicito o automatico;
  - save: solo manuale;
  - project state: nessun concetto robusto di `dirty`, `saving`, `saved`;
  - in Documento ci sono ancora troppi pannelli persistenti che competono con il testo.
- **Esito atteso**:
  - la modalità `Documento` diventa la home reale del workspace;
  - la `Sandbox` resta disponibile ma come feature secondaria, con azione chiara per convertire il testo corrente in documento;
  - `ImportPreviewDialog` per `txt`, `md`, `docx`, `pdf`, con stima blocchi/parole e scelta del profilo di segmentazione prima della conferma;
  - `SplitChunkDialog` o flow equivalente, basato su selezione/cursore, con preview di `Chunk A` e `Chunk B` prima del commit;
  - `useAutosave` con debounce e sospensione durante processing;
  - persistenza incrementale dei chunk modificati;
  - indicatore in header: `salvato` / `modifiche non salvate` / `salvataggio in corso`;
  - semplificazione della `DocumentView`:
    - testo al centro come superficie dominante;
    - trace degli stage in alto, compatta e sempre visibile;
    - navigazione chunk in basso;
    - indice chunk e audit nello stesso pannello laterale a scomparsa;
    - configurazione pipeline meno dominante, non piu colonna primaria sempre aperta.
- **Accettazione**:
  - aprendo l'app il focus iniziale e Documento, non Sandbox;
  - la Sandbox puo essere usata come scratchpad rapido, ma il testo inserito puo essere promosso a documento senza perdita di contenuto;
  - importare un file mostra la preview prima di mutare lo stato e consente di confermare o annullare;
  - la preview d'import rende visibili almeno numero stimato di chunk e granularita prevista;
  - dividere un chunk richiede una scelta esplicita del punto di split e mostra l'esito prima della conferma;
  - chiusura e riapertura senza save manuale non comporta perdita del lavoro gia nominato;
  - il primo save richiede il nome progetto una sola volta;
  - in Documento il testo resta la superficie principale, mentre indice chunk e audit non occupano in modo fisso il canvas centrale.

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

1. `S4-T3`
2. `S4-T4`
3. poi scegliere fra `S4-T5a` e `S4-T5b` in base a cosa vuoi rendere riusabile per primo

Se invece il focus cambia da "finire il refactor" a "spedire una prima release pubblica", allora dopo `S4-T4` vanno anticipati `S2-T4`, `S2-T5` e `S2-T2`.
