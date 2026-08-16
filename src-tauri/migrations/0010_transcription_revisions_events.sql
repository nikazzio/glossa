-- Blocco 1 — le revisioni di trascrizione al modello a eventi (D22).
--
-- `transcription_revisions` aveva una colonna `status` con `draft`,
-- `approved`, `rejected`: lo stesso difetto che le revisioni hanno tolto alla
-- traduzione. L'approvazione si sposta — si approva un segmento, si va avanti,
-- e più tardi si torna indietro — e uno storico che si modifica non è uno
-- storico.
--
-- Quindi: le revisioni sono testi immutabili, l'approvazione è un fatto che
-- punta a una revisione, e il segmento porta il puntatore a quella approvata
-- adesso, per la lettura veloce. È la stessa forma delle traduzioni, e serve
-- anche a questo: il costruttore di dataset (#380) tratta i due casi allo
-- stesso modo invece che come due mondi.

-- Quale revisione è approvata adesso.
ALTER TABLE transcription_segments ADD COLUMN approved_revision_id TEXT
  REFERENCES transcription_revisions(id) ON DELETE SET NULL;

-- La tabella si rifà invece di essere modificata: SQLite non toglie una
-- colonna che porta un vincolo, e qui non c'è niente da conservare — nessun
-- codice ha mai scritto una revisione di trascrizione.
CREATE TABLE transcription_revisions_new (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES transcription_segments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  -- Chi l'ha scritta. Nessuno stato: approvare e ritirare sono fatti (D22).
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ocr', 'import')),
  -- La revisione da cui questa deriva, come per le traduzioni.
  derived_from_revision_id TEXT REFERENCES transcription_revisions(id) ON DELETE SET NULL,
  -- Impronta del testo (D25): il riferimento dice cosa c'è adesso, l'impronta
  -- cosa c'era allora.
  content_hash TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (segment_id, revision_number)
);

INSERT INTO transcription_revisions_new
  (id, segment_id, revision_number, text, created_by, created_at)
SELECT id, segment_id, revision_number, text, created_by, created_at
  FROM transcription_revisions;

-- Quello che `status` diceva diventa il puntatore del segmento: l'ultima
-- revisione approvata resta approvata, il resto era già solo storia.
UPDATE transcription_segments
   SET approved_revision_id = (
     SELECT r.id FROM transcription_revisions r
      WHERE r.segment_id = transcription_segments.id AND r.status = 'approved'
      ORDER BY r.revision_number DESC LIMIT 1
   );

DROP TABLE transcription_revisions;
ALTER TABLE transcription_revisions_new RENAME TO transcription_revisions;

CREATE INDEX IF NOT EXISTS idx_transcription_revisions_segment
  ON transcription_revisions(segment_id, revision_number);
