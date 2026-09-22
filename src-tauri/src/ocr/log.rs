//! Righe di log OCR/HTR (#220) in `operation_logs`, scritte da Rust: nessun
//! progetto/pipeline (`NULL`), collegate al documento e al segmento di
//! trascrizione. Prima scrittura Rust di questa tabella — fin qui la scrive
//! solo `dbService.ts`.
//!
//! Una lettura scrive **più righe**, non una sola: avvio, immagine inviata,
//! prompt inviato, esito. È la stessa granularità del log di traduzione, ed è
//! l'unica che permetta di capire, a cose fatte, cosa è stato davvero mandato
//! al modello. `phase` distingue il tipo di riga, i filtri della console si
//! appoggiano a quello.
//!
//! `cost_usd` resta `NULL` di proposito: il listino prezzi vive nel catalogo
//! modelli lato TypeScript e la console lo applica in lettura (`costForEntry`),
//! come già fa per le righe di traduzione senza costo congelato. Duplicare i
//! prezzi in Rust significherebbe due listini da tenere allineati a mano.

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

/// Il prompt completo finisce in `detail`: tagliato alla stessa misura del
/// lato TypeScript, perché una console non deve mai diventare il posto dove
/// un prompt da mezzo megabyte blocca il rendering.
const MAX_DETAIL_LENGTH: usize = 20_000;

/// Tipo di riga, e quindi filtro nella console. Stessi valori usati come
/// `phase` dalle righe di traduzione.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OcrPhase {
    /// Lettura avviata: fornitore, modello, pagina.
    Start,
    /// Immagine risolta e ridimensionata: misura e peso davvero inviati.
    Image,
    /// Prompt inviato, testo completo in `detail`.
    Prompt,
    /// Esito: revisione scritta, testo identico, o errore.
    End,
}

impl OcrPhase {
    fn as_str(self) -> &'static str {
        match self {
            OcrPhase::Start => "start",
            OcrPhase::Image => "image",
            OcrPhase::Prompt => "prompt",
            OcrPhase::End => "end",
        }
    }
}

/// Una riga di log OCR. Successo o errore scrivono entrambi, mai in silenzio.
pub struct OcrLogEntry<'a> {
    pub transcription_document_id: &'a str,
    pub transcription_segment_id: Option<&'a str>,
    pub provider: &'a str,
    pub model: &'a str,
    pub message: &'a str,
    /// `"info"`, `"success"` a lettura riuscita, `"warn"`, `"error"`.
    pub level: &'a str,
    pub phase: OcrPhase,
    /// Testo lungo allegato alla riga (oggi: il prompt inviato).
    pub detail: Option<&'a str>,
    /// Come leggere `detail`: `"prompt"`, `"error"`, `"note"`.
    pub detail_kind: Option<&'a str>,
    /// JSON libero della riga. Ci vive l'etichetta della pagina, che serve
    /// alla console per raggruppare per pagina senza una colonna in più.
    pub meta: Option<String>,
    pub usage: Option<TokenUsage>,
    pub duration_ms: Option<i64>,
    pub attempt_number: Option<u32>,
    pub max_attempts: Option<u32>,
}

pub fn write_ocr_log(conn: &Connection, entry: &OcrLogEntry<'_>) -> Result<(), String> {
    let id = new_log_id();

    // Anthropic esclude già le letture da cache da `input_tokens`: qui
    // `cache_miss` è quello che il provider dichiara, mai ricalcolato come
    // `input - cached`.
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

    let detail = entry.detail.map(|text| {
        if text.len() <= MAX_DETAIL_LENGTH {
            text.to_string()
        } else {
            // Taglio su confine di carattere: `text[..n]` su un multibyte va
            // in panico, e un prompt con accenti lo è quasi sempre.
            let end = text
                .char_indices()
                .take_while(|(index, _)| *index <= MAX_DETAIL_LENGTH)
                .last()
                .map(|(index, _)| index)
                .unwrap_or(0);
            text[..end].to_string()
        }
    });

    // `at` viene da SQLite stesso (`strftime`, formato ISO 8601 con 'Z'):
    // stessa forma di `new Date().toISOString()` lato TypeScript, senza
    // aggiungere una dipendenza solo per un timestamp.
    conn.execute(
        "INSERT INTO operation_logs
           (id, project_id, pipeline_id, at, level, scope, message, phase,
            detail, detail_kind, meta,
            transcription_document_id, transcription_segment_id,
            provider, model, input_tokens, output_tokens,
            cached_input_tokens, cache_miss_input_tokens, cost_usd,
            duration_ms, attempt_number, max_attempts)
         VALUES (?1, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2, 'ocr', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, NULL, ?16, ?17, ?18)",
        params![
            id,
            entry.level,
            entry.message,
            entry.phase.as_str(),
            detail,
            entry.detail_kind,
            entry.meta,
            entry.transcription_document_id,
            entry.transcription_segment_id,
            entry.provider,
            entry.model,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            cache_miss_input_tokens,
            entry.duration_ms,
            entry.attempt_number,
            entry.max_attempts,
        ],
    )
    .map_err(|error| {
        format!(
            "scrittura log OCR per {}: {error}",
            entry.transcription_document_id
        )
    })?;

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
               phase TEXT,
               detail TEXT,
               detail_kind TEXT,
               meta TEXT,
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

    fn entry<'a>(level: &'a str, phase: OcrPhase, message: &'a str) -> OcrLogEntry<'a> {
        OcrLogEntry {
            transcription_document_id: "doc1",
            transcription_segment_id: Some("seg1"),
            provider: "openai",
            model: "gpt-5.6-terra",
            message,
            level,
            phase,
            detail: None,
            detail_kind: None,
            meta: None,
            usage: None,
            duration_ms: None,
            attempt_number: Some(1),
            max_attempts: Some(3),
        }
    }

    #[test]
    fn writes_a_row_with_project_and_pipeline_null() {
        let conn = setup();
        let mut row = entry("success", OcrPhase::End, "ok");
        row.usage = Some(TokenUsage {
            input: 1000,
            output: 200,
            cached_input: Some(800),
            cache_miss_input: Some(200),
        });
        row.duration_ms = Some(1500);
        write_ocr_log(&conn, &row).unwrap();

        let (project_id, pipeline_id, cached, phase): (
            Option<String>,
            Option<String>,
            Option<i64>,
            String,
        ) = conn
            .query_row(
                "SELECT project_id, pipeline_id, cached_input_tokens, phase FROM operation_logs WHERE transcription_document_id = 'doc1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(project_id, None);
        assert_eq!(pipeline_id, None);
        assert_eq!(cached, Some(800));
        assert_eq!(phase, "end");
    }

    #[test]
    fn writes_an_error_row_with_no_usage() {
        let conn = setup();
        let mut row = entry("error", OcrPhase::End, "API key not authorized");
        row.transcription_segment_id = None;
        row.detail = Some("dettaglio dell'errore");
        row.detail_kind = Some("error");
        write_ocr_log(&conn, &row).unwrap();

        let (level, detail_kind): (String, Option<String>) = conn
            .query_row(
                "SELECT level, detail_kind FROM operation_logs WHERE transcription_document_id = 'doc1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(level, "error");
        assert_eq!(detail_kind.as_deref(), Some("error"));
    }

    #[test]
    fn keeps_the_prompt_in_detail_and_cuts_it_on_a_character_boundary() {
        let conn = setup();
        let prompt = "à".repeat(MAX_DETAIL_LENGTH);
        let mut row = entry("info", OcrPhase::Prompt, "prompt inviato");
        row.detail = Some(&prompt);
        row.detail_kind = Some("prompt");
        row.meta = Some(r#"{"pageLabel":"12r"}"#.to_string());
        write_ocr_log(&conn, &row).unwrap();

        let (detail, meta): (String, Option<String>) = conn
            .query_row(
                "SELECT detail, meta FROM operation_logs WHERE transcription_document_id = 'doc1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(detail.len() <= MAX_DETAIL_LENGTH);
        assert!(detail.starts_with('à'));
        assert_eq!(meta.as_deref(), Some(r#"{"pageLabel":"12r"}"#));
    }
}
