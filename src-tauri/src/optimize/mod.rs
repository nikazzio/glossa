//! Ottimizzazione locale delle pagine già scaricate.
//!
//! Ogni lavoro opera su una sola cartella di misura. Sostituisce i file in modo
//! atomico, aggiorna impronte e miniature e conserva le dimensioni ricevute
//! dalla biblioteca. L'operazione parte solo su richiesta dell'utente.

pub mod commands;
#[cfg(test)]
mod job_it;

use async_trait::async_trait;
use serde::Deserialize;
use std::collections::VecDeque;
use std::path::Path;
use std::time::Instant;

use crate::download::sidecar::{self, Note, PageRecord};
use crate::download::vault_io::{discard, now_secs, stage_and_promote, stopped_outcome};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};
use std::collections::BTreeMap;

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
    /// La cartella di misura su cui lavorare: `2000` **oppure** `max`, mai
    /// entrambe.
    pub size_tag: String,
    pub long_edge: u32,
    pub quality: u8,
    /// Lato lungo delle miniature, come lo dicono le impostazioni: le miniature
    /// si rifanno, e devono venire della misura scelta dall'utente.
    #[serde(default = "default_thumbnail_edge")]
    pub thumbnail_edge: u32,
}

fn default_thumbnail_edge() -> u32 {
    images::DEFAULT_THUMBNAIL_EDGE
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
    /// Già dentro il lato lungo scelto, oppure senza alcun risparmio: lasciata
    /// com'è senza perdere qualità.
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
        // Riprendere è sicuro: una pagina già ridotta è sotto il lato lungo e
        // viene saltata al giro dopo.
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
        let size_dir = root.join(
            layout::pages_dir(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?
                .join(
                    layout::safe_component(&config.size_tag)
                        .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
                ),
        );
        // Scaricamento e ottimizzazione non devono condividere file temporanei.
        let area = format!("{}-optimize-{}", config.version_id, config.size_tag);
        let staging = root.join(layout::STAGING_DIR).join(
            layout::safe_component(&area)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;

        let pages = pages_in(&size_dir);
        let total = pages.len() as u32;
        let started_at = Instant::now();
        // Le pagine già ridotte in una esecuzione precedente non entrano nel
        // ritmo: sono istantanee, e ne farebbero una stima ottimista.
        let mut recent: VecDeque<Instant> = VecDeque::new();
        ctx.report_phase(phase::OPTIMIZING).await;
        log::info!(
            "job optimize starting id={} pages={total} long_edge={long_edge} quality={quality}",
            ctx.id
        );

        let known = sidecar::read(&size_dir);
        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge,
            quality,
            known: &known,
        };
        let mut done = 0u32;
        let mut shrunk = 0u32;
        let mut skipped = 0u32;
        let mut freed: u64 = 0;

        for (index, path) in pages {
            if ctx.pause_requested() || ctx.cancel_requested() {
                return Ok(stopped_outcome(ctx.cancel_requested(), &staging));
            }

            let outcome = optimise_one(&work, index, &path);
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
                // Una pagina che non si riesce a ricomprimere resta quella di
                // prima: si scrive nel registro e si va avanti.
                Err(error) => {
                    skipped += 1;
                    log::warn!("job optimize skipped page={index} error={error}");
                    None
                }
            };
            done += 1;

            ctx.report(
                f64::from(done) / f64::from(total.max(1)),
                // Il nome dell'opera sta nella riga del lavoro dalla messa in
                // coda, e la scrittura dell'avanzamento lo conserva: qui non si
                // manda, e non si cancella.
                None,
                Some(eta_seconds(&recent, total - done, started_at)),
                Some(&detail(done, total, shrunk, skipped, freed, index, last)),
            )
            .await;
            // Un lavoro tutto processore non deve tenersi il filo.
            tokio::task::yield_now().await;
        }

        discard(&staging);
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
fn pages_in(size_dir: &Path) -> Vec<(u32, std::path::PathBuf)> {
    let Ok(entries) = std::fs::read_dir(size_dir) else {
        return Vec::new();
    };
    let mut pages: Vec<(u32, std::path::PathBuf)> = entries
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

/// Dove lavorare e con che valori: le cinque cose che non cambiano da una
/// pagina all'altra.
struct Workspace<'a> {
    root: &'a Path,
    config: &'a OptimizeConfig,
    size_dir: &'a Path,
    staging: &'a Path,
    long_edge: u32,
    quality: u8,
    /// Le righe di `pages.jsonl` come stavano all'avvio del lavoro, lette una
    /// volta sola: servono a non perdere l'etichetta che la biblioteca dà alla
    /// pagina quando la riga si riscrive.
    known: &'a BTreeMap<u32, PageRecord>,
}

/// Una pagina: rilegge, decide, ricomprime, sostituisce, riscrive la riga.
fn optimise_one(work: &Workspace<'_>, index: u32, path: &Path) -> Result<PageResult, String> {
    let Workspace {
        root,
        config,
        size_dir,
        staging,
        long_edge,
        quality,
        known,
    } = *work;
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let before = bytes.len() as u64;
    let (width, height) =
        dimensions(&bytes).ok_or_else(|| "formato immagine non riconoscibile".to_string())?;
    // Già dentro il lato lungo scelto: ricomprimerla perderebbe qualcosa senza
    // liberare niente.
    if width.max(height) <= long_edge {
        return Ok(PageResult::Untouched);
    }

    let reduced = images::resize_jpeg(&bytes, long_edge, quality).map_err(|e| e.to_string())?;
    let after = reduced.len() as u64;
    // Una ricompressione che non libera spazio non vale la perdita.
    if after >= before {
        return Ok(PageResult::Untouched);
    }

    let checksum = stage_and_promote(
        &staging.join(format!("{index:04}-opt.jpg")),
        path,
        &reduced,
        integrity::FileKind::Image,
    )
    .map_err(|error| error.message)?;

    // La riga più recente sostituisce i metadati precedenti della pagina.
    let original_dimensions = known
        .get(&index)
        .and_then(|row| match row.note {
            Some(Note::Downscaled { from }) => Some(from),
            _ => None,
        })
        .unwrap_or((width, height));
    let record = PageRecord {
        index,
        label: known.get(&index).and_then(|row| row.label.clone()),
        got: dimensions(&reduced),
        bytes: Some(after),
        checksum: Some(checksum),
        at: now_secs(),
        note: Some(Note::Downscaled {
            from: original_dimensions,
        }),
    };
    if let Err(error) = sidecar::append(size_dir, &record) {
        // Dopo la sostituzione del file, una riga senza impronta è più sicura
        // di una riga con l'impronta ormai obsoleta.
        log::warn!("job optimize row not written page={index} error={error}");
        let unknown = PageRecord {
            checksum: None,
            ..record
        };
        if let Err(error) = sidecar::append(size_dir, &unknown) {
            return Err(format!("riga non scritta: {error}"));
        }
    }

    refresh_thumbnail(root, config, staging, index, &reduced);
    Ok(PageResult::Shrunk { before, after })
}

/// Le miniature derivano dalle pagine: se la pagina cambia, la miniatura è
/// vecchia.
fn refresh_thumbnail(
    root: &Path,
    config: &OptimizeConfig,
    staging: &Path,
    index: u32,
    bytes: &[u8],
) {
    let Ok(relative) = layout::thumbnail_path(&config.provider_key, &config.version_id, index)
    else {
        return;
    };
    match images::thumbnail(bytes, config.thumbnail_edge) {
        Ok(thumbnail) => {
            if let Err(error) = stage_and_promote(
                &staging.join(format!("{index:04}-thumb.jpg")),
                &root.join(relative),
                &thumbnail,
                integrity::FileKind::Image,
            ) {
                log::warn!(
                    "job optimize thumbnail page={index} error={}",
                    error.message
                );
            }
        }
        Err(error) => log::warn!("job optimize thumbnail page={index} error={error}"),
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
/// Le pagine lasciate stare non contano: sono istantanee, e mescolarle al ritmo
/// darebbe una stima che cala mentre il lavoro non avanza. Con meno di
/// `PACE_SAMPLE` misure si usa il tempo medio dall'avvio, che è tutto quello che
/// si sa.
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

    fn config() -> OptimizeConfig {
        serde_json::from_value(serde_json::json!({
            "providerKey": "gallica",
            "versionId": "v1",
            "sizeTag": "max",
            "longEdge": 800,
            "quality": 82,
        }))
        .unwrap()
    }

    #[test]
    fn a_page_larger_than_the_chosen_size_is_shrunk_and_its_line_rewritten() {
        let root = temp_dir("shrink");
        let size_dir = root.join("providers/gallica/v1/pages/max");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&size_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let page = size_dir.join("0001.jpg");
        std::fs::write(&page, jpeg(2000, 3000)).unwrap();
        let before = std::fs::metadata(&page).unwrap().len();

        let config = config();
        let known = sidecar::read(&size_dir);
        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 800,
            quality: 82,
            known: &known,
        };
        let result = optimise_one(&work, 1, &page).unwrap();

        assert!(matches!(result, PageResult::Shrunk { .. }));
        assert!(std::fs::metadata(&page).unwrap().len() < before);
        // L'impronta nuova e la misura d'origine stanno nel file di lato.
        let records = sidecar::read(&size_dir);
        assert!(records[&1].checksum.is_some());
        assert_eq!(
            records[&1].note,
            Some(Note::Downscaled { from: (2000, 3000) })
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_second_optimization_keeps_the_dimensions_received_from_the_library() {
        let root = temp_dir("origine");
        let size_dir = root.join("providers/gallica/v1/pages/max");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&size_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let page = size_dir.join("0001.jpg");
        std::fs::write(&page, jpeg(2000, 3000)).unwrap();

        let config = config();
        let known = sidecar::read(&size_dir);
        let first = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 1200,
            quality: 82,
            known: &known,
        };
        optimise_one(&first, 1, &page).unwrap();

        let known = sidecar::read(&size_dir);
        let second = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 800,
            quality: 82,
            known: &known,
        };
        optimise_one(&second, 1, &page).unwrap();

        let records = sidecar::read(&size_dir);
        assert_eq!(
            records[&1].note,
            Some(Note::Downscaled { from: (2000, 3000) })
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_page_already_small_enough_is_not_recompressed() {
        // Ogni ricompressione perde qualcosa: farla per niente è perdita secca.
        let root = temp_dir("untouched");
        let size_dir = root.join("providers/gallica/v1/pages/max");
        let staging = root.join("staging/v1");
        std::fs::create_dir_all(&size_dir).unwrap();
        std::fs::create_dir_all(&staging).unwrap();
        let page = size_dir.join("0001.jpg");
        std::fs::write(&page, jpeg(400, 600)).unwrap();
        let before = std::fs::read(&page).unwrap();

        let config = config();
        let known = sidecar::read(&size_dir);
        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 800,
            quality: 82,
            known: &known,
        };
        let result = optimise_one(&work, 1, &page).unwrap();

        assert!(matches!(result, PageResult::Untouched));
        assert_eq!(
            std::fs::read(&page).unwrap(),
            before,
            "i byte non si toccano"
        );
        assert!(sidecar::read(&size_dir).is_empty(), "nessuna riga in più");

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
