//! Copie a risoluzione ridotta, ricavate in locale da una misura già
//! scaricata.
//!
//! Ogni lavoro legge una cartella di misura e ne scrive una **nuova**, sotto
//! `derived/`: l'originale da cui si parte non viene mai toccato. Elaborazione
//! in parallelo su più pagine insieme, quante ne regge il processore. Parte
//! solo su richiesta dell'utente.

pub mod commands;
#[cfg(test)]
mod job_it;

use async_trait::async_trait;
use serde::Deserialize;
use std::collections::{BTreeMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Semaphore;

use crate::download::sidecar::{self, Note, PageRecord};
use crate::download::vault_io::{discard, now_secs, stage_and_promote, stopped_outcome};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

pub const JOB_TYPE: &str = "image_optimization";

/// Estremi accettati per il lato lungo di arrivo.
pub const MIN_LONG_EDGE: u32 = 512;
pub const MAX_LONG_EDGE: u32 = 12_000;
/// Estremi accettati per la qualità JPEG.
pub const MIN_QUALITY: u8 = 40;
pub const MAX_QUALITY: u8 = 100;

/// Predefiniti, gli stessi che stanno in Impostazioni → Scaricamento. 2000 è il
/// tetto delle pagine; 82 è il valore di Scriptoria.
pub const DEFAULT_LONG_EDGE: u32 = 2000;
pub const DEFAULT_QUALITY: u8 = 82;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeConfig {
    pub provider_key: String,
    pub version_id: String,
    /// La cartella di misura da cui si legge. Non viene mai scritta.
    pub source_size_tag: String,
    /// La cartella di misura d'arrivo, dentro `derived/`: coincide col lato
    /// lungo chiesto, sempre diversa dalla fonte.
    pub target_size_tag: String,
    pub long_edge: u32,
    pub quality: u8,
}

mod phase {
    pub const OPTIMIZING: &str = "optimizing";
}

/// Misure da avere prima di fidarsi del ritmo osservato, e quante pagine guarda.
/// Gli stessi valori dello scaricamento: con una o due la media è quella di un
/// campione, e una finestra corta si dimentica di una pagina lenta isolata.
const PACE_SAMPLE: usize = 3;
const PACE_WINDOW: usize = 10;

/// Cosa è successo a una pagina.
enum PageResult {
    /// Ricompressa: byte prima e dopo.
    Shrunk { before: u64, after: u64 },
    /// Copiata così com'è nella cartella d'arrivo: già dentro il lato lungo
    /// scelto, o la ricompressione non avrebbe liberato niente.
    Untouched,
}

pub struct ImageOptimizationJob;

#[async_trait]
impl JobHandler for ImageOptimizationJob {
    fn resource_class(&self) -> ResourceClass {
        // Decodifica, ridimensionamento e ricodifica: processore, non rete.
        ResourceClass::Cpu
    }

    fn recovery(&self) -> Recovery {
        // Riprendere è sicuro: una pagina già promossa nella cartella d'arrivo
        // si riconosce dal file e si salta al giro dopo.
        Recovery::Resumable
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let config: OptimizeConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;
        let long_edge = config.long_edge.clamp(MIN_LONG_EDGE, MAX_LONG_EDGE);
        let quality = config.quality.clamp(MIN_QUALITY, MAX_QUALITY);

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
        let source_dir = root.join(
            layout::pages_dir(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?
                .join(
                    layout::safe_component(&config.source_size_tag)
                        .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
                ),
        );
        let target_dir = root.join(
            layout::derived_size_dir(
                &config.provider_key,
                &config.version_id,
                &config.target_size_tag,
            )
            .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        // Scaricamento e ottimizzazione non devono condividere file temporanei.
        let area = format!("{}-optimize-{}", config.version_id, config.target_size_tag);
        let staging = root.join(layout::STAGING_DIR).join(
            layout::safe_component(&area)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;
        std::fs::create_dir_all(&target_dir).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("cartella d'arrivo: {error}"))
        })?;

        let pages = pages_in(&source_dir);
        let total = pages.len() as u32;
        let started_at = Instant::now();
        // Le pagine copiate senza perdita non entrano nel ritmo: sono quasi
        // istantanee, e mescolarle darebbe una stima ottimista.
        let mut recent: VecDeque<Instant> = VecDeque::new();
        ctx.report_phase(phase::OPTIMIZING).await;
        log::info!(
            "job optimize starting id={} pages={total} long_edge={long_edge} quality={quality}",
            ctx.id
        );

        // L'etichetta di ogni pagina viene dalla fonte: la cartella d'arrivo
        // parte vuota e non ne sa ancora niente.
        let source_known = Arc::new(sidecar::read(&source_dir));
        let work = Arc::new(Workspace {
            target_dir: target_dir.clone(),
            staging: staging.clone(),
            long_edge,
            quality,
            source_known,
        });

        // Quante pagine insieme: come i lavori CPU in coda, tutti i nuclei
        // meno uno, così il resto dell'app resta reattivo.
        let concurrency = std::thread::available_parallelism()
            .map(|value| value.get().saturating_sub(1).max(1))
            .unwrap_or(1);
        let semaphore = Arc::new(Semaphore::new(concurrency));

        let mut done = 0u32;
        let mut shrunk = 0u32;
        let mut skipped = 0u32;
        let mut freed: u64 = 0;
        let mut handles = Vec::new();
        let mut stopped = false;

        for (index, path) in pages {
            if ctx.pause_requested() || ctx.cancel_requested() {
                stopped = true;
                break;
            }
            // Già promossa in un giro precedente: il file lo dice da solo,
            // non serve rileggere la riga di lato per saperlo.
            if target_dir.join(layout::page_file_name(index)).is_file() {
                done += 1;
                continue;
            }
            let permit = Arc::clone(&semaphore)
                .acquire_owned()
                .await
                .map_err(|error| JobError::new(ErrorKind::Internal, error.to_string()))?;
            let work = Arc::clone(&work);
            handles.push(tauri::async_runtime::spawn_blocking(move || {
                let outcome = optimise_one(&work, index, &path);
                drop(permit);
                (index, outcome)
            }));
        }

        for handle in handles {
            let (index, outcome) = handle
                .await
                .map_err(|error| JobError::new(ErrorKind::Internal, error.to_string()))?;
            let last = match &outcome {
                Ok(PageResult::Shrunk { before, after }) => {
                    shrunk += 1;
                    freed += before.saturating_sub(*after);
                    recent.push_back(Instant::now());
                    while recent.len() > PACE_WINDOW + 1 {
                        recent.pop_front();
                    }
                    Some(*after)
                }
                Ok(PageResult::Untouched) => None,
                // Una pagina che non si riesce a copiare resta assente nella
                // cartella d'arrivo: si scrive nel registro e si va avanti.
                Err(error) => {
                    skipped += 1;
                    log::warn!("job optimize skipped page={index} error={error}");
                    None
                }
            };
            done += 1;

            ctx.report(
                f64::from(done) / f64::from(total.max(1)),
                None,
                Some(eta_seconds(&recent, total - done, started_at)),
                Some(&detail(done, total, shrunk, skipped, freed, index, last)),
            )
            .await;
            tokio::task::yield_now().await;
        }

        discard(&staging);
        if stopped {
            return Ok(stopped_outcome(ctx.cancel_requested(), &staging));
        }
        log::info!(
            "job optimize complete id={} shrunk={shrunk}/{total} skipped={skipped} freed={freed}",
            ctx.id
        );
        if skipped > 0 {
            return Err(JobError::new(
                ErrorKind::Format,
                format!("optimization_incomplete:{skipped}"),
            ));
        }
        Ok(Outcome::Done)
    }
}

/// Le pagine di una cartella di misura, in ordine, file di lato escluso.
fn pages_in(size_dir: &Path) -> Vec<(u32, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(size_dir) else {
        return Vec::new();
    };
    let mut pages: Vec<(u32, PathBuf)> = entries
        .flatten()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let path = entry.path();
            let index = path.file_stem()?.to_string_lossy().parse::<u32>().ok()?;
            Some((index, path))
        })
        .collect();
    pages.sort_by_key(|(index, _)| *index);
    pages
}

/// Dove scrivere e con che valori: le stesse cose per ogni pagina, condivise
/// fra i lavori che girano insieme.
struct Workspace {
    target_dir: PathBuf,
    staging: PathBuf,
    long_edge: u32,
    quality: u8,
    /// Le righe di `pages.jsonl` della cartella di **partenza**: servono solo
    /// a portare l'etichetta della pagina nella cartella d'arrivo.
    source_known: Arc<BTreeMap<u32, PageRecord>>,
}

/// Una pagina: legge dalla fonte, decide se ricomprimere o copiare così
/// com'è, scrive nella cartella d'arrivo, registra la riga di lato.
fn optimise_one(work: &Workspace, index: u32, path: &Path) -> Result<PageResult, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let before = bytes.len() as u64;
    let (width, height) =
        dimensions(&bytes).ok_or_else(|| "formato immagine non riconoscibile".to_string())?;

    // Già dentro il lato lungo scelto: si copia il file com'è, senza
    // perdere niente per un ridimensionamento che non farebbe nulla.
    let (final_bytes, note): (Vec<u8>, Option<Note>) = if width.max(height) <= work.long_edge {
        (bytes, None)
    } else {
        match images::resize_jpeg(&bytes, work.long_edge, work.quality) {
            Ok(reduced) if (reduced.len() as u64) < before => (
                reduced,
                Some(Note::Downscaled {
                    from: (width, height),
                }),
            ),
            // Una ricompressione che non libera spazio non vale la perdita:
            // si tiene l'originale, copiato così com'è.
            Ok(_) => (bytes, None),
            Err(error) => return Err(error.to_string()),
        }
    };

    let checksum = stage_and_promote(
        &work.staging.join(layout::page_file_name(index)),
        &work.target_dir.join(layout::page_file_name(index)),
        &final_bytes,
        integrity::FileKind::Image,
    )
    .map_err(|error| error.message)?;

    let record = PageRecord {
        index,
        label: work
            .source_known
            .get(&index)
            .and_then(|row| row.label.clone()),
        got: dimensions(&final_bytes),
        bytes: Some(final_bytes.len() as u64),
        checksum: Some(checksum),
        at: now_secs(),
        note: note.clone(),
    };
    if let Err(error) = sidecar::append(&work.target_dir, &record) {
        // Dopo la promozione del file, una riga senza impronta è più sicura
        // di una riga con l'impronta ormai obsoleta.
        log::warn!("job optimize row not written page={index} error={error}");
        let unknown = PageRecord {
            checksum: None,
            ..record
        };
        if let Err(error) = sidecar::append(&work.target_dir, &unknown) {
            return Err(format!("riga non scritta: {error}"));
        }
    }

    match note {
        Some(_) => Ok(PageResult::Shrunk {
            before,
            after: final_bytes.len() as u64,
        }),
        None => Ok(PageResult::Untouched),
    }
}

fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

/// Dettaglio letto dal pannello: quante pagine, quante ridotte, quanto liberato.
fn detail(
    done: u32,
    total: u32,
    shrunk: u32,
    skipped: u32,
    freed: u64,
    page: u32,
    bytes: Option<u64>,
) -> String {
    let mut last = serde_json::json!({ "index": page });
    if let (Some(map), Some(bytes)) = (last.as_object_mut(), bytes) {
        map.insert("bytes".into(), bytes.into());
    }
    serde_json::json!({
        "units": { "done": done, "total": total, "label": "items" },
        "shrunk": shrunk,
        "skipped": skipped,
        "freed": freed,
        "last": last,
    })
    .to_string()
}

/// Quante pagine al secondo va, guardando le ultime `PACE_WINDOW` ridotte.
///
/// Le pagine copiate senza perdita non contano: sono quasi istantanee, e
/// mescolarle al ritmo darebbe una stima troppo ottimista. Con meno di
/// `PACE_SAMPLE` misure si usa il tempo medio dall'avvio, che è tutto quello
/// che si sa.
fn eta_seconds(recent: &VecDeque<Instant>, remaining: u32, started_at: Instant) -> i64 {
    let per_page = if recent.len() >= PACE_SAMPLE {
        let first = recent.front().copied().unwrap_or(started_at);
        let last = recent.back().copied().unwrap_or(started_at);
        (last - first) / (recent.len() - 1) as u32
    } else if let Some(last) = recent.back() {
        (*last - started_at) / recent.len().max(1) as u32
    } else {
        return -1;
    };
    (u64::from(remaining) * per_page.as_millis() as u64 / 1000) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("glossa-optimize-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("cartella");
        dir
    }

    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let mut pixels = image::RgbImage::new(width, height);
        for (x, y, pixel) in pixels.enumerate_pixels_mut() {
            *pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
        }
        images::resize_jpeg(
            &{
                let mut raw = Vec::new();
                image::DynamicImage::ImageRgb8(pixels)
                    .write_to(
                        &mut std::io::Cursor::new(&mut raw),
                        image::ImageFormat::Jpeg,
                    )
                    .unwrap();
                raw
            },
            width.max(height),
            100,
        )
        .unwrap()
    }

    fn workspace(target_dir: &Path, staging: &Path, long_edge: u32, quality: u8) -> Workspace {
        Workspace {
            target_dir: target_dir.to_path_buf(),
            staging: staging.to_path_buf(),
            long_edge,
            quality,
            source_known: Arc::new(BTreeMap::new()),
        }
    }

    #[test]
    fn a_page_larger_than_the_chosen_size_lands_shrunk_in_the_derived_folder() {
        let root = temp_dir("shrink");
        let source_dir = root.join("providers/gallica/v1/pages/max");
        let target_dir = root.join("derived/gallica/v1/800");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let source_page = source_dir.join("0001.jpg");
        std::fs::write(&source_page, jpeg(2000, 3000)).unwrap();
        let before = std::fs::metadata(&source_page).unwrap().len();

        let work = workspace(&target_dir, &staging, 800, 82);
        let result = optimise_one(&work, 1, &source_page).unwrap();

        assert!(matches!(result, PageResult::Shrunk { .. }));
        // La fonte non si tocca: è la ragione stessa della copia a parte.
        assert_eq!(std::fs::metadata(&source_page).unwrap().len(), before);
        let derived_page = target_dir.join("0001.jpg");
        assert!(derived_page.is_file());
        assert!(std::fs::metadata(&derived_page).unwrap().len() < before);

        let records = sidecar::read(&target_dir);
        assert!(records[&1].checksum.is_some());
        assert_eq!(
            records[&1].note,
            Some(Note::Downscaled { from: (2000, 3000) })
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_page_already_small_enough_is_copied_verbatim() {
        let root = temp_dir("untouched");
        let source_dir = root.join("providers/gallica/v1/pages/max");
        let target_dir = root.join("derived/gallica/v1/800");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let source_page = source_dir.join("0001.jpg");
        std::fs::write(&source_page, jpeg(400, 600)).unwrap();
        let original = std::fs::read(&source_page).unwrap();

        let work = workspace(&target_dir, &staging, 800, 82);
        let result = optimise_one(&work, 1, &source_page).unwrap();

        assert!(matches!(result, PageResult::Untouched));
        assert_eq!(
            std::fs::read(target_dir.join("0001.jpg")).unwrap(),
            original,
            "byte identici alla fonte, nessuna perdita per niente"
        );
        assert_eq!(sidecar::read(&target_dir)[&1].note, None);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_label_travels_from_the_source_sidecar() {
        let root = temp_dir("label");
        let source_dir = root.join("providers/gallica/v1/pages/max");
        let target_dir = root.join("derived/gallica/v1/800");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::create_dir_all(&target_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let source_page = source_dir.join("0001.jpg");
        std::fs::write(&source_page, jpeg(2000, 3000)).unwrap();
        sidecar::append(
            &source_dir,
            &PageRecord {
                index: 1,
                label: Some("iii".to_string()),
                got: Some((2000, 3000)),
                bytes: Some(1),
                checksum: None,
                at: 1_700_000_000,
                note: None,
            },
        )
        .unwrap();

        let mut work = workspace(&target_dir, &staging, 800, 82);
        work.source_known = Arc::new(sidecar::read(&source_dir));
        optimise_one(&work, 1, &source_page).unwrap();

        assert_eq!(sidecar::read(&target_dir)[&1].label.as_deref(), Some("iii"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_side_file_is_not_mistaken_for_a_page() {
        let dir = temp_dir("listing");
        std::fs::write(dir.join("0001.jpg"), b"pagina").unwrap();
        std::fs::write(dir.join("0002.jpg"), b"pagina").unwrap();
        std::fs::write(dir.join(sidecar::SIDECAR_FILE), b"{}\n").unwrap();

        let pages = pages_in(&dir);

        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].0, 1);
    }
}
