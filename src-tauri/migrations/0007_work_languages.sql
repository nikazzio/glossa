-- Le lingue appartengono all'opera, non alla pipeline (PIANO_PROMPT_PIPELINE §12).
-- projects.source_language / target_language passano dai nomi inglesi a codici
-- ISO 639-3 ('' = non indicata); varietà Glottolog e nota libera accanto.
-- Solo ADD/DROP COLUMN e UPDATE: nessuna tabella ricreata.
ALTER TABLE projects ADD COLUMN source_language_variety TEXT;
ALTER TABLE projects ADD COLUMN source_language_note TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN target_language_variety TEXT;
ALTER TABLE projects ADD COLUMN target_language_note TEXT NOT NULL DEFAULT '';

UPDATE projects SET
  source_language = CASE source_language
    WHEN 'English' THEN 'eng' WHEN 'Italian' THEN 'ita' WHEN 'Spanish' THEN 'spa'
    WHEN 'French' THEN 'fra' WHEN 'German' THEN 'deu' WHEN 'Portuguese' THEN 'por'
    WHEN 'Japanese' THEN 'jpn' WHEN 'Chinese' THEN 'zho' WHEN 'Korean' THEN 'kor'
    WHEN 'Russian' THEN 'rus' ELSE '' END,
  target_language = CASE target_language
    WHEN 'English' THEN 'eng' WHEN 'Italian' THEN 'ita' WHEN 'Spanish' THEN 'spa'
    WHEN 'French' THEN 'fra' WHEN 'German' THEN 'deu' WHEN 'Portuguese' THEN 'por'
    WHEN 'Japanese' THEN 'jpn' WHEN 'Chinese' THEN 'zho' WHEN 'Korean' THEN 'kor'
    WHEN 'Russian' THEN 'rus' ELSE '' END;

ALTER TABLE pipelines DROP COLUMN source_language;
ALTER TABLE pipelines DROP COLUMN target_language;
