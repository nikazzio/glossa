-- Baseline unica dello schema 2.0/1.5. Si applica esclusivamente a database
-- nuovi: i database precedenti al consolidamento non sono supportati.

PRAGMA foreign_keys = ON;

-- ── Tabelle applicative ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  memory_extractor_provider TEXT NOT NULL DEFAULT 'openai',
  memory_extractor_model TEXT NOT NULL DEFAULT 'gpt-5.4-nano',
  memory_extractor_prompt TEXT NOT NULL DEFAULT '',
  icon_key TEXT NOT NULL DEFAULT 'book',
  archived_at DATETIME,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'English',
  target_language TEXT NOT NULL DEFAULT 'Italian',
  source_display_text TEXT DEFAULT '',
  source_processing_text TEXT DEFAULT '',
  source_footnotes TEXT DEFAULT '[]',
  document_format TEXT DEFAULT 'plain',
  render_profile TEXT DEFAULT 'plain-text',
  markdown_aware INTEGER DEFAULT 0,
  experimental_import TEXT DEFAULT NULL,
  workspace_id TEXT REFERENCES workspaces(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed')),
  trashed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

-- pipelines — supports multiple pipelines per project.
-- source_display_text / source_processing_text / source_footnotes are nullable:
-- when null the pipeline inherits the project-level source text (v1.0 behaviour).
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  source_language TEXT NOT NULL DEFAULT 'English',
  target_language TEXT NOT NULL DEFAULT 'Italian',
  pipeline_mode TEXT DEFAULT 'standard',
  stages TEXT NOT NULL DEFAULT '[]',
  judge_prompt TEXT DEFAULT '',
  judge_model TEXT DEFAULT '',
  judge_provider TEXT DEFAULT '',
  use_chunking INTEGER DEFAULT 1,
  words_per_chunk INTEGER DEFAULT 0,
  source_display_text TEXT DEFAULT NULL,
  source_processing_text TEXT DEFAULT NULL,
  source_footnotes TEXT DEFAULT NULL,
  review_provider_options TEXT DEFAULT NULL,
  persona TEXT DEFAULT NULL,
  custom_source_language TEXT DEFAULT NULL,
  custom_target_language TEXT DEFAULT NULL,
  blob_budget_tokens INTEGER DEFAULT 0,
  blob_overlap INTEGER DEFAULT 1,
  coherence_prompt TEXT DEFAULT NULL,
  few_shot_examples TEXT NOT NULL DEFAULT '[]',
  use_phrase_memory INTEGER NOT NULL DEFAULT 0,
  auto_search_phrase_memory INTEGER NOT NULL DEFAULT 1,
  phrase_memory_similarity_threshold REAL NOT NULL DEFAULT 0.75,
  phrase_memory_max_results INTEGER NOT NULL DEFAULT 10,
  run_status TEXT DEFAULT 'idle',
  last_run_config TEXT DEFAULT NULL,
  run_in_progress INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipelines_project_id ON pipelines(project_id);

CREATE TABLE IF NOT EXISTS glossaries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  source_language TEXT DEFAULT '',
  target_language TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS glossary_entries (
  id TEXT PRIMARY KEY,
  glossary_id TEXT REFERENCES glossaries(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  translation TEXT NOT NULL,
  notes TEXT DEFAULT '',
  context TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_entries_term ON glossary_entries(glossary_id, term);

CREATE TABLE IF NOT EXISTS project_glossaries (
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  glossary_id TEXT REFERENCES glossaries(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, glossary_id)
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  source_display_text TEXT DEFAULT '',
  source_processing_text TEXT DEFAULT '',
  translation_display_text TEXT DEFAULT '',
  translation_processing_text TEXT DEFAULT '',
  position INTEGER DEFAULT NULL,
  chunk_status TEXT DEFAULT 'ready',
  stage_results TEXT DEFAULT '{}',
  judge_status TEXT DEFAULT 'idle',
  judge_rating TEXT DEFAULT 'fair',
  translation_locked INTEGER DEFAULT 0,
  judge_issues TEXT DEFAULT '[]',
  coherence_result TEXT DEFAULT NULL,
  footnotes TEXT DEFAULT NULL,
  blob_id TEXT DEFAULT NULL,
  blob_order INTEGER DEFAULT 0,
  blob_reference_chunk_ids TEXT DEFAULT NULL,
  pipeline_id TEXT DEFAULT NULL,
  approved_revision_id TEXT REFERENCES translation_revisions(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- translations are unique per (pipeline_id, chunk_id) so two pipelines
-- cannot overwrite each other's rows even if chunk IDs happen to collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_pipeline_chunk
  ON translations(pipeline_id, id)
  WHERE pipeline_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  default_model TEXT DEFAULT '',
  default_provider TEXT DEFAULT '',
  context TEXT NOT NULL DEFAULT 'stage',
  workflow TEXT NOT NULL DEFAULT 'translation',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_name_context_workflow
  ON prompt_templates(name, context, workflow);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  pipeline_id TEXT DEFAULT NULL,
  at TEXT NOT NULL,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  chunk_id TEXT DEFAULT NULL,
  stage_id TEXT DEFAULT NULL,
  meta TEXT DEFAULT NULL,
  detail TEXT DEFAULT NULL,
  phase TEXT DEFAULT NULL,
  duration_ms INTEGER DEFAULT NULL,
  detail_kind TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id ON operation_logs(project_id, at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_pipeline_id ON operation_logs(project_id, pipeline_id, at);

CREATE TABLE IF NOT EXISTS phrase_memory (
  id TEXT PRIMARY KEY,
  source_phrase TEXT NOT NULL,
  target_phrase TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  author TEXT,
  work TEXT,
  domain TEXT,
  tags TEXT,
  notes TEXT,
  chunk_id TEXT,
  project_id TEXT REFERENCES projects(id),
  embedding BLOB NOT NULL,
  embedding_model TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phrase_memory_chunk_project ON phrase_memory(chunk_id, project_id);

CREATE TABLE IF NOT EXISTS source_phrase_embeddings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  chunk_id TEXT,
  source_phrase TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_phrase_embeddings_chunk_project
  ON source_phrase_embeddings(chunk_id, project_id);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'comment',
  content TEXT NOT NULL DEFAULT '',
  anchor_text TEXT DEFAULT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_annotations_chunk ON annotations(pipeline_id, chunk_id);

CREATE TABLE IF NOT EXISTS custom_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  requires_api_key INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── 2.0 tables (new — #211) ───────────────────────────────────────────

-- Biblioteca / fonti

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('manuscript', 'print', 'pdf', 'iiif', 'web', 'other')),
  primary_language TEXT,
  description TEXT,
  external_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed')),
  trashed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title);

CREATE TABLE IF NOT EXISTS source_versions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  version_kind TEXT NOT NULL CHECK (version_kind IN ('iiif_manifest', 'pdf', 'edition', 'copy', 'other')),
  source_url TEXT,
  metadata TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  download_policy TEXT NOT NULL DEFAULT 'standard',
  image_service_profile TEXT,
  homepage_url TEXT,
  download_allowed INTEGER NOT NULL DEFAULT 1,
  expected_asset_count INTEGER,
  size_cap TEXT,
  availability TEXT NOT NULL DEFAULT 'catalogued'
    CHECK (availability IN ('catalogued', 'partial', 'complete')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_id, label)
);

CREATE TABLE IF NOT EXISTS source_pages (
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

CREATE INDEX IF NOT EXISTS idx_source_pages_version_position
  ON source_pages(source_version_id, position);

-- Manifest e PDF appartengono alla copia; immagini, miniature e derivati
-- possono appartenere a una pagina logica.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  source_version_id TEXT REFERENCES source_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'manifest', 'thumbnail', 'derived', 'other')),
  origin TEXT NOT NULL CHECK (origin IN ('remote', 'local', 'derived')),
  source_page_id TEXT REFERENCES source_pages(id) ON DELETE CASCADE,
  vault_path TEXT,
  remote_url TEXT,
  derived_from_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  byte_size INTEGER,
  checksum TEXT,
  size_tag TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assets_source_version ON assets(source_version_id);
CREATE INDEX IF NOT EXISTS idx_assets_page_size ON assets(source_page_id, size_tag);

-- Trascrizioni

CREATE TABLE IF NOT EXISTS transcription_documents (
  id TEXT PRIMARY KEY,
  source_version_id TEXT REFERENCES source_versions(id) ON DELETE SET NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'trashed')),
  trashed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transcription_documents_workspace
  ON transcription_documents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_transcription_documents_title ON transcription_documents(title);

CREATE TABLE IF NOT EXISTS transcription_segments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES transcription_documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT,
  source_page_id TEXT REFERENCES source_pages(id) ON DELETE SET NULL,
  approved_revision_id TEXT REFERENCES transcription_revisions(id) ON DELETE SET NULL,
  UNIQUE (document_id, position)
);

-- "All segments approved" (the precondition for the transcription origin of
-- a translation) is an application-level invariant checked by the service
-- layer, not expressible as a SQLite CHECK across rows.
CREATE TABLE IF NOT EXISTS transcription_revisions (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES transcription_segments(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ocr', 'import')),
  derived_from_revision_id TEXT REFERENCES transcription_revisions(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (segment_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_transcription_revisions_segment
  ON transcription_revisions(segment_id, revision_number);

-- Origine testo traduzione: satellite 1:1 opzionale su projects. Assenza di
-- riga = import autonomo (comportamento di default per ogni progetto 1.x
-- esistente e per ogni nuovo import diretto).
CREATE TABLE IF NOT EXISTS translation_origins (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  origin_type TEXT NOT NULL CHECK (origin_type IN ('transcription', 'source_level', 'import')),
  transcription_document_id TEXT REFERENCES transcription_documents(id) ON DELETE SET NULL,
  source_version_id TEXT REFERENCES source_versions(id) ON DELETE SET NULL,
  import_note TEXT,
  CHECK (
    (origin_type = 'transcription' AND transcription_document_id IS NOT NULL AND source_version_id IS NULL)
    OR (origin_type = 'source_level' AND source_version_id IS NOT NULL AND transcription_document_id IS NULL)
    OR (origin_type = 'import' AND transcription_document_id IS NULL AND source_version_id IS NULL)
  )
);

-- Job system: one shared table for every long-running job type (download,
-- OCR/HTR, export, dataset build, ...). Per-type differences live in the
-- `config`/`error` JSON payload, validated by a Rust-side registry per
-- job_type — not as dedicated SQL columns (see #218).
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'pausing', 'paused', 'cancelling', 'cancelled', 'completed', 'error')
  ),
  priority INTEGER NOT NULL DEFAULT 0,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  owner_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  owner_transcription_document_id TEXT REFERENCES transcription_documents(id) ON DELETE SET NULL,
  owner_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  owner_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  depends_on_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  config TEXT NOT NULL DEFAULT '{}',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  checkpoint TEXT,
  error_kind TEXT,
  next_attempt_at DATETIME,
  eta_seconds INTEGER,
  waiting_reason TEXT,
  phase TEXT,
  detail TEXT,
  requested_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  CHECK (
    (CASE WHEN owner_source_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN owner_transcription_document_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN owner_project_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN owner_asset_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_source ON jobs(owner_source_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_transcription_document ON jobs(owner_transcription_document_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_project ON jobs(owner_project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_asset ON jobs(owner_asset_id);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(status, priority DESC, created_at);

-- Artifact / export

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  transcription_document_id TEXT REFERENCES transcription_documents(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('export', 'dataset', 'report', 'index', 'intermediate')),
  format TEXT NOT NULL,
  vault_path TEXT,
  config TEXT,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (CASE WHEN source_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN transcription_document_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN workspace_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_artifacts_source ON artifacts(source_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_transcription_document ON artifacts(transcription_document_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);

-- Provenance: single append-only table across all domains. `entity_id` is
-- deliberately not a foreign key — the provenance trail must survive the
-- physical deletion of the entity it describes, so it can never cascade.
CREATE TABLE IF NOT EXISTS provenance_events (
  id TEXT PRIMARY KEY,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'source', 'source_version', 'transcription_document', 'transcription_segment',
      'transcription_revision', 'project', 'translation_chunk', 'artifact', 'job'
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

CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance_events(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_workspace ON provenance_events(workspace_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_type_time ON provenance_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_model ON provenance_events(model, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provenance_job ON provenance_events(job_id);

CREATE TABLE IF NOT EXISTS translation_revisions (
  id TEXT PRIMARY KEY,
  translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL CHECK (created_by IN ('model', 'human')),
  derived_from_revision_id TEXT REFERENCES translation_revisions(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (translation_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_translation_revisions_chunk
  ON translation_revisions(translation_id, revision_number);

CREATE TABLE IF NOT EXISTS derived_metrics (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  value REAL,
  detail TEXT,
  algorithm_version TEXT NOT NULL DEFAULT '1',
  input_hash TEXT,
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (metric_key, entity_type, entity_id, algorithm_version)
);

CREATE INDEX IF NOT EXISTS idx_derived_metrics_entity
  ON derived_metrics(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS network_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  values_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS library_network_profiles (
  library_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES network_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_items (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  is_origin INTEGER NOT NULL DEFAULT 0,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_items_item
  ON workspace_items(item_type, item_id);

CREATE TABLE IF NOT EXISTS glossary_entry_overrides (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES glossary_entries(id) ON DELETE CASCADE,
  translation TEXT,
  notes TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_glossary_overrides_entry
  ON glossary_entry_overrides(entry_id);

-- ── Bootstrap defaults (first-run only, mirrors former dbService.ts seed) ──

INSERT INTO app_settings (key, value)
SELECT 'active_workspace_id', ''
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'active_workspace_id');

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('vault_root', ''),
  ('source_read_mode', 'auto'),
  ('download_size_cap', '2000'),
  ('verify_vault_on_startup', '0'),
  ('jobs_limit_network', '2'),
  ('jobs_limit_cpu', '0'),
  ('jobs_limit_disk', '1'),
  ('jobs_limit_language_service', '1'),
  ('jobs_limit_documents', '1'),
  ('auto_resume_downloads', '0');

INSERT OR IGNORE INTO workspaces (
  id, name, description, embedding_model,
  memory_extractor_provider, memory_extractor_model, memory_extractor_prompt,
  created_at
)
SELECT
  'ws_default', 'Default', NULL, 'text-embedding-3-small',
  'openai', 'gpt-5.4-nano',
  'Extract phrase-memory pairs from an original source chunk and its final translation.

Return only JSON in this shape:
{"pairs":[{"sourcePhrase":"exact source text","targetPhrase":"exact target text","confidence":0.0}]}

Rules:
- sourcePhrase must be copied verbatim from the original source chunk.
- targetPhrase must be copied verbatim from the translation.
- Pair only meaningful reusable phrases, terms, idioms, names, or short clauses.
- Keep the pairs in source-text order.
- Do not invent, normalize, paraphrase, translate, or repair text.
- Use confidence from 0 to 1. Return {"pairs":[]} if no reliable pairs exist.',
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM workspaces);

UPDATE projects
SET workspace_id = 'ws_default'
WHERE workspace_id IS NULL OR workspace_id = '';

UPDATE app_settings
SET value = 'ws_default'
WHERE key = 'active_workspace_id' AND (value IS NULL OR value = '');
