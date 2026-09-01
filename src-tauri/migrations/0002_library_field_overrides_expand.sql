-- Generalizza le correzioni a mano dell'opera da 5 a tutti i campi
-- anagrafici (12 esistenti + 8 nuovi, ricercati sugli standard di
-- catalogazione bibliotecaria). "kind" smette di essere un enum fisso: resta
-- solo la natura fisica dell'originale (manoscritto/stampa/altro), il
-- formato del file è già tracciato per copia su source_versions.version_kind
-- e non ha bisogno di un campo anagrafico separato — ma i tre valori che il
-- riconoscimento automatico assegna oggi (manuscript/print/other) erano già
-- ammessi dal vincolo precedente: non serve toccare la tabella `sources`.
--
-- SQLite non permette di alterare un CHECK esistente: si ricostruisce la
-- tabella, si copiano i dati, si rinomina. Tocca solo `source_field_overrides`
-- di proposito — nessun'altra tabella referenzia questa con `ON DELETE
-- CASCADE`, quindi ricostruirla non può cancellare righe altrove. Ricostruire
-- `sources` invece le cancellerebbe: `PRAGMA foreign_keys=OFF` non ha effetto
-- dentro una transazione (le migrazioni girano sempre in una), quindi
-- `DROP TABLE sources` farebbe scattare la cancellazione a catena su
-- `source_versions` e `source_collection_items` per davvero.

CREATE TABLE source_field_overrides_new (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN (
    -- I 12 campi anagrafici già in scheda oggi.
    'title', 'kind', 'primary_language', 'creator', 'date',
    'publisher', 'contributors', 'rights', 'physical_description', 'subjects', 'volume', 'description',
    -- Gli 8 nuovi, dalla ricerca su Dublin Core/MARC21/manifesti IIIF reali.
    'origin_place', 'provenance', 'notes', 'series', 'genre_form', 'standard_identifier', 'coverage', 'related_works'
  )),
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, field)
);

INSERT INTO source_field_overrides_new (source_id, field, value, updated_at)
  SELECT source_id, field, value, updated_at FROM source_field_overrides;

DROP TABLE source_field_overrides;
ALTER TABLE source_field_overrides_new RENAME TO source_field_overrides;
