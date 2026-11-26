//! Le pagine di un PDF importato, disegnate come immagini.
//!
//! Il lavoro legge il documento della copia PDF e scrive una pagina JPEG per
//! ogni pagina del PDF nella copia a immagini dell'opera, con la stessa forma
//! di una copia scaricata: `pages/max/NNNN.jpg`, `pages.jsonl`, miniature e un
//! manifesto generato qui. Così visore, ottimizzazione e OCR la trattano come
//! un libro tutto sul disco. Nessuna richiesta di rete.

pub mod commands;
pub mod import;
pub mod render;

use async_trait::async_trait;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::download::sidecar::{self, PageRecord};
use crate::download::vault_io::{discard, now_secs, stage_and_promote, stopped_outcome};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

pub const JOB_TYPE: &str = "pdf_page_extraction";

/// Schema degli indirizzi delle copie importate. Non è un indirizzo di rete:
/// chi lo incontra sa che la pagina sta solo sul computer.
pub const IMPORT_SCHEME: &str = "glossa-import:";

/// Cartella di misura delle pagine estratte: la risoluzione piena della pagina.
pub const SIZE_TAG: &str = "max";

/// Errore di una pagina di copia importata che non è nel deposito.
pub const PAGE_NOT_LOCAL: &str = "page_not_local";

/// Vero per un indirizzo di copia importata, che non si chiede mai alla rete.
pub fn is_import_url(url: &str) -> bool {
    url.starts_with(IMPORT_SCHEME)
}

/// Identificativo del lavoro: uno per copia PDF.
pub fn job_id(pdf_version_id: &str) -> String {
    format!("extract:{pdf_version_id}")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractConfig {
    pub provider_key: String,
    pub pdf_version_id: String,
    pub image_version_id: String,
}

mod phase {
    pub const EXTRACTING: &str = "extracting";
}

pub struct PdfPageExtractionJob;

#[async_trait]
impl JobHandler for PdfPageExtractionJob {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::Cpu
    }

    fn recovery(&self) -> Recovery {
        // Una pagina promossa si riconosce dal file: la ripresa la salta.
        Recovery::Resumable
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let config: ExtractConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;
        let root = ctx
            .vault_root()
            .await
            .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        let paths = Paths::new(&root, &config).map_err(internal)?;

        let document = paths.document.clone();
        let pdf = tauri::async_runtime::spawn_blocking(move || {
            let bytes = std::fs::read(&document)
                .map_err(|error| JobError::new(ErrorKind::Storage, format!("pdf: {error}")))?;
            render::open(bytes).map_err(|error| JobError::new(ErrorKind::Format, error.to_string()))
        })
        .await
        .map_err(|error| internal(error.to_string()))??;
        let pdf = Arc::new(pdf);
        let total = pdf.pages().len() as u32;
        if total == 0 {
            return Err(JobError::new(
                ErrorKind::Format,
                "pdf_without_pages".to_string(),
            ));
        }

        for dir in [&paths.staging, &paths.size_dir] {
            std::fs::create_dir_all(dir)
                .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
        }
        let labels = labels_from_source_manifest(&paths.source_manifest, total);
        let known = sidecar::read(&paths.size_dir);
        ctx.report_phase(phase::EXTRACTING).await;
        log::info!("job extract starting id={} pages={total}", ctx.id);

        let mut failed: Vec<u32> = Vec::new();
        for index in 1..=total {
            if ctx.pause_requested() || ctx.cancel_requested() {
                return Ok(stopped_outcome(ctx.cancel_requested(), &paths.staging));
            }
            let target = paths.size_dir.join(layout::page_file_name(index));
            if !(target.is_file() && known.contains_key(&index)) {
                let pdf = Arc::clone(&pdf);
                let page = Page {
                    index,
                    label: labels.get(&index).cloned(),
                };
                let work = paths.clone();
                let outcome =
                    tauri::async_runtime::spawn_blocking(move || extract_one(&pdf, &work, &page))
                        .await
                        .map_err(|error| internal(error.to_string()))?;
                if let Err(error) = outcome {
                    log::warn!("job extract page failed page={index} error={error}");
                    failed.push(index);
                }
            }
            ctx.report(
                f64::from(index) / f64::from(total),
                None,
                None,
                Some(&detail(index, total, &failed)),
            )
            .await;
        }

        discard(&paths.staging);
        let records = sidecar::read(&paths.size_dir);
        let manifest = generated_manifest(&config.image_version_id, total, &records, &labels);
        stage_and_promote(
            &paths.staging.join(layout::MANIFEST_FILE),
            &paths.manifest,
            manifest.to_string().as_bytes(),
            integrity::FileKind::Manifest,
        )?;
        discard(&paths.staging);
        let image_version_id = config.image_version_id.clone();
        ctx.with_database(move |conn| {
            conn.execute(
                "UPDATE source_versions SET expected_asset_count = ?2 WHERE id = ?1",
                rusqlite::params![image_version_id, i64::from(total)],
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| JobError::new(ErrorKind::Storage, error))?;

        log::info!(
            "job extract complete id={} pages={total} failed={}",
            ctx.id,
            failed.len()
        );
        if !failed.is_empty() {
            let list: Vec<String> = failed.iter().map(u32::to_string).collect();
            return Err(JobError::new(
                ErrorKind::Format,
                format!("extraction_incomplete:{}", list.join(",")),
            ));
        }
        Ok(Outcome::Done)
    }
}

fn internal(message: String) -> JobError {
    JobError::new(ErrorKind::Internal, message)
}

/// I percorsi assoluti che il lavoro tocca.
#[derive(Clone)]
struct Paths {
    document: PathBuf,
    source_manifest: PathBuf,
    size_dir: PathBuf,
    staging: PathBuf,
    manifest: PathBuf,
    thumbnails: PathBuf,
}

impl Paths {
    fn new(root: &Path, config: &ExtractConfig) -> Result<Self, String> {
        let provider = &config.provider_key;
        let area = format!("{}-extract", config.image_version_id);
        Ok(Self {
            document: root.join(layout::document_path(provider, &config.pdf_version_id)?),
            source_manifest: root.join(layout::source_manifest_path(
                provider,
                &config.pdf_version_id,
            )?),
            size_dir: root
                .join(layout::pages_dir(provider, &config.image_version_id)?)
                .join(SIZE_TAG),
            staging: root
                .join(layout::STAGING_DIR)
                .join(layout::safe_component(&area)?),
            manifest: root.join(layout::manifest_path(provider, &config.image_version_id)?),
            thumbnails: root
                .join(layout::version_dir(provider, &config.image_version_id)?)
                .join(layout::THUMBNAILS_DIR),
        })
    }
}

struct Page {
    index: u32,
    label: Option<String>,
}

/// Disegna una pagina, la porta nel deposito con la sua riga e la miniatura.
fn extract_one(pdf: &hayro::hayro_syntax::Pdf, paths: &Paths, page: &Page) -> Result<(), String> {
    let rendered = render::render_page(pdf, (page.index - 1) as usize, render::JPEG_QUALITY)
        .map_err(|error| error.to_string())?;
    let name = layout::page_file_name(page.index);
    let checksum = stage_and_promote(
        &paths.staging.join(&name),
        &paths.size_dir.join(&name),
        &rendered.jpeg,
        integrity::FileKind::Image,
    )
    .map_err(|error| error.message)?;
    sidecar::append(
        &paths.size_dir,
        &PageRecord {
            index: page.index,
            label: page.label.clone(),
            got: Some((rendered.width, rendered.height)),
            bytes: Some(rendered.jpeg.len() as u64),
            checksum: Some(checksum),
            at: now_secs(),
            note: None,
        },
    )
    .map_err(|error| format!("riga non scritta: {error}"))?;

    // Una miniatura che non riesce non fa fallire la pagina.
    match images::thumbnail(&rendered.jpeg, images::DEFAULT_THUMBNAIL_EDGE) {
        Ok(thumbnail) => {
            if let Err(error) = stage_and_promote(
                &paths.staging.join(format!("{:04}-thumb.jpg", page.index)),
                &paths.thumbnails.join(&name),
                &thumbnail,
                integrity::FileKind::Image,
            ) {
                log::warn!(
                    "job extract thumbnail not stored page={} error={}",
                    page.index,
                    error.message
                );
            }
        }
        Err(error) => log::warn!(
            "job extract thumbnail not derived page={} error={error}",
            page.index
        ),
    }
    Ok(())
}

/// Le etichette delle pagine del manifesto caricato a mano, solo se conta
/// tante pagine quante il PDF: con conteggi diversi non si sa a quale pagina
/// vada ciascuna.
fn labels_from_source_manifest(path: &Path, total: u32) -> BTreeMap<u32, String> {
    let Ok(bytes) = std::fs::read(path) else {
        return BTreeMap::new();
    };
    let Ok(parsed) = crate::download::manifest::parse(&bytes) else {
        return BTreeMap::new();
    };
    labels_if_counts_match(parsed.pages, total)
}

fn labels_if_counts_match(
    pages: Vec<crate::download::manifest::Page>,
    total: u32,
) -> BTreeMap<u32, String> {
    if pages.len() as u32 != total {
        return BTreeMap::new();
    }
    pages
        .into_iter()
        .filter_map(|page| page.label.map(|label| (page.index, label)))
        .collect()
}

/// Manifesto IIIF Presentation 3 della copia a immagini: un canvas per pagina
/// del PDF, con le dimensioni delle pagine estratte. Gli indirizzi usano lo
/// schema delle copie importate, quindi nessuno li chiede alla rete.
fn generated_manifest(
    version_id: &str,
    total: u32,
    records: &BTreeMap<u32, PageRecord>,
    labels: &BTreeMap<u32, String>,
) -> serde_json::Value {
    let base = format!("{IMPORT_SCHEME}{version_id}");
    // Una pagina non estratta tiene comunque il suo posto, con le misure della
    // pagina vicina: la numerazione deve restare quella del PDF.
    let mut last_size = (1000, 1400);
    let canvases: Vec<serde_json::Value> = (1..=total)
        .map(|index| {
            let size = records
                .get(&index)
                .and_then(|record| record.got)
                .unwrap_or(last_size);
            last_size = size;
            let label = labels
                .get(&index)
                .cloned()
                .unwrap_or_else(|| index.to_string());
            let image = format!("{base}/page/{index}");
            serde_json::json!({
                "id": format!("{base}/canvas/{index}"),
                "type": "Canvas",
                "label": { "none": [label] },
                "width": size.0,
                "height": size.1,
                "items": [{
                    "id": format!("{base}/canvas/{index}/page"),
                    "type": "AnnotationPage",
                    "items": [{
                        "id": format!("{base}/canvas/{index}/image"),
                        "type": "Annotation",
                        "motivation": "painting",
                        "target": format!("{base}/canvas/{index}"),
                        "body": {
                            "id": image,
                            "type": "Image",
                            "format": "image/jpeg",
                            "width": size.0,
                            "height": size.1,
                            "service": [{ "id": image, "type": "ImageService3", "profile": "level0" }]
                        }
                    }]
                }]
            })
        })
        .collect();
    serde_json::json!({
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": base,
        "type": "Manifest",
        "label": { "none": ["PDF"] },
        "items": canvases,
    })
}

fn detail(done: u32, total: u32, failed: &[u32]) -> String {
    serde_json::json!({
        "units": { "done": done, "total": total, "label": "items" },
        "failed": failed,
    })
    .to_string()
}

#[cfg(test)]
mod tests;
