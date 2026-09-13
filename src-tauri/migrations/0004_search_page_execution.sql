-- Preserve the execution that actually committed each page. A failed attempt
-- must not acquire results later produced by its retry.
ALTER TABLE search_pages ADD COLUMN execution_id TEXT REFERENCES search_executions(id);
UPDATE search_pages SET execution_id = (
  SELECT e.id FROM search_executions e JOIN jobs j ON j.id=e.id
  WHERE e.result_set_id=search_pages.result_set_id AND e.page=search_pages.page
    AND j.checkpoint='page_committed'
  ORDER BY e.generation DESC LIMIT 1
);
-- 0003 introduced counters without filling existing pages. Repair them once,
-- during migration, never by reading payloads on every history refresh.
UPDATE search_pages SET received=COALESCE(json_array_length(payload,'$.results'),0),
  has_more=COALESCE(json_extract(payload,'$.has_more'),0);
