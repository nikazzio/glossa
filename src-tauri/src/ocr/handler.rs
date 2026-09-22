//! Gestore del lavoro OCR/HTR (#220): per ogni pagina, legge i byte
//! dell'immagine (deposito → cache di rete → deposito a misura più grande →
//! biblioteca remota, la stessa catena del visore), chiama il modello e
//! scrive revisione + righe di log. Tiene un `AppHandle` come `federation::SearchJob`:
//! `JobContext` non ne dà uno, e serve a risolvere provider e chiave API.

use async_trait::async_trait;
use serde::Deserialize;

use crate::httpcache::{commands as httpcache_commands, request::CacheRequest, Source};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::llm::pipeline::resolve_provider;
use crate::llm::prompts::build_ocr_prompt;
use crate::llm::provider::LlmRequest;
use crate::llm::types::{ImageAttachment, StructuredPrompt};
use crate::ocr::log::{write_ocr_log, OcrLogEntry, OcrPhase};
use crate::ocr::revisions::write_ocr_revision;

pub const JOB_TYPE: &str = "ocr_page";

/// Qualità JPEG di invio: stessa costante di `optimize`, non una nuova
/// convenzione — l'immagine mandata al modello non ha bisogno di più di
/// quanto basti già per una copia locale ricompressa.
const SEND_QUALITY: u8 = crate::optimize::DEFAULT_QUALITY;

/// Una pagina da leggere, con tutto già risolto al momento della messa in
/// coda: il lavoro resta interpretabile dopo un riavvio, e cambiare un prompt
/// dopo non altera un lavoro già accodato.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageConfig {
    pub segment_id: String,
    pub document_id: String,
    /// La `CacheRequest::Page` già risolta dal frontend: Rust non costruisce
    /// URL di biblioteca, li conosce solo chi ha aperto il visore.
    pub cache_request: CacheRequest,
    pub prompt: String,
    pub provider: String,
    pub model: String,
    pub image_edge: u32,
    /// Copie già sul computer da inviare così come sono, in ordine di
    /// preferenza (vuoto = immagine ottimizzata). Senza indirizzo remoto:
    /// quella che manca non si scarica, si passa alla successiva.
    #[serde(default)]
    pub local_requests: Vec<CacheRequest>,
    pub page_label: String,
}

/// L'immagine pronta da inviare, con quanto serve a descriverla nel log.
struct PreparedImage {
    bytes: Vec<u8>,
    media_type: &'static str,
    source: Source,
    kind: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct OcrConfig {
    pub pages: Vec<OcrPageConfig>,
}

pub struct OcrJobHandler(pub tauri::AppHandle);

/// Classifica l'errore di una chiamata al modello a partire dal messaggio già
/// normalizzato dai provider (`llm::providers::format_api_error`, forma
/// `«<provider> API error (<status>): <motivo>»`). Serve perché il motore
/// lavori ritenta solo alcune categorie: marcare tutto come `Format`, come
/// nella prima stesura, significa non ritentare mai, nemmeno dopo un 429 o
/// una connessione caduta per due secondi.
fn classify_provider_error(message: &str) -> ErrorKind {
    let Some(status) = http_status_in(message) else {
        // Nessun codice di stato: la richiesta non è mai arrivata a
        // destinazione (DNS, connessione rifiutata, timeout del client).
        return ErrorKind::Transport;
    };
    match status {
        429 => ErrorKind::RateLimited,
        403 => ErrorKind::Throttled,
        404 => ErrorKind::NotFound,
        408 | 500..=599 => ErrorKind::Transport,
        // 400 e 401: richiesta o chiave sbagliate. Ritentarle darebbe la
        // stessa risposta, quindi si mostrano e basta.
        _ => ErrorKind::Format,
    }
}

fn http_status_in(message: &str) -> Option<u16> {
    let start = message.find("API error (")? + "API error (".len();
    let rest = &message[start..];
    let end = rest.find(')')?;
    rest[..end].trim().parse().ok()
}

/// `Retry-After` dichiarato dal servizio, propagato dai provider come marcatore
/// compatto in coda al messaggio. Quando c'è, il motore lavori lo preferisce al
/// proprio calcolo esponenziale.
fn declared_retry_after(message: &str) -> Option<std::time::Duration> {
    let start = message.find("retry-after-ms=")? + "retry-after-ms=".len();
    let digits: String = message[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits
        .parse::<u64>()
        .ok()
        .map(std::time::Duration::from_millis)
}

/// Esito della lettura di una pagina, per la riga di log finale.
enum PageOutcome {
    /// Revisione nuova scritta, con il suo numero progressivo.
    Written(i64),
    /// Testo identico all'ultima revisione: nessuna riga nuova, e va detto.
    Unchanged(i64),
}

#[async_trait]
impl JobHandler for OcrJobHandler {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::LanguageService
    }

    fn recovery(&self) -> Recovery {
        // Una chiamata interrotta a metà non lascia testo parziale utile: si
        // rifà la pagina da capo. Le pagine già scritte non si ripetono (sotto,
        // il controllo sul checkpoint), quindi "da capo" costa solo la pagina
        // in corso al momento dell'interruzione, non l'intero lavoro.
        Recovery::Restart
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let config: OcrConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Format, format!("configurazione OCR: {error}"))
        })?;
        if config.pages.is_empty() {
            return Ok(Outcome::Done);
        }

        // Segmenti già scritti in un tentativo precedente (interrotto da
        // pausa/riavvio): si saltano, non si rilegge il modello per loro.
        // L'elenco **cresce** a ogni pagina: sovrascriverlo con la sola
        // pagina appena finita farebbe rileggere (e ripagare) tutte le
        // precedenti alla ripresa.
        let mut done: Vec<String> = ctx
            .checkpoint
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default();

        let total = config.pages.len();
        for (index, page) in config.pages.iter().enumerate() {
            if done.contains(&page.segment_id) {
                continue;
            }
            if ctx.cancel_requested() {
                return Ok(Outcome::Cancelled);
            }
            if ctx.pause_requested() {
                return Ok(Outcome::Paused);
            }

            ctx.report_progress(
                index as f64 / total as f64,
                Some(page.page_label.as_str()),
                None,
            )
            .await;

            self.run_page(&ctx, page).await?;

            done.push(page.segment_id.clone());
            let checkpoint = serde_json::to_string(&done)
                .map_err(|error| JobError::new(ErrorKind::Format, error.to_string()))?;
            ctx.save_checkpoint(&checkpoint)
                .await
                .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        }

        ctx.report_progress(1.0, None, None).await;
        Ok(Outcome::Done)
    }
}

impl OcrJobHandler {
    async fn run_page(&self, ctx: &JobContext, page: &OcrPageConfig) -> Result<(), JobError> {
        let started = std::time::Instant::now();

        self.log(
            ctx,
            page,
            LogRow {
                level: "info",
                phase: OcrPhase::Start,
                message: format!("lettura avviata — pagina {}", page.page_label),
                ..LogRow::default()
            },
            started,
        )
        .await;

        let (provider, api_key) = match resolve_provider(&self.0, &page.provider, None, None) {
            Ok(resolved) => resolved,
            Err(error) => {
                // Provider non configurato o chiave mancante: nessun tentativo
                // successivo può cambiare la risposta.
                return Err(self
                    .fail(ctx, page, started, ErrorKind::Format, &error)
                    .await);
            }
        };

        let image = match self.prepare_image(page).await {
            Ok(image) => image,
            Err((kind, message)) => {
                return Err(self.fail(ctx, page, started, kind, &message).await)
            }
        };
        // Misura reale di quello che parte, non quella chiesta: una copia più
        // piccola non viene ingrandita, e una copia locale parte com'è.
        let (width, height) = images::dimensions_of(&image.bytes).unwrap_or((0, 0));

        self.log(
            ctx,
            page,
            LogRow {
                level: "info",
                phase: OcrPhase::Image,
                message: format!(
                    "immagine pronta — {}, {width}×{height} px, {} kB inviati, {}",
                    image.kind,
                    image.bytes.len() / 1024,
                    source_label(image.source)
                ),
                ..LogRow::default()
            },
            started,
        )
        .await;

        let structured = build_ocr_prompt(
            &page.prompt,
            ImageAttachment {
                bytes: image.bytes,
                media_type: image.media_type.to_string(),
            },
        );

        let sent_prompt = readable_prompt(&structured);
        self.log(
            ctx,
            page,
            LogRow {
                level: "info",
                phase: OcrPhase::Prompt,
                message: format!("prompt inviato — {} caratteri", sent_prompt.chars().count()),
                detail: Some(sent_prompt.clone()),
                detail_kind: Some("prompt"),
                ..LogRow::default()
            },
            started,
        )
        .await;

        let request = LlmRequest {
            model: &page.model,
            structured: &structured,
            api_key: &api_key,
            json_mode: false,
            json_schema_strict: false,
            provider_options: None,
        };

        let client = match provider.http_client() {
            Ok(client) => client,
            Err(error) => {
                return Err(self
                    .fail(ctx, page, started, ErrorKind::Internal, &error)
                    .await)
            }
        };
        let response = match provider.call(&client, &request).await {
            Ok(response) => response,
            Err(error) => {
                let kind = classify_provider_error(&error);
                let mut failure = self.fail(ctx, page, started, kind, &error).await;
                failure.retry_after = declared_retry_after(&error);
                return Err(failure);
            }
        };

        if response.content.trim().is_empty() {
            return Err(self
                .fail(
                    ctx,
                    page,
                    started,
                    // La chiamata è andata a buon fine: il modello non ha
                    // trovato testo. Ritentare ripaga la stessa risposta.
                    ErrorKind::Format,
                    "il modello ha restituito una risposta vuota",
                )
                .await);
        }

        let segment_id = page.segment_id.clone();
        let text = response.content.clone();
        let write_result = ctx
            .with_database(move |conn| {
                let before = crate::ocr::revisions::latest_revision_number(conn, &segment_id)?;
                let revision = write_ocr_revision(conn, &segment_id, &text)?;
                Ok(if Some(revision.revision_number) == before {
                    PageOutcome::Unchanged(revision.revision_number)
                } else {
                    PageOutcome::Written(revision.revision_number)
                })
            })
            .await;
        let outcome = match write_result {
            Ok(outcome) => outcome,
            Err(error) => {
                return Err(self
                    .fail(ctx, page, started, ErrorKind::Storage, &error)
                    .await)
            }
        };

        let characters = response.content.chars().count();
        let (level, message) = match outcome {
            PageOutcome::Written(number) => (
                "success",
                format!("trascrizione salvata — revisione {number}, {characters} caratteri"),
            ),
            PageOutcome::Unchanged(number) => (
                "warn",
                format!(
                    "testo identico alla revisione {number}: nessuna revisione nuova ({characters} caratteri)"
                ),
            ),
        };

        self.log(
            ctx,
            page,
            LogRow {
                level,
                phase: OcrPhase::End,
                message,
                usage: response.usage,
                ..LogRow::default()
            },
            started,
        )
        .await;

        Ok(())
    }

    /// La copia sul computer così com'è, se richiesta e presente; altrimenti
    /// l'immagine ottimizzata alla misura scelta. Una copia locale che manca
    /// non è un errore: si ripiega, e il log lo dice.
    async fn prepare_image(
        &self,
        page: &OcrPageConfig,
    ) -> Result<PreparedImage, (ErrorKind, String)> {
        for request in &page.local_requests {
            let Ok((source, bytes)) =
                httpcache_commands::bytes_and_source_of(&self.0, request).await
            else {
                continue;
            };
            if let Some(media_type) = images::media_type_of(&bytes) {
                return Ok(PreparedImage {
                    bytes,
                    media_type,
                    source,
                    kind: "copia sul computer, senza modifiche",
                });
            }
        }

        let (source, raw_bytes) =
            httpcache_commands::bytes_and_source_of(&self.0, &page.cache_request)
                .await
                .map_err(|error| {
                    (
                        ErrorKind::Transport,
                        format!("immagine non raggiungibile: {error}"),
                    )
                })?;
        let bytes = images::resize_jpeg(&raw_bytes, page.image_edge, SEND_QUALITY)
            .map_err(|error| (ErrorKind::Format, error.to_string()))?;
        let kind = if page.local_requests.is_empty() {
            "ottimizzata"
        } else {
            "ottimizzata (copia sul computer non trovata)"
        };
        Ok(PreparedImage {
            bytes,
            media_type: "image/jpeg",
            source,
            kind,
        })
    }

    /// Scrive la riga di log di errore e restituisce il `JobError` da propagare:
    /// ogni fallimento lascia un segno leggibile nel log OCR, mai un silenzio.
    async fn fail(
        &self,
        ctx: &JobContext,
        page: &OcrPageConfig,
        started: std::time::Instant,
        kind: ErrorKind,
        message: &str,
    ) -> JobError {
        let retryable = kind.is_retryable() && ctx.attempt < ctx.max_attempts;
        let suffix = if retryable {
            format!(
                " — nuovo tentativo ({} di {})",
                ctx.attempt, ctx.max_attempts
            )
        } else {
            String::new()
        };
        self.log(
            ctx,
            page,
            LogRow {
                level: "error",
                phase: OcrPhase::End,
                message: format!("{message}{suffix}"),
                detail: Some(message.to_string()),
                detail_kind: Some("error"),
                ..LogRow::default()
            },
            started,
        )
        .await;
        JobError::new(kind, message.to_string())
    }

    async fn log(
        &self,
        ctx: &JobContext,
        page: &OcrPageConfig,
        row: LogRow,
        started: std::time::Instant,
    ) {
        let duration_ms = started.elapsed().as_millis() as i64;
        let meta = serde_json::json!({ "pageLabel": page.page_label }).to_string();
        let entry = OcrLogEntry {
            transcription_document_id: &page.document_id,
            transcription_segment_id: Some(&page.segment_id),
            provider: &page.provider,
            model: &page.model,
            message: &row.message,
            level: row.level,
            phase: row.phase,
            detail: row.detail.as_deref(),
            detail_kind: row.detail_kind,
            meta: Some(meta),
            usage: row.usage,
            duration_ms: Some(duration_ms),
            attempt_number: Some(ctx.attempt),
            max_attempts: Some(ctx.max_attempts),
        };
        let _ = ctx.with_database(|conn| write_ocr_log(conn, &entry)).await;
    }
}

/// Da dove arriva l'immagine, detto come nel resto del log.
fn source_label(source: Source) -> &'static str {
    match source {
        Source::Vault => "dal libro scaricato",
        Source::Cache => "dalla cache",
        Source::Network => "scaricata dalla biblioteca",
    }
}

/// I campi variabili di una riga di log, per non ripetere sette argomenti a
/// ogni chiamata.
struct LogRow {
    level: &'static str,
    phase: OcrPhase,
    message: String,
    detail: Option<String>,
    detail_kind: Option<&'static str>,
    usage: Option<crate::llm::provider::TokenUsage>,
}

impl Default for LogRow {
    fn default() -> Self {
        Self {
            level: "info",
            phase: OcrPhase::Start,
            message: String::new(),
            detail: None,
            detail_kind: None,
            usage: None,
        }
    }
}

/// Il prompt come lo vedrebbe il modello, per la riga di log: blocchi di
/// sistema nell'ordine in cui partono, poi il messaggio utente. L'immagine non
/// ci entra — nel log ne resta la riga con misura e peso.
fn readable_prompt(prompt: &StructuredPrompt) -> String {
    let mut text = prompt.flatten_system();
    text.push_str("\n\n");
    text.push_str(&prompt.user);
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rate_limit_is_retryable_and_a_bad_key_is_not() {
        assert_eq!(
            classify_provider_error("OpenAI API error (429): rate limited — retry shortly"),
            ErrorKind::RateLimited
        );
        assert_eq!(
            classify_provider_error("OpenAI API error (401): API key not authorized"),
            ErrorKind::Format
        );
        assert!(
            classify_provider_error("OpenAI API error (429): rate limited — retry shortly")
                .is_retryable()
        );
        assert!(!classify_provider_error("OpenAI API error (400): bad request").is_retryable());
    }

    #[test]
    fn a_provider_outage_and_a_dead_connection_are_both_transport() {
        assert_eq!(
            classify_provider_error("Gemini API error (503): provider unavailable"),
            ErrorKind::Transport
        );
        assert_eq!(
            classify_provider_error("error sending request for url (...): connection refused"),
            ErrorKind::Transport
        );
    }

    #[test]
    fn a_declared_retry_after_is_read_back_from_the_message() {
        assert_eq!(
            declared_retry_after(
                "OpenAI API error (429): rate limited — retry shortly; retry-after-ms=45000"
            ),
            Some(std::time::Duration::from_millis(45_000))
        );
        assert_eq!(
            declared_retry_after("OpenAI API error (429): rate limited"),
            None
        );
    }
}
