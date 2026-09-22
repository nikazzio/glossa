//! Scrittura della revisione OCR (#220), stessa disciplina di
//! `src/services/transcriptionService.ts` sul lato TypeScript: numero
//! revisione progressivo per segmento, impronta di contenuto, append-only,
//! deduplica sul testo identico alla revisione precedente. Prima scrittura
//! delle tabelle di trascrizione fatta da Rust — usa `rusqlite`, mai SQLx
//! (il codice applicativo dei gestori job non lo usa).

use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionRevision {
    pub id: String,
    pub segment_id: String,
    pub revision_number: i64,
    pub text: String,
    pub content_hash: String,
    pub derived_from_revision_id: Option<String>,
}

/// Stessa impronta FNV-1a 64-bit di `provenanceService.contentHash` lato
/// TypeScript: due implementazioni indipendenti dello stesso algoritmo, non
/// un valore condiviso — deve restare identica se una delle due cambia.
fn content_hash(text: &str) -> String {
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    let hash = text.as_bytes().iter().fold(FNV_OFFSET, |hash, &byte| {
        (hash ^ byte as u64).wrapping_mul(FNV_PRIME)
    });
    format!("{hash:016x}")
}

fn latest_revision(
    conn: &Connection,
    segment_id: &str,
) -> Result<Option<TranscriptionRevision>, String> {
    conn.query_row(
        "SELECT id, segment_id, revision_number, text, content_hash, derived_from_revision_id
         FROM transcription_revisions
         WHERE segment_id = ?1
         ORDER BY revision_number DESC LIMIT 1",
        params![segment_id],
        |row| {
            Ok(TranscriptionRevision {
                id: row.get(0)?,
                segment_id: row.get(1)?,
                revision_number: row.get(2)?,
                text: row.get(3)?,
                content_hash: row.get(4)?,
                derived_from_revision_id: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(|error| format!("ultima revisione del segmento {segment_id}: {error}"))
}

/// Il numero dell'ultima revisione del segmento, se ne ha una. Serve a dire
/// nel log se la lettura ha davvero prodotto una revisione nuova o se il
/// modello ha ridato lo stesso testo di prima.
pub fn latest_revision_number(conn: &Connection, segment_id: &str) -> Result<Option<i64>, String> {
    Ok(latest_revision(conn, segment_id)?.map(|revision| revision.revision_number))
}

/// Scrive il testo OCR come nuova revisione, autore `'ocr'`. Nessuna riga
/// nuova se il testo è identico all'ultima revisione — restituisce quella
/// esistente, come fa `saveSegmentText` lato TypeScript. Fallisce se il
/// segmento non esiste (vincolo di chiave esterna).
pub fn write_ocr_revision(
    conn: &Connection,
    segment_id: &str,
    text: &str,
) -> Result<TranscriptionRevision, String> {
    let hash = content_hash(text);
    let mut parent = latest_revision(conn, segment_id)?;

    // Stesso schema di riprova di `insertRevision`: una scrittura concorrente
    // (l'utente che salva a mano mentre l'OCR gira) può far perdere il vincolo
    // di unicità. Chi perde riparte dalla revisione che ha vinto, così nessun
    // testo si perde e la catena resta lineare.
    loop {
        if parent.as_ref().map(|p| p.content_hash.as_str()) == Some(hash.as_str()) {
            return Ok(parent.expect("appena confrontato Some sopra"));
        }
        let revision_number = parent.as_ref().map(|p| p.revision_number).unwrap_or(0) + 1;
        let revision = TranscriptionRevision {
            id: format!("{segment_id}:r{revision_number}"),
            segment_id: segment_id.to_string(),
            revision_number,
            text: text.to_string(),
            content_hash: hash.clone(),
            derived_from_revision_id: parent.as_ref().map(|p| p.id.clone()),
        };

        let inserted = conn.execute(
            "INSERT INTO transcription_revisions
               (id, segment_id, revision_number, text, created_by, derived_from_revision_id, content_hash)
             VALUES (?1, ?2, ?3, ?4, 'ocr', ?5, ?6)",
            params![
                revision.id,
                revision.segment_id,
                revision.revision_number,
                revision.text,
                revision.derived_from_revision_id,
                revision.content_hash,
            ],
        );

        match inserted {
            Ok(_) => return Ok(revision),
            Err(error) => {
                let latest = latest_revision(conn, segment_id)?;
                // Nessun avanzamento rispetto a prima del tentativo: è un vero
                // errore (segmento inesistente, database bloccato), non una
                // collisione, e va propagato invece di ritentare all'infinito.
                let latest_id = latest.as_ref().map(|r| r.id.as_str());
                let parent_id = parent.as_ref().map(|p| p.id.as_str());
                if latest_id == parent_id {
                    return Err(format!("scrittura revisione OCR per {segment_id}: {error}"));
                }
                parent = latest;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE transcription_documents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
             CREATE TABLE transcription_segments (
               id TEXT PRIMARY KEY,
               document_id TEXT NOT NULL REFERENCES transcription_documents(id),
               position INTEGER NOT NULL
             );
             CREATE TABLE transcription_revisions (
               id TEXT PRIMARY KEY,
               segment_id TEXT NOT NULL REFERENCES transcription_segments(id) ON DELETE CASCADE,
               revision_number INTEGER NOT NULL,
               text TEXT NOT NULL DEFAULT '',
               created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ocr', 'import')),
               derived_from_revision_id TEXT REFERENCES transcription_revisions(id) ON DELETE SET NULL,
               content_hash TEXT NOT NULL DEFAULT '',
               created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
               UNIQUE (segment_id, revision_number)
             );
             INSERT INTO transcription_documents (id, workspace_id) VALUES ('doc1', 'ws1');
             INSERT INTO transcription_segments (id, document_id, position) VALUES ('seg1', 'doc1', 0);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn first_revision_starts_at_one_with_no_parent() {
        let conn = setup();
        let revision = write_ocr_revision(&conn, "seg1", "hello").unwrap();
        assert_eq!(revision.revision_number, 1);
        assert_eq!(revision.derived_from_revision_id, None);
        assert_eq!(revision.text, "hello");
    }

    #[test]
    fn second_call_with_different_text_appends_revision_two() {
        let conn = setup();
        let first = write_ocr_revision(&conn, "seg1", "hello").unwrap();
        let second = write_ocr_revision(&conn, "seg1", "hello world").unwrap();
        assert_eq!(second.revision_number, 2);
        assert_eq!(second.derived_from_revision_id, Some(first.id));
    }

    #[test]
    fn identical_text_does_not_create_a_new_revision() {
        let conn = setup();
        let first = write_ocr_revision(&conn, "seg1", "hello").unwrap();
        let second = write_ocr_revision(&conn, "seg1", "hello").unwrap();
        assert_eq!(first.id, second.id);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM transcription_revisions WHERE segment_id = 'seg1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn nonexistent_segment_fails_instead_of_looping_forever() {
        let conn = setup();
        let result = write_ocr_revision(&conn, "does-not-exist", "hello");
        assert!(result.is_err());
    }
}
