-- Blocco 1 — i valori di rete diventano profili (#421).
-- Decisione D18 in docs-dev/BLOCCO_1_DECISIONI.md.
--
-- La `0007` teneva i valori **per biblioteca**: una riga per ognuna, con
-- dentro il suo profilo. Nel registro però i ritmi tarati sul campo sono due —
-- il prudente e quello di Gallica — e si applicano a undici biblioteche:
-- quella forma faceva ripetere gli stessi numeri nove volte, e alla domanda
-- «questi numeri da dove vengono» non sapeva rispondere.
--
-- Un profilo è **un ritmo, non una biblioteca**. Le biblioteche ne scelgono
-- uno.

-- I ritmi. Due nascono con l'applicazione e si riconoscono da `builtin`: si
-- modificano ma non si eliminano, perché sotto non resterebbe niente. I loro
-- valori li scrive il backend all'avvio leggendo il registro dei provider, che
-- resta l'unico posto dove una biblioteca nuova si compila.
CREATE TABLE IF NOT EXISTS network_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  -- I valori in JSON: non si interroga mai per campo, si legge tutto insieme
  -- all'avvio di un lavoro, e il backend li riporta dentro i limiti prima di
  -- usarli (D11).
  values_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quale ritmo segue una biblioteca. Una riga solo per chi ha scelto: chi non
-- compare segue il profilo predefinito.
CREATE TABLE IF NOT EXISTS library_network_profiles (
  -- Chiave del registro dei provider (`gallica`), oppure un host per le opere
  -- aggiunte con un indirizzo diretto, che nel registro non hanno voce (D18).
  library_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES network_profiles(id) ON DELETE CASCADE
);

-- La tabella della `0007` non serve più. Non si travasa niente: Glossa non ha
-- utenti e quei valori esistono solo sulle macchine di sviluppo, dove al
-- massimo qualcuno ha provato la schermata per un minuto.
DROP TABLE IF EXISTS library_settings;
