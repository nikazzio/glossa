-- Blocco 1 — politica di scaricamento e profili di rete modificabili
-- (#422, #421). Decisioni D4, D11 e D18 in docs-dev/BLOCCO_1_DECISIONI.md.

-- Tetto di risoluzione della singola fonte (D4: «scelta alla fonte, non
-- globale», perché dipende dal materiale: una cinquecentina a stampa larga si
-- legge a molto meno di una minuscola fitta). Assente significa «come dice la
-- biblioteca, o come dice l'impostazione generale»: la precedenza è fonte →
-- biblioteca → globale, e un valore scritto qui è l'ultima parola.
ALTER TABLE source_versions ADD COLUMN size_cap TEXT DEFAULT NULL;

-- Quello che l'utente ha cambiato su una biblioteca (D18, primo dei tre
-- livelli di precedenza: «modifica dell'utente, salvata nel database per
-- chiave provider o per host»). Sotto ci sono i valori compilati
-- nell'applicazione, e sotto ancora il profilo prudente.
--
-- Una riga per biblioteca, non una tabella parallela al registro: qui entra
-- **solo** ciò che è stato cambiato a mano. Chi non compare si comporta come
-- dichiara il registro, e togliere la riga è il modo di riportare la
-- biblioteca ai valori di fabbrica.
CREATE TABLE IF NOT EXISTS library_settings (
  -- Chiave del registro dei provider (`gallica`), oppure un host per le fonti
  -- aggiunte per indirizzo diretto, che nel registro non hanno voce.
  key TEXT PRIMARY KEY,
  -- Tetto di risoluzione per questa biblioteca: `max`, oppure il lato lungo in
  -- pixel. Assente significa «come dice l'impostazione generale».
  size_cap TEXT DEFAULT NULL,
  -- Il profilo di rete in JSON, quando l'utente l'ha modificato. JSON e non
  -- tredici colonne perché non si interroga mai per campo: si legge tutto
  -- insieme all'avvio di un lavoro, e il backend lo valida e lo riporta dentro
  -- i limiti prima di usarlo (D11).
  network_profile TEXT DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
