-- Blocco 1, PR 6 — registrazione del lavoro svolto (#378).
-- Decisioni D22-D29 in docs-dev/BLOCCO_1_DECISIONI.md, Parte E.
--
-- Il principio che governa tutto: **lo stato corrente sta nelle tabelle di
-- dominio, la provenienza in un registro append-only**. Un fatto non si
-- modifica e non si cancella: è successo. Una metrica sì, quando cambia
-- l'input o l'algoritmo — ed è per questo che sta in una tabella a sé.

-- Storico delle traduzioni (D22) -------------------------------------------

-- Simmetrica a `transcription_revisions`, che per le trascrizioni esiste già.
-- Oggi `translations.translation_display_text` è una colonna sovrascritta in
-- place: la coppia «il modello aveva proposto X, l'umano ha approvato Y» —
-- il materiale di maggior valore per l'addestramento, e irripetibile perché è
-- un giudizio umano — non esiste da nessuna parte.
--
-- **Non una revisione per salvataggio**: si scriverebbero centinaia di righe
-- per battitura. Solo i due momenti che contano: quando il modello propone e
-- quando l'umano scrive la propria versione.
CREATE TABLE IF NOT EXISTS translation_revisions (
  id TEXT PRIMARY KEY,
  translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  -- Chi l'ha scritta. Nessuno stato di approvazione: l'approvazione si sposta,
  -- e uno storico che si modifica non è uno storico (D22).
  created_by TEXT NOT NULL CHECK (created_by IN ('model', 'human')),
  -- La revisione da cui questa deriva: da qui la coppia proposta/approvata è
  -- ricostruibile per intero, e il confronto si calcola quando serve invece di
  -- conservarlo — così non può disallinearsi dai testi.
  derived_from_revision_id TEXT REFERENCES translation_revisions(id) ON DELETE SET NULL,
  -- Impronta del testo (D25): il riferimento dice cosa c'è adesso, l'impronta
  -- cosa c'era allora.
  content_hash TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (translation_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_translation_revisions_chunk
  ON translation_revisions(translation_id, revision_number);

-- Quale revisione è approvata **adesso**: lettura veloce dello stato corrente,
-- mentre la storia di come ci si è arrivati sta negli eventi (D22).
ALTER TABLE translations ADD COLUMN approved_revision_id TEXT
  REFERENCES translation_revisions(id) ON DELETE SET NULL;

-- Il registro dei fatti (D23, D24) -----------------------------------------
--
-- `provenance_events` esisteva già, molto più povera di quanto la #378
-- richieda. Diventa colonna tutto ciò per cui si vorrà raggruppare, filtrare o
-- ordinare — l'area Analisi raggruppa per modello, per coppia linguistica, per
-- periodo, e dentro un campo JSON quelle interrogazioni non si indicizzano
-- bene. Resta in JSON (`config`) il resto: i parametri completi della chiamata.
--
-- Il costo sta qui e non in una tabella dedicata (D23): è un attributo del
-- fatto che lo ha generato, accanto a modello, token e durata. Così anche #342
-- è soddisfatta senza aggiungere un registro da riconciliare.
ALTER TABLE provenance_events ADD COLUMN outcome TEXT;
ALTER TABLE provenance_events ADD COLUMN duration_ms INTEGER;
ALTER TABLE provenance_events ADD COLUMN provider TEXT;
ALTER TABLE provenance_events ADD COLUMN model TEXT;
ALTER TABLE provenance_events ADD COLUMN prompt_version TEXT;
ALTER TABLE provenance_events ADD COLUMN input_tokens INTEGER;
ALTER TABLE provenance_events ADD COLUMN output_tokens INTEGER;
ALTER TABLE provenance_events ADD COLUMN cached_tokens INTEGER;
ALTER TABLE provenance_events ADD COLUMN estimated_cost REAL;
ALTER TABLE provenance_events ADD COLUMN source_language TEXT;
ALTER TABLE provenance_events ADD COLUMN target_language TEXT;
ALTER TABLE provenance_events ADD COLUMN error_kind TEXT;
-- Impronta di ciò che l'evento ha visto e di ciò che ha prodotto (D25).
ALTER TABLE provenance_events ADD COLUMN input_hash TEXT;
ALTER TABLE provenance_events ADD COLUMN output_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_provenance_type_time
  ON provenance_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_model
  ON provenance_events(model, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_job
  ON provenance_events(job_id);

-- Le metriche calcolate dopo (D23) -----------------------------------------
--
-- Separate dai fatti per una ragione precisa: un fatto non si invalida mai,
-- una metrica sì — quando cambia l'input o l'algoritmo che l'ha prodotta. Per
-- poterla ricalcolare in sicurezza deve dichiarare **con quale versione** è
-- stata calcolata e **su quale revisione** degli input.
CREATE TABLE IF NOT EXISTS derived_metrics (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  value REAL,
  -- Il resto del risultato quando non è un numero solo.
  detail TEXT,
  -- Versione dell'algoritmo: cambiandola, le righe vecchie si riconoscono e si
  -- rifanno invece di restare in giro come se fossero confrontabili.
  algorithm_version TEXT NOT NULL DEFAULT '1',
  -- L'impronta degli input su cui è stata calcolata: se non corrisponde più,
  -- la metrica è vecchia.
  input_hash TEXT,
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Una metrica per chiave, entità e versione dell'algoritmo: ricalcolare
  -- sostituisce invece di accumulare.
  UNIQUE (metric_key, entity_type, entity_id, algorithm_version)
);

CREATE INDEX IF NOT EXISTS idx_derived_metrics_entity
  ON derived_metrics(entity_type, entity_id);
