-- Varietà Glottolog e nota libera accanto al codice ISO di ogni revisione di
-- testo (PIANO_PROMPT_PIPELINE §12). Le revisioni restano immutabili: una
-- lingua corretta è una revisione nuova con lo stesso testo.
ALTER TABLE text_unit_revisions ADD COLUMN language_variety TEXT;
ALTER TABLE text_unit_revisions ADD COLUMN language_note TEXT NOT NULL DEFAULT '';
