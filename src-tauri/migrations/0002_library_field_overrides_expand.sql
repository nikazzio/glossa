-- Generalizza le correzioni a mano dell'opera da 5 a tutti i campi
-- anagrafici (12 esistenti + 8 nuovi, ricercati sugli standard di
-- catalogazione bibliotecaria). "kind" smette di essere un enum fisso: resta
-- solo la natura fisica dell'originale (manoscritto/stampa/altro), il
-- formato del file è già tracciato per copia su source_versions.version_kind
-- e non ha bisogno di un campo anagrafico separato.
--
-- SQLite non permette di alterare un CHECK esistente: si ricostruisce la
-- tabella, si copiano i dati, si rinomina.

PRAGMA foreign_keys=OFF;

CREATE TABLE sources_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind <> ''),
  primary_language TEXT,
  description TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sources_new (id, title, kind, primary_language, description, external_ref, status, archived_at, created_at, updated_at)
  SELECT id, title, kind, primary_language, description, external_ref, status, archived_at, created_at, updated_at FROM sources;

DROP TABLE sources;
ALTER TABLE sources_new RENAME TO sources;

CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);

CREATE TABLE source_field_overrides_new (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN (
    -- I 12 campi anagrafici già in scheda oggi.
    'title', 'kind', 'primary_language', 'creator', 'date',
    'publisher', 'contributors', 'rights', 'physical_description', 'subjects', 'volume', 'description',
    -- Gli 8 nuovi, dalla ricerca su Dublin Core/MARC21/manifesti IIIF reali.
    'origin_place', 'provenance', 'notes', 'series', 'genre_form', 'standard_identifier', 'coverage', 'related_works'
  )),
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, field)
);

INSERT INTO source_field_overrides_new (source_id, field, value, updated_at)
  SELECT source_id, field, value, updated_at FROM source_field_overrides;

DROP TABLE source_field_overrides;
ALTER TABLE source_field_overrides_new RENAME TO source_field_overrides;

PRAGMA foreign_keys=ON;
