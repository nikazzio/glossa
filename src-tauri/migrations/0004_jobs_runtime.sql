-- Blocco 1, PR 2 — motore dei lavori in background (#218).
-- Decisioni in docs-dev/BLOCCO_1_DECISIONI.md, parte C.
--
-- La tabella `jobs` esiste dalla baseline con gli otto stati, la priorità, il
-- proprietario, le dipendenze e i tentativi: qui si aggiunge solo ciò che serve
-- al runtime. Come la 0003, è un file nuovo: il consolidamento in un'unica
-- baseline pulita si fa una volta sola prima del primo uso reale.

-- jobs ----------------------------------------------------------------------

-- A che punto era il lavoro (D13). Un lavoro riprendibile lo salva al confine
-- di ogni unità di lavoro; senza, la ripresa ripartirebbe da zero.
ALTER TABLE jobs ADD COLUMN checkpoint TEXT DEFAULT NULL;

-- Un errore non è una stringa (D16): la classificazione decide se ritentare e
-- quanto attendere, il messaggio serve solo a mostrarlo.
ALTER TABLE jobs ADD COLUMN error_kind TEXT DEFAULT NULL;

-- Quando il lavoro può essere ripreso in considerazione. Regge l'attesa fra un
-- tentativo e l'altro (D16): un 403 su Gallica significa "stai correndo
-- troppo", si riprova dopo un raffreddamento lungo, non subito.
ALTER TABLE jobs ADD COLUMN next_attempt_at DATETIME DEFAULT NULL;

-- Stima di quanto manca, in secondi. Obbligatoria (D17): un lavoro che dura un
-- quarto d'ora senza stima sembra bloccato.
ALTER TABLE jobs ADD COLUMN eta_seconds INTEGER DEFAULT NULL;

-- Perché il lavoro è fermo pur essendo in esecuzione (D17, D18). "In attesa per
-- rispettare i limiti della biblioteca" e "in errore" sono la stessa immobilità
-- con due significati opposti: senza questa colonna l'interfaccia non può
-- distinguerli.
ALTER TABLE jobs ADD COLUMN waiting_reason TEXT DEFAULT NULL;

-- La coda si legge a ogni giro dell'orchestratore: priorità più alta prima, poi
-- ordine di arrivo.
CREATE INDEX IF NOT EXISTS idx_jobs_queue
  ON jobs(status, priority DESC, created_at);

-- Impostazioni ---------------------------------------------------------------

-- Limiti per classe di risorsa (D11): saturano cose diverse, quindi non c'è un
-- numero solo. Il disco resta a 1 — due lavori che scrivono gigabyte insieme
-- sono più lenti di due in fila. `0` significa automatico: per il processore,
-- i processori disponibili meno uno.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('jobs_limit_network', '2');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('jobs_limit_cpu', '0');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('jobs_limit_disk', '1');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('jobs_limit_language_service', '1');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('jobs_limit_documents', '1');

-- Alla riapertura nessun lavoro riparte da solo (D13). Unica eccezione, a
-- richiesta esplicita: gli scaricamenti interrotti. Spenta di default —
-- riaprire l'app e vedere partire cinque scaricamenti che non ricordavi è
-- ostile.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_resume_downloads', '0');
