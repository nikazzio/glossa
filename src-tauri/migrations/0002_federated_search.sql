CREATE TABLE search_runs (
    id TEXT PRIMARY KEY,
    criteria TEXT NOT NULL,
    providers TEXT NOT NULL,
    group_id TEXT NOT NULL,
    derived_from_id TEXT REFERENCES search_runs(id),
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE search_executions (
    id TEXT PRIMARY KEY REFERENCES jobs(id) DEFERRABLE INITIALLY DEFERRED,
    search_id TEXT NOT NULL REFERENCES search_runs(id),
    provider_key TEXT NOT NULL,
    generation INTEGER NOT NULL,
    result_set_id TEXT NOT NULL,
    page INTEGER NOT NULL CHECK(page > 0),
    mode TEXT NOT NULL CHECK(mode IN ('first','retry','restart','continue')),
    UNIQUE(search_id, provider_key, generation)
);
CREATE TABLE search_pages (
    result_set_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY(result_set_id, page)
);
CREATE INDEX search_executions_run ON search_executions(search_id, provider_key, generation DESC);
