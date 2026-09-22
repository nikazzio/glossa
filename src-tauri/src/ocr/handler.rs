//! Gestore del lavoro OCR/HTR (#220): per ogni pagina, legge i byte
//! dell'immagine (deposito → cache di rete → deposito a misura più grande →
//! biblioteca remota, la stessa catena del visore), chiama il modello e
//! scrive revisione + riga di log. Tiene un `AppHandle` come `federation::SearchJob`:
//! `JobContext` non ne dà uno, e serve a risolvere provider e chiave API.

use async_trait::async_trait;
use serde::Deserialize;

use crate::httpcache::{commands as httpcache_commands, request::CacheRequest};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::llm::pipeline::resolve_provider;
use crate::llm::prompts::build_ocr_prompt;
use crate::llm::provider::LlmRequest;
use crate::llm::types::ImageAttachment;
use crate::ocr::log::{write_ocr_log, OcrLogEntry};
use crate::ocr::revisions::write_ocr_revision;

pub const JOB_TYPE: &str = "ocr_page";

/// Qualità JPEG di invio: stessa costante di `optimize`, non una nuova
/// convenzione — l'immagine mandata al modello non ha bisogno di più di
/// quanto basti già per una copia locale ricompressa.
const SEND_QUALITY: u8 = crate::optimize::DEFAULT_QUALITY;

/// Una pagina da leggere, con tutto già risolto al momento della messa in
/// coda (#220, decisione 7): il lavoro resta interpretabile dopo un riavvio,
/// e cambiare un prompt dopo non altera un lavoro già accodato.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageConfig {
    pub segment_id: String,
    pub document_id: String,
    /// La `CacheRequest::Page` già risolta dal frontend: Rust non costruisce
    /// URL di biblioteca, li conosce solo chi ha aperto il visore.
    pub cache_request: CacheRequest,
    pub prompt: String,
    /// Testo già trascritto delle pagine vicine, calcolato dal frontend
    /// (che ha già in memoria il documento aperto) — non ricalcolato in Rust.
    pub reference_text: Option<String>,
    pub provider: String,
    pub model: String,
    pub image_edge: u32,
    pub page_label: String,
}

#[derive(Debug, Deserialize)]
pub struct OcrConfig {
    pub pages: Vec<OcrPageConfig>,
}

pub struct OcrJobHandler(pub tauri::AppHandle);

fn failure(kind: ErrorKind, message: impl Into<String>) -> JobError {
    JobError::new(kind, message.into())
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
        let config: OcrConfig = serde_json::from_str(&ctx.config)
            .map_err(|error| failure(ErrorKind::Format, format!("configurazione OCR: {error}")))?;
        if config.pages.is_empty() {
            return Ok(Outcome::Done);
        }

        // Segmenti già scritti in un tentativo precedente (interrotto da
        // pausa/riavvio): si saltano, non si rilegge il modello per loro.
        let done: Vec<String> = ctx
            .checkpoint
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default();

        let total = config.pages.len();
        for (index, page) in config.pages.iter().enumerate() {
            if done.contains(&page.segment_id) {
                continue;
            }
            if ctx.pause_requested() || ctx.cancel_requested() {
                return Ok(if ctx.cancel_requested() {
                    Outcome::Cancelled
                } else {
                    Outcome::Paused
                });
            }

            ctx.report_progress(
                index as f64 / total as f64,
                Some(page.page_label.as_str()),
                None,
            )
            .await;

            self.run_page(&ctx, page).await?;

            let mut done_now = done.clone();
            done_now.push(page.segment_id.clone());
            let checkpoint = serde_json::to_string(&done_now)
                .map_err(|error| failure(ErrorKind::Format, error.to_string()))?;
            ctx.save_checkpoint(&checkpoint)
                .await
                .map_err(|error| failure(ErrorKind::Storage, error))?;
        }

        ctx.report_progress(1.0, None, None).await;
        Ok(Outcome::Done)
    }
}

impl OcrJobHandler {
    async fn run_page(&self, ctx: &JobContext, page: &OcrPageConfig) -> Result<(), JobError> {
        let started = std::time::Instant::now();

        let (provider, api_key) = match resolve_provider(&self.0, &page.provider, None, None) {
            Ok(resolved) => resolved,
            Err(error) => return Err(self.fail(ctx, page, started, &error).await),
        };

        let raw_bytes = match httpcache_commands::bytes_of(&self.0, &page.cache_request).await {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format!("immagine non raggiungibile: {error}");
                return Err(self.fail(ctx, page, started, &message).await);
            }
        };
        let resized = match images::resize_jpeg(&raw_bytes, page.image_edge, SEND_QUALITY) {
            Ok(bytes) => bytes,
            Err(error) => return Err(self.fail(ctx, page, started, &error.to_string()).await),
        };

        let structured = build_ocr_prompt(
            &page.prompt,
            page.reference_text.as_deref(),
            ImageAttachment {
                bytes: resized,
                media_type: "image/jpeg".to_string(),
            },
            &page.page_label,
        );

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
            Err(error) => return Err(self.fail(ctx, page, started, &error).await),
        };
        let response = match provider.call(&client, &request).await {
            Ok(response) => response,
            Err(error) => return Err(self.fail(ctx, page, started, &error).await),
        };

        if response.content.trim().is_empty() {
            return Err(self
                .fail(
                    ctx,
                    page,
                    started,
                    "il modello ha restituito una risposta vuota",
                )
                .await);
        }

        let write_result = ctx
            .with_database(|conn| {
                write_ocr_revision(conn, &page.segment_id, &response.content).map(|_| ())
            })
            .await;
        if let Err(error) = write_result {
            return Err(self.fail(ctx, page, started, &error).await);
        }

        self.log(
            ctx,
            page,
            "info",
            "trascrizione salvata",
            response.usage,
            started,
        )
        .await;

        Ok(())
    }

    /// Scrive la riga di log di errore e restituisce il `JobError` da propagare:
    /// ogni fallimento lascia un segno leggibile nel log OCR, mai un silenzio.
    async fn fail(
        &self,
        ctx: &JobContext,
        page: &OcrPageConfig,
        started: std::time::Instant,
        message: &str,
    ) -> JobError {
        self.log(ctx, page, "error", message, None, started).await;
        failure(ErrorKind::Format, message.to_string())
    }

    async fn log(
        &self,
        ctx: &JobContext,
        page: &OcrPageConfig,
        level: &str,
        message: &str,
        usage: Option<crate::llm::provider::TokenUsage>,
        started: std::time::Instant,
    ) {
        let duration_ms = started.elapsed().as_millis() as i64;
        let entry = OcrLogEntry {
            transcription_document_id: &page.document_id,
            transcription_segment_id: Some(&page.segment_id),
            provider: &page.provider,
            model: &page.model,
            message,
            level,
            usage,
            cost_usd: None,
            duration_ms: Some(duration_ms),
            attempt_number: Some(ctx.attempt),
            max_attempts: Some(ctx.max_attempts),
        };
        let _ = ctx.with_database(|conn| write_ocr_log(conn, &entry)).await;
    }
}
