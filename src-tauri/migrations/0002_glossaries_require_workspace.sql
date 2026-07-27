-- #213: un glossario appartiene sempre a un workspace (chi lo possiede),
-- non esiste piu' un "globale senza padrone". Solo backfill dati: la colonna
-- resta nullable a livello SQL (SQLite non permette di aggiungere un vincolo
-- NOT NULL a una colonna esistente senza ricreare la tabella), il vincolo
-- reale e' applicato lato TypeScript (createGlossary richiede sempre un
-- workspaceId). Regola di assegnazione per i glossari orfani esistenti:
-- il workspace del primo progetto che li ha assegnati, altrimenti il
-- workspace attivo, altrimenti il primo workspace esistente.

UPDATE glossaries
SET workspace_id = (
  SELECT p.workspace_id
  FROM project_glossaries pg
  JOIN projects p ON p.id = pg.project_id
  WHERE pg.glossary_id = glossaries.id
  ORDER BY pg.project_id
  LIMIT 1
)
WHERE workspace_id IS NULL
  AND EXISTS (
    SELECT 1 FROM project_glossaries pg
    JOIN projects p ON p.id = pg.project_id
    WHERE pg.glossary_id = glossaries.id
  );

UPDATE glossaries
SET workspace_id = (
  SELECT value FROM app_settings WHERE key = 'active_workspace_id' AND value IS NOT NULL AND value != ''
)
WHERE workspace_id IS NULL
  AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'active_workspace_id' AND value IS NOT NULL AND value != '');

UPDATE glossaries
SET workspace_id = (SELECT id FROM workspaces ORDER BY created_at LIMIT 1)
WHERE workspace_id IS NULL;
