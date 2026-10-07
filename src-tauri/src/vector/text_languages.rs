//! Lingue dei testi salvati: codice ISO 639-3, varietà Glottolog e nota.
//!
//! Le revisioni sono immutabili: dare a una frase le lingue della sua opera vuol
//! dire creare revisioni nuove con lo stesso testo, ricopiare le misure
//! dell'originale e spostare la frase sulle revisioni nuove. Le vecchie restano.

use super::embedding::EmbeddingError;
use super::text_units::{new_revision, record_fact};
use rusqlite::{params, Connection, OptionalExtension};

/// ISO 639 «undetermined»: un testo salvato ha sempre una lingua, questa dice che non è stata indicata.
pub const UNDETERMINED_LANGUAGE: &str = "und";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LanguageLabel {
    pub code: String,
    pub variety: Option<String>,
    pub note: String,
}

fn db(error: rusqlite::Error) -> EmbeddingError {
    EmbeddingError::Http(error.to_string())
}

fn label(code: Option<String>, variety: Option<String>, note: Option<String>) -> LanguageLabel {
    let code = code.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
    LanguageLabel {
        variety: code.as_ref().and(
            variety
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
        ),
        code: code.unwrap_or_else(|| UNDETERMINED_LANGUAGE.to_string()),
        note: note.unwrap_or_default().trim().to_string(),
    }
}

/// Lingue di partenza e arrivo dell'opera; «und» dove non sono indicate.
pub fn project_languages(
    conn: &Connection,
    project: &str,
) -> Result<(LanguageLabel, LanguageLabel), EmbeddingError> {
    conn.query_row(
        "SELECT source_language, source_language_variety, source_language_note,
                target_language, target_language_variety, target_language_note
         FROM projects WHERE id=?1",
        [project],
        |r| {
            Ok((
                label(r.get(0)?, r.get(1)?, r.get(2)?),
                label(r.get(3)?, r.get(4)?, r.get(5)?),
            ))
        },
    )
    .optional()
    .map_err(db)?
    .ok_or_else(|| EmbeddingError::Parse("Translation not found".into()))
}

pub fn revision_language(
    conn: &Connection,
    revision: &str,
) -> Result<LanguageLabel, EmbeddingError> {
    conn.query_row(
        "SELECT language, language_variety, language_note FROM text_unit_revisions WHERE id=?1",
        [revision],
        |r| Ok(label(r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(db)
}

struct SavedPair {
    id: String,
    unit: String,
    source_revision: String,
    target_revision: String,
}

/// Frasi dell'opera la cui lingua (di partenza o di arrivo) non è quella dell'opera.
fn pairs_to_relabel(
    conn: &Connection,
    project: &str,
    source: &LanguageLabel,
    target: &LanguageLabel,
) -> Result<Vec<SavedPair>, EmbeddingError> {
    let mut query = conn
        .prepare(
            "SELECT p.id, p.unit_id, p.source_revision_id, p.target_revision_id,
                    s.language, s.language_variety, s.language_note,
                    t.language, t.language_variety, t.language_note
             FROM phrase_memory p
             JOIN text_unit_revisions s ON s.id = p.source_revision_id
             JOIN text_unit_revisions t ON t.id = p.target_revision_id
             WHERE p.project_id=?1 ORDER BY p.created_at, p.id",
        )
        .map_err(db)?;
    let rows = query
        .query_map([project], |r| {
            Ok((
                SavedPair {
                    id: r.get(0)?,
                    unit: r.get(1)?,
                    source_revision: r.get(2)?,
                    target_revision: r.get(3)?,
                },
                label(r.get(4)?, r.get(5)?, r.get(6)?),
                label(r.get(7)?, r.get(8)?, r.get(9)?),
            ))
        })
        .map_err(db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db)?;
    Ok(rows
        .into_iter()
        .filter(|(_, saved_source, saved_target)| saved_source != source || saved_target != target)
        .map(|(pair, _, _)| pair)
        .collect())
}

pub fn count_relabels(conn: &Connection, project: &str) -> Result<u32, EmbeddingError> {
    let (source, target) = project_languages(conn, project)?;
    let count = pairs_to_relabel(conn, project, &source, &target)?.len();
    u32::try_from(count).map_err(|_| EmbeddingError::Parse("Too many phrases".into()))
}

/// Revisione con lo stesso testo e la lingua nuova; le misure dell'originale vengono ricopiate.
fn relabel_revision(
    conn: &Connection,
    unit: &str,
    revision: &str,
    language: &LanguageLabel,
    copy_embeddings: bool,
) -> Result<String, EmbeddingError> {
    if revision_language(conn, revision)? == *language {
        return Ok(revision.to_string());
    }
    let (role, text): (String, String) = conn
        .query_row(
            "SELECT role, text FROM text_unit_revisions WHERE id=?1",
            [revision],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(db)?;
    let relabelled = new_revision(conn, unit, &role, language, &text)?;
    if copy_embeddings {
        conn.execute(
            "INSERT INTO text_embeddings(revision_id, provider, model, dimensions, profile, embedding)
             SELECT ?1, provider, model, dimensions, profile, embedding FROM text_embeddings WHERE revision_id=?2",
            params![relabelled, revision],
        )
        .map_err(db)?;
    }
    Ok(relabelled)
}

/// Dà alle frasi salvate dall'opera le lingue attuali dell'opera, tutte insieme o nessuna.
pub fn relabel_project(conn: &mut Connection, project: &str) -> Result<u32, EmbeddingError> {
    let tx = conn.transaction().map_err(db)?;
    let (source, target) = project_languages(&tx, project)?;
    let pairs = pairs_to_relabel(&tx, project, &source, &target)?;
    for pair in &pairs {
        let source_revision =
            relabel_revision(&tx, &pair.unit, &pair.source_revision, &source, true)?;
        let target_revision =
            relabel_revision(&tx, &pair.unit, &pair.target_revision, &target, false)?;
        tx.execute(
            "UPDATE phrase_memory SET source_revision_id=?1, target_revision_id=?2 WHERE id=?3",
            params![source_revision, target_revision, pair.id],
        )
        .map_err(db)?;
        record_fact(
            &tx,
            "text.language.changed",
            "text_unit",
            &pair.unit,
            None,
            None,
        )?;
    }
    tx.commit().map_err(db)?;
    u32::try_from(pairs.len()).map_err(|_| EmbeddingError::Parse("Too many phrases".into()))
}
