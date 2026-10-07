-- Incremental corpus upgrade. Existing baseline and its checksum stay unchanged.
-- SQLx runs the entire migration in a transaction; no reset or paid API calls.
ALTER TABLE phrase_memory RENAME TO phrase_memory_previous;
DROP INDEX idx_phrase_memory_chunk_project;

-- Unità testuali e revisioni indipendenti dalla memoria traduttiva.
CREATE TABLE IF NOT EXISTS text_units (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  source_version_id TEXT REFERENCES source_versions(id) ON DELETE SET NULL,
  parent_unit_id TEXT REFERENCES text_units(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  provenance TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provenance)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS text_unit_revisions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES text_units(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('source', 'translation', 'normalized')),
  language TEXT NOT NULL CHECK (length(trim(language)) > 0),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) > 0),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(unit_id, role, language, revision_number),
  UNIQUE(unit_id, id)
);

CREATE TRIGGER IF NOT EXISTS text_unit_revisions_immutable
BEFORE UPDATE ON text_unit_revisions
BEGIN
  SELECT RAISE(ABORT, 'Text revisions are immutable; create a new revision');
END;

CREATE TABLE IF NOT EXISTS text_embeddings (
  revision_id TEXT NOT NULL REFERENCES text_unit_revisions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  profile TEXT NOT NULL CHECK (length(trim(profile)) > 0),
  embedding BLOB NOT NULL CHECK (length(embedding) = dimensions * 4),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(revision_id, provider, model, dimensions, profile)
);
CREATE INDEX IF NOT EXISTS idx_text_embeddings_profile
  ON text_embeddings(provider, model, dimensions, profile, revision_id);

CREATE TABLE IF NOT EXISTS text_unit_tags (
  unit_id TEXT NOT NULL REFERENCES text_units(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(unit_id, name)
);

CREATE TABLE IF NOT EXISTS phrase_memory (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL UNIQUE REFERENCES text_units(id) ON DELETE CASCADE,
  source_revision_id TEXT NOT NULL,
  target_revision_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  author TEXT,
  work TEXT,
  domain TEXT,
  notes TEXT,
  chunk_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(unit_id, source_revision_id) REFERENCES text_unit_revisions(unit_id, id),
  FOREIGN KEY(unit_id, target_revision_id) REFERENCES text_unit_revisions(unit_id, id)
);
CREATE INDEX IF NOT EXISTS idx_phrase_memory_chunk_project ON phrase_memory(chunk_id, project_id);


-- Provenance is reconstructed only from recorded links; no filename inference.
INSERT INTO text_units(id, source_id, source_version_id, workspace_id, provenance, created_at)
SELECT 'unit:' || pm.id, sv.source_id, sv.id, p.workspace_id,
  json_object('projectId', pm.project_id, 'projectName', p.name,
    'chunkId', pm.chunk_id, 'chunkPosition', t.position,
    'workspaceId', p.workspace_id, 'workspaceName', w.name,
    'sourceId', sv.source_id, 'sourceVersionId', sv.id,
    'sourceTitle', s.title, 'sourceVersionLabel', sv.label,
    'quote', pm.source_phrase), pm.created_at
FROM phrase_memory_previous pm
LEFT JOIN projects p ON p.id = pm.project_id
LEFT JOIN workspaces w ON w.id = p.workspace_id
LEFT JOIN translations t ON t.id = pm.chunk_id AND t.project_id = pm.project_id
LEFT JOIN translation_origins o ON o.project_id = pm.project_id
LEFT JOIN transcription_documents d ON d.id = o.transcription_document_id
LEFT JOIN source_versions sv ON sv.id = COALESCE(o.source_version_id, d.source_version_id)
LEFT JOIN sources s ON s.id = sv.source_id;

-- FNV-1a over UTF-8 bytes, identical to the native revision writer.
-- Two unsigned 32-bit halves avoid SQLite's signed overflow-to-REAL behavior.
WITH RECURSIVE
texts(id, unit_id, role, language, text, created_at) AS (
  SELECT 'source:' || id, 'unit:' || id, 'source', source_language, source_phrase, created_at
    FROM phrase_memory_previous
  UNION ALL
  SELECT 'target:' || id, 'unit:' || id, 'translation', target_language, target_phrase, created_at
    FROM phrase_memory_previous
),
bytes(id, unit_id, role, language, text, created_at, encoded) AS (
  SELECT *, hex(CAST(text AS BLOB)) FROM texts
),
hashes(id, position, low, high) AS (
  SELECT id, 0, 2216829733, 3421674724 FROM bytes
  UNION ALL
  SELECT h.id, h.position + 1,
    (((h.low | ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))
      - (h.low & ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))) * 435) % 4294967296,
    (h.high * 435
      + ((h.low | ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))
      - (h.low & ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))) * 256
      + (((h.low | ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))
      - (h.low & ((instr('0123456789ABCDEF', substr(b.encoded, h.position*2+1, 1))-1)*16
      + instr('0123456789ABCDEF', substr(b.encoded, h.position*2+2, 1))-1))) * 435) / 4294967296
    ) % 4294967296
  FROM hashes h JOIN bytes b ON b.id = h.id
  WHERE h.position < length(b.encoded)/2
)
INSERT INTO text_unit_revisions(id, unit_id, role, language, text, content_hash, revision_number, created_at)
SELECT b.id, b.unit_id, b.role, b.language, b.text,
  printf('%08x%08x', h.high, h.low), 1, b.created_at
FROM bytes b JOIN hashes h ON h.id = b.id AND h.position = length(b.encoded)/2;

INSERT INTO phrase_memory(id, unit_id, source_revision_id, target_revision_id,
  confidence, author, work, domain, notes, chunk_id, project_id, created_at)
SELECT id, 'unit:' || id, 'source:' || id, 'target:' || id,
  confidence, author, work, domain, notes, chunk_id, project_id, created_at
FROM phrase_memory_previous;

-- Only explicitly recorded, supported models with the correct vector size.
-- Unidentified vectors do not acquire a guessed model. Their texts stay archived.
INSERT INTO text_embeddings(revision_id, provider, model, dimensions, profile, embedding, created_at)
SELECT 'source:' || id, 'openai', embedding_model, length(embedding)/4,
  'source-verbatim-v1', embedding, created_at
FROM phrase_memory_previous
WHERE (embedding_model = 'text-embedding-3-small' AND length(embedding) = 1536*4)
   OR (embedding_model = 'text-embedding-3-large' AND length(embedding) = 3072*4);

INSERT OR IGNORE INTO text_unit_tags(unit_id, name, created_at)
SELECT 'unit:' || pm.id, trim(CAST(tag.value AS TEXT)), pm.created_at
FROM phrase_memory_previous pm,
  json_each(CASE WHEN json_valid(pm.tags) THEN
    CASE WHEN json_type(pm.tags) = 'array' THEN pm.tags ELSE json_array(pm.tags) END
    ELSE json_array(pm.tags) END) tag
WHERE tag.type = 'text' AND length(trim(CAST(tag.value AS TEXT))) > 0;

DROP TABLE phrase_memory_previous;
DROP TABLE source_phrase_embeddings;

CREATE VIEW IF NOT EXISTS phrase_memory_entries AS
SELECT pm.*, sr.text AS source_phrase, tr.text AS target_phrase,
  sr.language AS source_language, tr.language AS target_language,
  tu.source_id, tu.source_version_id, tu.provenance,
  (SELECT p.workspace_id FROM projects p WHERE p.id = pm.project_id) AS workspace_id
FROM phrase_memory pm
JOIN text_units tu ON tu.id = pm.unit_id
JOIN text_unit_revisions sr ON sr.id = pm.source_revision_id
JOIN text_unit_revisions tr ON tr.id = pm.target_revision_id;


CREATE TABLE provenance_events_corpus (
  id TEXT PRIMARY KEY,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'source', 'source_version', 'transcription_document', 'transcription_segment',
      'transcription_revision', 'project', 'translation_chunk', 'artifact', 'job',
      'text_unit', 'text_revision'
    )
  ),
  entity_id TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT 'user' CHECK (actor IN ('user', 'system', 'model')),
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  input_ref TEXT,
  output_ref TEXT,
  config TEXT,
  outcome TEXT,
  duration_ms INTEGER,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  estimated_cost REAL,
  source_language TEXT,
  target_language TEXT,
  error_kind TEXT,
  input_hash TEXT,
  output_hash TEXT
);

INSERT INTO provenance_events_corpus SELECT * FROM provenance_events;
DROP TABLE provenance_events;
ALTER TABLE provenance_events_corpus RENAME TO provenance_events;

CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance_events(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_workspace ON provenance_events(workspace_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_type_time ON provenance_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_model ON provenance_events(model, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_job ON provenance_events(job_id);

