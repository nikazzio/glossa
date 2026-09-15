-- Le pagine che l'utente ha tolto dal computer **di proposito**.
--
-- Senza questa memoria un'eliminazione non dura: il primo scaricamento del
-- libro, o il primo ripiego automatico, rimetterebbe la pagina al suo posto e
-- lo spazio tornerebbe occupato. Chi butta le carte bianche vuole che restino
-- buttate finché non è lui a richiederle.
--
-- L'esclusione vale per la copia digitale, non per una singola misura: una
-- pagina che non interessa non interessa a nessuna risoluzione.
CREATE TABLE IF NOT EXISTS excluded_pages (
  version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  excluded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (version_id, page_index)
);
