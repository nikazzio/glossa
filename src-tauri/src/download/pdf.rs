//! Il documento unico offerto dalla biblioteca: un file, non una sequenza.
//!
//! Vale per le digitalizzazioni che la biblioteca serve come PDF. Il ciclo è
//! più corto di quello delle pagine — nessun manifesto, nessuna misura da
//! calcolare — ma le regole del deposito sono le stesse: si aspetta il proprio
//! turno verso l'host, si scrive in transito, si valida, e solo allora il file
//! entra nel deposito.
//!
//! Il documento **non** è una misura della copia a immagini: sta accanto ad
//! essa, con il suo conteggio di pagine letto dal file. Le due non promettono
//! la stessa identità di pagina e non si fondono in un unico sfoglio.

use async_trait::async_trait;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;

use crate::jobs::commands::JobsState;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::store::NewJob;
use crate::jobs::{ErrorKind, JobError, JobRecord, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

use super::courtesy::{Courtesy, Lane, Signals};
use super::fetch::{build_client, classify, host_of, retry_after_secs};
use super::vault_io::{discard, now_secs, stopped_outcome};

pub const JOB_TYPE: &str = "source_pdf_download";

/// Prefisso dell'identificativo: uno per digitalizzazione, come per le pagine,
/// e diverso da quello dello scaricamento a immagini perché un'opera può avere
/// entrambe le copie e i due lavori non si escludono.
const JOB_ID_PREFIX: &str = "pdf";

/// È ciò che l'utente ha appena chiesto guardando lo schermo: stessa
/// precedenza dello scaricamento delle pagine.
const DOWNLOAD_PRIORITY: i64 = 10;

/// Oltre questa misura il documento non viene aperto per contarne le pagine:
/// contarle significa tenerlo tutto in memoria, e un documento di questa taglia
/// la occuperebbe tutta per un numero che è solo un'informazione. Il file
/// resta, e la scheda dice quello che sa.
const MAX_COUNTABLE_BYTES: u64 = 512 * 1024 * 1024;

/// Quanto spesso si riferisce l'avanzamento mentre i byte arrivano.
const PROGRESS_EVERY_BYTES: u64 = 512 * 1024;

/// L'identificativo del lavoro che scarica il documento di una
/// digitalizzazione.
pub fn job_id(version_id: &str) -> String {
    format!("{JOB_ID_PREFIX}:{version_id}")
}

mod phase {
    pub const STARTING: &str = "starting";
    pub const DOWNLOADING: &str = "downloading";
    /// Il documento è arrivato e si sta contando quante pagine ha.
    pub const READING: &str = "reading_document";
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfConfig {
    /// Chiave del registro dei provider: determina il profilo di rete.
    pub provider_key: String,
    /// Identificativo della digitalizzazione; nomina la cartella nel deposito.
    pub version_id: String,
    /// L'indirizzo del file, così come la biblioteca lo dichiara.
    pub source_url: String,
}

/// Quello che del documento non si legge dal file di sistema.
///
/// Sta in un file accanto al documento e non nel database perché è un fatto del
/// deposito: cancellare la cartella deve portarsi via anche questo, senza
/// lasciare una riga che parla di un file che non c'è più.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub source_url: String,
    pub bytes: u64,
    /// Quante pagine ha davvero il file. Assente quando il documento non si è
    /// potuto aprire: protetto da una parola d'ordine, malformato, o troppo
    /// grande per essere contato.
    pub pages: Option<u32>,
    pub checksum: String,
    pub downloaded_at: i64,
}

/// Mette in coda lo scaricamento del documento di una digitalizzazione.
#[tauri::command]
pub async fn enqueue_pdf_download(
    jobs: tauri::State<'_, JobsState>,
    provider_key: String,
    source_url: String,
    version_id: String,
    workspace_id: Option<String>,
) -> Result<JobRecord, String> {
    let conn = jobs.0.connection()?;
    let profile = crate::iiif::settings::effective_profile(
        &conn,
        &provider_key,
        host_of(&source_url).ok().as_deref(),
    );
    // Il nome dell'opera si scrive già adesso: in coda il pannello mostra
    // questo, e «Scaricamento» da solo non dice quale libro.
    let title: Option<String> = conn
        .query_row(
            "SELECT s.title FROM sources s \
             JOIN source_versions v ON v.source_id = s.id WHERE v.id = ?1",
            rusqlite::params![version_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let id = job_id(&version_id);
    let existing = crate::jobs::store::get(&conn, &id)?;
    drop(conn);

    let config = serde_json::json!({
        "providerKey": provider_key,
        "versionId": version_id,
        "sourceUrl": source_url,
    });

    if let Some(job) = existing {
        // Chiedere di nuovo lo stesso documento mentre arriva non è un errore:
        // si ritrova il lavoro in corso, che è quello che si voleva vedere.
        if !job.status.is_terminal() {
            return Ok(job);
        }
        jobs.0
            .relaunch_with_config(&id, &config.to_string())
            .await?;
        let conn = jobs.0.connection()?;
        return crate::jobs::store::get(&conn, &id)?
            .ok_or_else(|| "il lavoro è sparito subito dopo essere stato ripreso".to_string());
    }

    jobs.0
        .submit(&NewJob {
            id,
            job_type: JOB_TYPE.to_string(),
            priority: DOWNLOAD_PRIORITY,
            config: config.to_string(),
            max_attempts: profile.max_attempts,
            depends_on_job_id: None,
            workspace_id,
            message: title,
        })
        .await
}

pub struct PdfDownloadJob {
    /// Contatori di cortesia per host: pause, raffica, raffreddamenti.
    courtesy: std::sync::Arc<Courtesy>,
}

impl PdfDownloadJob {
    pub fn new(courtesy: std::sync::Arc<Courtesy>) -> Self {
        Self { courtesy }
    }
}

#[async_trait]
impl JobHandler for PdfDownloadJob {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::Network
    }

    fn recovery(&self) -> Recovery {
        // Un file solo: metà documento non serve a niente e non si riprende da
        // dove era arrivato. Si rifà da capo.
        Recovery::Restart
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let stop = || ctx.pause_requested() || ctx.cancel_requested();
        let courtesy_wait = std::sync::atomic::AtomicBool::new(false);
        let signals = Signals {
            stop: &stop,
            courtesy_wait: &courtesy_wait,
        };

        ctx.report_phase(phase::STARTING).await;
        let config: PdfConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;

        let root = ctx
            .vault_root()
            .await
            .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        if !root.is_dir() {
            return Err(JobError::new(
                ErrorKind::Storage,
                "vault_unreachable".to_string(),
            ));
        }
        let staging = root.join(layout::STAGING_DIR).join(
            layout::safe_component(&config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;

        let outcome = self
            .download(&ctx, &config, &root, &staging, &signals)
            .await;
        discard(&staging);
        outcome
    }
}

impl PdfDownloadJob {
    /// Il ciclo: turno verso l'host, richiesta, byte scritti in transito,
    /// validazione, promozione, conteggio delle pagine.
    async fn download(
        &self,
        ctx: &JobContext,
        config: &PdfConfig,
        root: &Path,
        staging: &Path,
        signals: &Signals<'_>,
    ) -> Result<Outcome, JobError> {
        let profile =
            super::catalog::profile_of(ctx, &config.provider_key, &config.source_url).await;
        let client = build_client(&profile)?;
        let host = host_of(&config.source_url)?;

        let staged = staging.join(layout::DOCUMENT_FILE);
        let target = root.join(
            layout::document_path(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        let meta_target = root.join(
            layout::document_meta_path(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );

        ctx.report_phase(phase::DOWNLOADING).await;
        // Il posto in corsia si tiene per tutto il trasferimento: è una
        // richiesta sola e lunga, e lasciarlo andare a metà significherebbe
        // permettere a un secondo lavoro di bussare allo stesso server mentre
        // questo sta ancora scaricando.
        let Some(_turn) = self
            .courtesy
            .wait_turn(&host, &profile, Lane::Bulk, signals)
            .await
        else {
            return Ok(stopped_outcome(ctx.cancel_requested(), staging));
        };

        let response = client
            .get(&config.source_url)
            .header(
                reqwest::header::ACCEPT,
                "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
            )
            .send()
            .await
            .map_err(|error| {
                // Host e non indirizzo completo: l'indirizzo di un documento può
                // portare parametri firmati, e il registro è un file che resta.
                log::warn!("document request failed host={host} error={error}");
                JobError::new(ErrorKind::Transport, "la biblioteca non risponde")
            })?;

        let status = response.status();
        if !status.is_success() {
            return Err(classify(
                status,
                retry_after_secs(&response),
                &config.source_url,
                &profile,
            ));
        }

        let expected = response.content_length();
        let written = match write_stream(ctx, response, &staged, expected, signals).await? {
            Some(written) => written,
            None => return Ok(stopped_outcome(ctx.cancel_requested(), staging)),
        };

        // Validazione e impronta come per ogni file del deposito, ma leggendo
        // dal transito invece che dalla memoria: un documento può pesare
        // centinaia di megabyte, e tenerlo in memoria per controllarne cinque
        // byte di firma sarebbe la sola parte cara dell'operazione.
        let scan = integrity::scan_file(&staged, integrity::FileKind::Pdf);
        let checksum = match scan.validation {
            integrity::Validation::Valid => scan.checksum.ok_or_else(|| {
                JobError::new(ErrorKind::Internal, "impronta non calcolata".to_string())
            })?,
            integrity::Validation::Corrupt(reason) => {
                return Err(JobError::new(ErrorKind::Transport, reason))
            }
            integrity::Validation::Missing => {
                return Err(JobError::new(
                    ErrorKind::Storage,
                    "risposta vuota".to_string(),
                ))
            }
        };

        ctx.report_phase(phase::READING).await;
        // Le pagine si contano **dal file**, non da quello che la biblioteca
        // dichiara: è l'unico numero che descrive ciò che si ha in casa.
        let counted = staged.clone();
        let pages = tokio::task::spawn_blocking(move || count_pages(&counted, written))
            .await
            .unwrap_or(None);

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
        }
        std::fs::rename(&staged, &target)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
        write_record(
            &meta_target,
            &DocumentRecord {
                source_url: config.source_url.clone(),
                bytes: written,
                pages,
                checksum,
                downloaded_at: now_secs(),
            },
        )?;

        ctx.report(
            1.0,
            None,
            Some(0),
            Some(&detail(
                written,
                expected,
                pages,
                &config.provider_key,
                &host,
            )),
        )
        .await;
        log::info!(
            "document downloaded version={} bytes={written} pages={}",
            config.version_id,
            pages.map(|count| count.to_string()).unwrap_or_default()
        );
        Ok(Outcome::Done)
    }
}

/// I byte, dalla rete al transito, senza tenerli tutti in memoria.
///
/// `Ok(None)` significa «fermato mentre scaricava»: il file a metà resta nel
/// transito, che viene buttato all'uscita del lavoro.
async fn write_stream(
    ctx: &JobContext,
    response: reqwest::Response,
    staged: &Path,
    expected: Option<u64>,
    signals: &Signals<'_>,
) -> Result<Option<u64>, JobError> {
    use std::io::Write;

    if let Some(parent) = staged.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    let mut file = std::fs::File::create(staged)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    let mut stream = response.bytes_stream();
    let mut written: u64 = 0;
    let mut reported_at: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if (signals.stop)() {
            return Ok(None);
        }
        let chunk = chunk.map_err(|error| {
            log::warn!("document stream truncated error={error}");
            JobError::new(ErrorKind::Transport, "risposta interrotta a metà")
        })?;
        file.write_all(&chunk)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
        written += chunk.len() as u64;
        if written - reported_at >= PROGRESS_EVERY_BYTES {
            reported_at = written;
            // Senza una misura dichiarata non c'è una frazione da mostrare: la
            // barra resta all'inizio e il dettaglio dice quanto è arrivato.
            let ratio = expected
                .filter(|total| *total > 0)
                .map(|total| (written as f64 / total as f64).min(0.99))
                .unwrap_or(0.0);
            ctx.report_progress(ratio, None, None).await;
        }
    }
    file.flush()
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    Ok(Some(written))
}

/// Il dettaglio che il pannello sa leggere: byte arrivati, pagine, biblioteca.
fn detail(
    written: u64,
    expected: Option<u64>,
    pages: Option<u32>,
    provider_key: &str,
    host: &str,
) -> String {
    serde_json::json!({
        "units": { "done": pages.unwrap_or(0), "total": pages.unwrap_or(0), "label": "items" },
        "bytes": { "downloaded": written, "estimated": expected.unwrap_or(written) },
        "provider": provider_key,
        "host": host,
    })
    .to_string()
}

/// Quante pagine ha il documento. `None` quando non si è potuto aprire: un PDF
/// protetto o malformato resta comunque un file che si può conservare e aprire
/// altrove, e la scheda dirà quello che sa.
pub(crate) fn count_pages(path: &Path, bytes: u64) -> Option<u32> {
    if bytes > MAX_COUNTABLE_BYTES {
        log::info!(
            "pdf pages not counted path={} bytes={bytes}",
            path.display()
        );
        return None;
    }
    match lopdf::Document::load(path) {
        Ok(document) => u32::try_from(document.get_pages().len()).ok(),
        Err(error) => {
            log::warn!("pdf not readable path={} error={error}", path.display());
            None
        }
    }
}

/// Oltre questa misura il documento non si apre dentro Glossa: i byte
/// passerebbero tutti nella finestra, che non ha la memoria per tenerli. Si
/// offre invece di aprirlo con il lettore del sistema, che legge dal disco.
const MAX_VIEWABLE_BYTES: u64 = 256 * 1024 * 1024;

/// I byte del documento, per il visore.
///
/// Il percorso non arriva mai alla finestra: si compone qui dalla chiave della
/// biblioteca e dall'identificativo della digitalizzazione, che sono valori
/// nostri e vengono validati come componente di percorso.
///
/// Byte grezzi e non un vettore serializzato, per la stessa ragione delle
/// pagine: un `Vec<u8>` che attraversa il ponte diventa un elenco di numeri in
/// JSON, e qui si parla di decine di megabyte.
#[tauri::command]
pub fn document_bytes(
    app: tauri::AppHandle,
    provider_key: String,
    version_id: String,
) -> Result<tauri::ipc::Response, String> {
    let path = document_in_vault(&app, &provider_key, &version_id)?;
    let size = std::fs::metadata(&path)
        .map_err(|error| format!("document_unreadable:{error}"))?
        .len();
    if size > MAX_VIEWABLE_BYTES {
        return Err(format!("document_too_large:{size}"));
    }
    let bytes = std::fs::read(&path).map_err(|error| format!("document_unreadable:{error}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Apre il documento con il lettore del sistema: è la via d'uscita quando è
/// troppo grande per essere aperto dentro Glossa.
#[tauri::command]
pub fn open_document_externally(
    app: tauri::AppHandle,
    provider_key: String,
    version_id: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = document_in_vault(&app, &provider_key, &version_id)?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| format!("document_not_opened:{error}"))
}

fn document_in_vault(
    app: &tauri::AppHandle,
    provider_key: &str,
    version_id: &str,
) -> Result<std::path::PathBuf, String> {
    let root = crate::vault::commands::root_of(app)?;
    let path = root.join(layout::document_path(provider_key, version_id)?);
    if !path.is_file() {
        return Err("document_missing".to_string());
    }
    Ok(path)
}

/// La scheda del documento presente nel deposito, quando c'è.
pub fn record_at(meta_path: &Path) -> Option<DocumentRecord> {
    let bytes = std::fs::read(meta_path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_record(meta_path: &Path, record: &DocumentRecord) -> Result<(), JobError> {
    let body = serde_json::to_vec_pretty(record)
        .map_err(|error| JobError::new(ErrorKind::Internal, error.to_string()))?;
    std::fs::write(meta_path, body)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un PDF vero, con il numero di pagine chiesto: contarle è l'unica cosa
    /// che qui si può provare senza rete.
    fn pdf_with_pages(count: usize) -> Vec<u8> {
        let mut document = lopdf::Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let page_ids: Vec<lopdf::Object> = (0..count)
            .map(|_| {
                let contents = document.add_object(lopdf::Stream::new(
                    lopdf::Dictionary::new(),
                    b"BT ET".to_vec(),
                ));
                let mut page = lopdf::Dictionary::new();
                page.set("Type", "Page");
                page.set("Parent", pages_id);
                page.set("Contents", contents);
                lopdf::Object::Reference(document.add_object(page))
            })
            .collect();
        let mut pages = lopdf::Dictionary::new();
        pages.set("Type", "Pages");
        pages.set("Count", count as i64);
        pages.set("Kids", page_ids);
        document
            .objects
            .insert(pages_id, lopdf::Object::Dictionary(pages));
        let mut catalog = lopdf::Dictionary::new();
        catalog.set("Type", "Catalog");
        catalog.set("Pages", pages_id);
        let catalog_id = document.add_object(catalog);
        document.trailer.set("Root", catalog_id);
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).expect("PDF di prova");
        bytes
    }

    fn temp_pdf(name: &str, bytes: &[u8]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("glossa-pdf-{name}.pdf"));
        std::fs::write(&path, bytes).expect("scrittura del PDF di prova");
        path
    }

    #[test]
    fn the_pages_are_counted_from_the_file() {
        let bytes = pdf_with_pages(3);
        let path = temp_pdf("count", &bytes);
        assert_eq!(count_pages(&path, bytes.len() as u64), Some(3));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_document_that_does_not_open_leaves_the_count_unknown() {
        // Il caso vero: la biblioteca ha risposto con qualcosa che non è un PDF.
        let path = temp_pdf("broken", b"<!doctype html><html></html>");
        assert_eq!(count_pages(&path, 28), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_document_too_big_is_not_opened_to_be_counted() {
        let bytes = pdf_with_pages(1);
        let path = temp_pdf("huge", &bytes);
        assert_eq!(count_pages(&path, MAX_COUNTABLE_BYTES + 1), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn the_record_survives_a_round_trip_on_disk() {
        let path = std::env::temp_dir().join("glossa-pdf-record.json");
        let record = DocumentRecord {
            source_url: "https://example.org/opera.pdf".to_string(),
            bytes: 1234,
            pages: Some(12),
            checksum: "abcdef0123456789".to_string(),
            downloaded_at: 1_700_000_000,
        };
        write_record(&path, &record).expect("scrittura della scheda");
        let read = record_at(&path).expect("la scheda si rilegge");
        assert_eq!(read.pages, Some(12));
        assert_eq!(read.source_url, record.source_url);
        assert_eq!(read.checksum, record.checksum);
        let _ = std::fs::remove_file(&path);
    }
}
