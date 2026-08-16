-- Blocco 1 — politica di scaricamento e profili di rete (#422, #421).
-- Decisioni D4, D11 e D18 in docs-dev/BLOCCO_1_DECISIONI.md.

-- Misura delle pagine per la singola opera (D4: «scelta alla fonte, non
-- globale», perché dipende dal materiale: una cinquecentina a stampa larga si
-- legge a molto meno di una minuscola fitta). Assente significa «come dice
-- l'impostazione generale».
ALTER TABLE source_versions ADD COLUMN size_cap TEXT DEFAULT NULL;

-- I profili di rete: **quanti ritmi**, non quante biblioteche (D18).
--
-- I valori sono cinque o sei ritmi diversi applicati a undici biblioteche, non
-- undici insiemi di numeri: tenerli per biblioteca vorrebbe dire ripetere gli
-- stessi numeri nove volte e non sapere più da dove vengono.
--
-- Due nascono con l'applicazione e si riconoscono da `builtin`: si possono
-- modificare ma non eliminare, perché sotto non resterebbe niente. I valori
-- iniziali li scrive il backend all'avvio leggendo il registro dei provider,
-- che resta l'unico posto dove una biblioteca nuova si compila.
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

-- Quale profilo usa una biblioteca. Una riga solo per chi è stato cambiato o
-- associato: chi non compare segue il profilo predefinito.
CREATE TABLE IF NOT EXISTS library_network_profiles (
  -- Chiave del registro dei provider (`gallica`), oppure un host per le opere
  -- aggiunte con un indirizzo diretto, che nel registro non hanno voce (D18).
  library_key TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES network_profiles(id) ON DELETE CASCADE
);
