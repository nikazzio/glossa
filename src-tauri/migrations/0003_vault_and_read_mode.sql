-- Blocco 1, PR 1 — deposito e disponibilità reale (#217).
-- Decisioni in docs-dev/BLOCCO_1_DECISIONI.md.
--
-- Nota sul metodo: il documento (appendice) prevede di riscrivere le tabelle
-- pulite in baseline invece di accumulare modifiche incrementali, dato che non
-- c'è retrocompatibilità da preservare. Non si può fare per PR: sqlx traccia le
-- migrazioni applicate per checksum, quindi riscrivere 0001 farebbe fallire
-- l'avvio su ogni database esistente — compreso quello di sviluppo, sette volte
-- nelle sette PR del blocco. Il consolidamento va fatto una volta sola, prima
-- del primo uso reale. Vedi la mappatura nel corpo della PR.

-- assets ------------------------------------------------------------------

-- Numero progressivo dal manifesto, per ordinare (D2). Non è l'etichetta della
-- biblioteca, che può essere "12r", "[iv]" o mancare del tutto.
ALTER TABLE assets ADD COLUMN page_index INTEGER DEFAULT NULL;

-- Etichetta dichiarata dalla biblioteca: si mostra all'utente, non si usa mai
-- per ordinare né per costruire percorsi (D2, D2-bis).
ALTER TABLE assets ADD COLUMN page_label TEXT DEFAULT NULL;

-- La stessa carta esiste in più risoluzioni (D4): senza questa colonna
-- page_index non è univoco, e una richiesta a piena risoluzione
-- sovrascriverebbe quella standard.
ALTER TABLE assets ADD COLUMN size_tag TEXT DEFAULT NULL;

-- Pagina della biblioteca sulla singola carta, quando il manifesto la dichiara
-- come `homepage` (D8-bis). Vince su quella della versione.
ALTER TABLE assets ADD COLUMN homepage_url TEXT DEFAULT NULL;

-- source_versions ---------------------------------------------------------

-- 'standard' (massima entro il tetto) oppure 'max' (D4). Per fonte e non
-- globale: dipende dal materiale, non dalle preferenze generali.
ALTER TABLE source_versions ADD COLUMN download_policy TEXT NOT NULL DEFAULT 'standard';

-- Capacità dichiarate dal servizio immagini in info.json: dimensioni
-- disponibili, tetti, livello di conformità (D4). Conservate per non doverle
-- richiedere a ogni pagina.
ALTER TABLE source_versions ADD COLUMN image_service_profile TEXT DEFAULT NULL;

-- Collegamento umano all'originale, dichiarato dal manifesto (D8-bis): resta
-- raggiungibile anche quando la copia locale vince.
ALTER TABLE source_versions ADD COLUMN homepage_url TEXT DEFAULT NULL;

-- La biblioteca consente la consultazione ma non lo scaricamento sistematico
-- (D9). Non è una preferenza dell'utente, è un vincolo dell'istituzione: vince
-- sulla modalità globale e disabilita i comandi di scaricamento.
ALTER TABLE source_versions ADD COLUMN download_allowed INTEGER NOT NULL DEFAULT 1;

-- Numero di carte dichiarato dal manifesto: senza, 'complete' non è
-- calcolabile e la disponibilità non si può mostrare (D7).
ALTER TABLE source_versions ADD COLUMN expected_asset_count INTEGER DEFAULT NULL;

-- Indici -------------------------------------------------------------------

-- L'ordinamento delle carte di una digitalizzazione a una data risoluzione è
-- la query più frequente del viewer.
CREATE INDEX IF NOT EXISTS idx_assets_version_page
  ON assets(source_version_id, page_index, size_tag);

-- Impostazioni --------------------------------------------------------------

-- Radice del deposito. Vuota = dentro la cartella dati (D1).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vault_root', '');

-- Modalità di lettura globale: 'auto' | 'local' | 'remote' (D8, D9).
-- 'auto' è già "online di default": finché non si scarica nulla, tutto arriva
-- da remoto.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('source_read_mode', 'auto');

-- Tetto predefinito in pixel sul lato lungo per la politica 'standard' (D4).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('download_size_cap', '2000');

-- Controllo rapido di presenza all'avvio: spento di default, perché elencare
-- le cartelle allunga l'apertura su depositi grandi o remoti (D5).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('verify_vault_on_startup', '0');
