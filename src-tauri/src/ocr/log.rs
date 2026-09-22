//! Riga di log OCR/HTR (#220) in `operation_logs`, scritta da Rust: nessun
//! progetto/pipeline (`NULL`), collegata al documento e al segmento di
//! trascrizione. Prima scrittura Rust di questa tabella — fin qui la scrive
//! solo `dbService.ts`.

use rusqlite::{params, Connection};

use crate::llm::provider::TokenUsage;

/// Stesso schema id casuale di `federation::new_id`: niente dipendenza UUID
/// in più solo per un identificatore opaco.
fn new_log_id() -> String {
    use rand::Rng;
    let bytes: [u8; 16] = rand::thread_rng().gen();
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("oplog_{hex}")
}

/// Esito di una chiamata OCR, per la singola riga di log — successo o
/// errore scrivono entrambi, mai in silenzio.
pub struct OcrLogEntry<'a> {
    pub transcription_document_id: &'a str,
    pub transcription_segment_id: Option<&'a str>,
    pub provider: &'a str,
    pub model: &'a str,
    pub message: &'a str,
    /// `"info"` per un successo, `"error"` per un fallimento.
    pub level: &'a str,
    pub usage: Option<TokenUsage>,
    pub cost_usd: Option<f64>,
    pub duration_ms: Option<i64>,
    pub attempt_number: Option<u32>,
    pub max_attempts: Option<u32>,
}

pub fn write_ocr_log(conn: &Connection, entry: &OcrLogEntry<'_>) -> Result<(), String> {
    let id = new_log_id();

    // Anthropic esclude già le letture da cache da `input_tokens`: qui
    // `cache_miss` è quello che il provider dichiara, mai ricalcolato come
    // `input - cached` (vedi trappola nota in docs-dev/PLAN_OCR_HTR.md).
    let (input_tokens, output_tokens, cached_input_tokens, cache_miss_input_tokens) = entry
        .usage
        .as_ref()
        .map(|usage| {
            (
                Some(usage.input as i64),
                Some(usage.output as i64),
                usage.cached_input.map(|v| v as i64),
                usage.cache_miss_input.map(|v| v as i64),
            )
        })
        .unwrap_or((None, None, None, None));

    // `at` viene da SQLite stesso (`strftime`, formato ISO 8601 con 'Z'):
    // stessa forma di `new Date().toISOString()` lato TypeScript, senza
    // aggiungere una dipendenza solo per un timestamp.
    conn.execute(
        "INSERT INTO operation_logs
           (id, project_id, pipeline_id, at, level, scope, message,
            transcription_document_id, transcription_segment_id,
            provider, model, input_tokens, output_tokens,
            cached_input_tokens, cache_miss_input_tokens, cost_usd,
            duration_ms, attempt_number, max_attempts)
         VALUES (?1, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2, 'ocr', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            id,
            entry.level,
            entry.message,
            entry.transcription_document_id,
            entry.transcription_segment_id,
            entry.provider,
            entry.model,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            cache_miss_input_tokens,
            entry.cost_usd,
            entry.duration_ms,
            entry.attempt_number,
            entry.max_attempts,
        ],
    )
    .map_err(|error| format!("scrittura log OCR per {}: {error}", entry.transcription_document_id))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE operation_logs (
               id TEXT PRIMARY KEY,
               project_id TEXT,
               pipeline_id TEXT,
               at TEXT NOT NULL,
               level TEXT NOT NULL,
               scope TEXT NOT NULL,
               message TEXT NOT NULL,
               transcription_document_id TEXT,
               transcription_segment_id TEXT,
               provider TEXT,
               model TEXT,
               input_tokens INTEGER,
               output_tokens INTEGER,
               cached_input_tokens INTEGER,
               cache_miss_input_tokens INTEGER,
               cost_usd REAL,
               duration_ms INTEGER,
               attempt_number INTEGER,
               max_attempts INTEGER
             );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn writes_a_row_with_project_and_pipeline_null() {
        let conn = setup();
        write_ocr_log(
            &conn,
            &OcrLogEntry {
                transcription_document_id: "doc1",
                transcription_segment_id: Some("seg1"),
                provider: "anthropic",
                model: "claude-sonnet-5",
                message: "ok",
                level: "info",
                usage: Some(TokenUsage {
                    input: 1000,
                    output: 200,
                    cached_input: Some(800),
                    cache_miss_input: Some(200),
                }),
                cost_usd: Some(0.01),
                duration_ms: Some(1500),
                attempt_number: Some(1),
                max_attempts: Some(3),
            },
        )
        .unwrap();

        let (project_id, pipeline_id, cached): (Option<String>, Option<String>, Option<i64>) = conn
            .query_row(
                "SELECT project_id, pipeline_id, cached_input_tokens FROM operation_logs WHERE transcription_document_id = 'doc1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(project_id, None);
        assert_eq!(pipeline_id, None);
        assert_eq!(cached, Some(800));
    }

    #[test]
    fn writes_an_error_row_with_no_usage() {
        let conn = setup();
        write_ocr_log(
            &conn,
            &OcrLogEntry {
                transcription_document_id: "doc1",
                transcription_segment_id: None,
                provider: "anthropic",
                model: "claude-sonnet-5",
                message: "API key not authorized",
                level: "error",
                usage: None,
                cost_usd: None,
                duration_ms: None,
                attempt_number: Some(1),
                max_attempts: Some(3),
            },
        )
        .unwrap();

        let level: String = conn
            .query_row(
                "SELECT level FROM operation_logs WHERE transcription_document_id = 'doc1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(level, "error");
    }
}
