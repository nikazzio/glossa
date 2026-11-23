-- Note della pagina di trascrizione (#502, #503): separate dal testo, legate
-- alla pagina e non a una sua versione. Lo stato «agganciata / da
-- riagganciare» non si salva: si ricava dal testo corrente cercando la
-- `occurrence`-esima ripetizione di `passage`.
CREATE TABLE IF NOT EXISTS transcription_notes (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES transcription_segments(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('emendation', 'doubt', 'addition', 'correction', 'typography', 'abbreviation', 'note')),
  content TEXT NOT NULL DEFAULT '',
  passage TEXT,
  occurrence INTEGER CHECK (occurrence IS NULL OR occurrence >= 1),
  origin TEXT NOT NULL CHECK (origin IN ('model', 'user')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transcription_notes_segment ON transcription_notes(segment_id);

-- La lettura automatica chiede le note come note a piè di pagina e le sposta
-- nella scheda Note. Acceso all'inizio.
ALTER TABLE workspaces ADD COLUMN ocr_separate_notes INTEGER NOT NULL DEFAULT 1;
