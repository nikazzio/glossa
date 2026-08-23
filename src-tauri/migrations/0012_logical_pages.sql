-- Copia digitale → pagina logica → rappresentazione file (D34).
--
-- La pagina è l'ancora editoriale stabile: un'immagine può essere riscaricata,
-- ottimizzata o sostituita senza spostare trascrizioni e annotazioni future.

CREATE TABLE source_pages (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT,
  canvas_url TEXT,
  homepage_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_version_id, position),
  UNIQUE (source_version_id, canvas_url)
);

CREATE INDEX idx_source_pages_version_position
  ON source_pages(source_version_id, position);

-- La disponibilità riguarda l'intera copia, non uno dei suoi file.
ALTER TABLE source_versions ADD COLUMN availability TEXT NOT NULL DEFAULT 'catalogued'
  CHECK (availability IN ('catalogued', 'partial', 'complete'));

-- Manifest e PDF appartengono alla copia; le immagini e i derivati possono
-- appartenere a una sua pagina logica. `locality` descriveva in modo ambiguo
-- l'origine: il nome nuovo distingue meglio remoto, importato e derivato.
ALTER TABLE assets RENAME COLUMN locality TO origin;
ALTER TABLE assets ADD COLUMN source_page_id TEXT REFERENCES source_pages(id) ON DELETE CASCADE;
ALTER TABLE assets ADD COLUMN mime_type TEXT;
ALTER TABLE assets ADD COLUMN width INTEGER;
ALTER TABLE assets ADD COLUMN height INTEGER;

DROP INDEX IF EXISTS idx_assets_version_page;
ALTER TABLE assets DROP COLUMN page_index;
ALTER TABLE assets DROP COLUMN page_label;
ALTER TABLE assets DROP COLUMN homepage_url;
ALTER TABLE assets DROP COLUMN availability;

CREATE INDEX idx_assets_page_size
  ON assets(source_page_id, size_tag);

-- Il vecchio link rendeva la trascrizione dipendente da un file particolare.
-- La futura trascrizione userà `source_page_id` e, se necessario, un'area.
ALTER TABLE transcription_segments ADD COLUMN source_page_id TEXT REFERENCES source_pages(id) ON DELETE SET NULL;
ALTER TABLE transcription_segments DROP COLUMN asset_id;
