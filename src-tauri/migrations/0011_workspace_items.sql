-- Il workspace come contenitore, con due forme di appartenenza (#213).
--
-- **Casa**: una traduzione e una trascrizione stanno in **un solo** workspace,
-- e da lì prendono le risorse. È la `home workspace` della issue: se stessero in
-- due, «quali glossari vede questo lavoro» non avrebbe una risposta sola.
-- Resta la colonna sulla riga, che è la forma giusta per un legame unico.
--
-- **Collegamento**: un libro è materiale di partenza e sta in più workspace
-- insieme; un glossario e le frasi importate si condividono allo stesso modo.
-- Per questi il legame è una riga in `workspace_items`, uguale per ogni tipo:
-- un tipo nuovo — i ritagli di caratteri delle trascrizioni, o quel che verrà —
-- è una stringa in più, non una migrazione.

CREATE TABLE IF NOT EXISTS workspace_items (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- 'source' | 'glossary' | 'phrase' | … Non è un CHECK: i tipi li conosce il
  -- codice, e aggiungerne uno non deve toccare lo schema.
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  -- Il workspace in cui la risorsa è nata: è la sua provenienza, e serve a
  -- distinguere «questa è mia» da «questa la sto usando». Vale solo per le
  -- risorse; un libro non nasce in un workspace.
  is_origin INTEGER NOT NULL DEFAULT 0,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, item_type, item_id)
);

-- «In quali workspace sta questo item»: la domanda che fa ogni scheda.
CREATE INDEX IF NOT EXISTS idx_workspace_items_item
  ON workspace_items(item_type, item_id);

-- I collegamenti che esistono già, portati dentro senza perderne nessuno.
INSERT OR IGNORE INTO workspace_items (workspace_id, item_type, item_id, linked_at)
  SELECT workspace_id, 'source', source_id, linked_at FROM workspace_sources;

-- I dizionari avevano un proprietario: quello diventa la loro provenienza.
INSERT OR IGNORE INTO workspace_items (workspace_id, item_type, item_id, is_origin)
  SELECT workspace_id, 'glossary', id, 1 FROM glossaries WHERE workspace_id IS NOT NULL;

-- Le frasi nate da una traduzione **non** si collegano: seguono il workspace del
-- progetto da cui vengono, ed è ciò che tiene allineate migliaia di righe senza
-- toccarne una quando il progetto si sposta. Si collegano solo quelle importate,
-- che un progetto non ce l'hanno.
INSERT OR IGNORE INTO workspace_items (workspace_id, item_type, item_id, is_origin)
  SELECT workspace_id, 'phrase', id, 1 FROM phrase_memory WHERE project_id IS NULL;

DROP INDEX IF EXISTS idx_workspace_sources_source;
DROP TABLE IF EXISTS workspace_sources;

DROP INDEX IF EXISTS idx_phrase_memory_workspace_id;
ALTER TABLE phrase_memory DROP COLUMN workspace_id;

ALTER TABLE glossaries DROP COLUMN workspace_id;

-- Una voce ereditata si può correggere **qui** senza toccare l'originale (#213,
-- «ereditarietà, override e provenienza»).
--
-- La riga esiste solo dove c'è una differenza: senza override, la voce è quella
-- del dizionario. `hidden` toglie la voce da questo workspace senza cancellarla
-- per gli altri.
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

-- Archiviare un workspace: sparisce da dove si sceglie, resta leggibile e si
-- riapre (#213). Diverso dall'eliminazione, che toglie i collegamenti.
ALTER TABLE workspaces ADD COLUMN archived_at DATETIME;
