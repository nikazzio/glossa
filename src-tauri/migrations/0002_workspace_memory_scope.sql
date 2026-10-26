-- La ricerca nella memoria di frasi di un workspace può includere anche le
-- frasi degli altri workspace e delle traduzioni senza workspace (#485 N, T7e).
-- Spenta per impostazione predefinita: la memoria resta del workspace.
ALTER TABLE workspaces ADD COLUMN memory_search_all_workspaces INTEGER NOT NULL DEFAULT 0;
