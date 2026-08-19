//! Ottimizzazione locale delle immagini: rilegge le pagine di una cartella di
//! misura, le rimpicciolisce al lato lungo scelto e le ricomprime, sostituendo
//! l'originale (§5.7 di `docs-dev/SCARICAMENTO_E_DEPOSITO.md`).
//!
//! **È un lavoro della coda** (decisione 3 del disegno) e non un'azione immediata:
//! su 900 pagine dura minuti, e va potuto seguire, mettere in pausa e annullare
//! come ogni altro lavoro lungo. Classe **processore**: non chiede niente a
//! nessuno.
//!
//! Regole che il disegno impone e che questo modulo attua:
//!
//! - si scrive in transito e si sostituisce con uno spostamento atomico
//!   (`vault_io`): un'ottimizzazione interrotta non deve lasciare una pagina a
//!   metà dove prima ce n'era una intera;
//! - **l'impronta va riscritta** nel file di lato, altrimenti la verifica
//!   completa dichiara corrotto tutto il libro;
//! - **la misura d'origine resta scritta** nello stesso file di lato
//!   (`Note::Downscaled`), così di quella pagina si sa che è arrivata più grande;
//! - le miniature si rifanno, perché derivano dalle pagine;
//! - **non tocca chi è già più piccolo** del lato lungo scelto: ogni
//!   ricompressione perde qualcosa, e ricomprimere per niente è perdita secca;
//! - lavora su **una cartella di misura per volta**, mai «il libro»: le pagine
//!   prese a risoluzione piena di proposito (§5.6) non devono essere schiacciate
//!   da un'ottimizzazione che puntava ad altro.
//!
//! Non è automatica: è un'operazione che perde informazione, e la si chiede.

pub mod commands;

use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

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

/// Cosa è successo a una pagina.
enum PageResult {
    /// Ricompressa: byte prima e dopo.
    Shrunk { before: u64, after: u64 },
    /// Già dentro il lato lungo scelto, o illeggibile: lasciata com'è.
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
        // Area di transito **di questo lavoro**, non della digitalizzazione: lo
        // scaricamento usa quella col nome della versione, e ognuno butta la
        // propria quando esce. Condividerla significava che l'ottimizzazione
        // cancellava i file a metà di uno scaricamento in corso sullo stesso
        // libro — cosa che accade, perché uno occupa la rete e l'altro il
        // processore, e la coda li fa girare insieme.
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
        ctx.report_phase(phase::OPTIMIZING).await;
        log::info!(
            "job optimize starting id={} pages={total} long_edge={long_edge} quality={quality}",
            ctx.id
        );

        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge,
            quality,
        };
        let mut done = 0u32;
        let mut shrunk = 0u32;
        let mut freed: u64 = 0;

        for (index, path) in pages {
            if ctx.pause_requested() || ctx.cancel_requested() {
                return Ok(stopped_outcome(ctx.cancel_requested(), &staging));
            }

            match optimise_one(&work, index, &path) {
                Ok(PageResult::Shrunk { before, after }) => {
                    shrunk += 1;
                    freed += before.saturating_sub(after);
                }
                Ok(PageResult::Untouched) => {}
                // Una pagina che non si riesce a ricomprimere resta quella di
                // prima: si scrive nel registro e si va avanti.
                Err(error) => log::warn!("job optimize skipped page={index} error={error}"),
            }
            done += 1;

            ctx.report(
                f64::from(done) / f64::from(total.max(1)),
                None,
                None,
                Some(&detail(done, total, shrunk, freed)),
            )
            .await;
            // Un lavoro tutto processore non deve tenersi il filo.
            tokio::task::yield_now().await;
        }

        discard(&staging);
        log::info!(
            "job optimize complete id={} shrunk={shrunk}/{total} freed={freed}",
            ctx.id
        );
        Ok(Outcome::Done)
    }
}

/// Quante pagine verrebbero ridotte e quanto spazio ne verrebbe fuori.
///
/// Le dimensioni si leggono dall'intestazione dei file, senza decodificarli: una
/// lettura piccola per pagina, e l'utente sta aspettando una conferma. La
/// previsione dei byte è il rapporto delle **aree**: un JPEG non scende
/// esattamente come i pixel, ma è la stima più onesta che si può fare senza
/// ricomprimere davvero — che è il lavoro stesso.
pub(crate) fn forecast(size_dir: &Path, long_edge: u32) -> (u32, u64) {
    let mut shrinking = 0;
    let mut freeing = 0u64;
    for (_, path) in pages_in(size_dir) {
        let Ok(reader) = image::ImageReader::open(&path) else {
            continue;
        };
        let Ok((width, height)) = reader.into_dimensions() else {
            continue;
        };
        let Ok(now) = std::fs::metadata(&path).map(|meta| meta.len()) else {
            continue;
        };
        let longest = width.max(height);
        if longest <= long_edge {
            continue;
        }
        shrinking += 1;
        let area_now = u64::from(width) * u64::from(height);
        let scale = f64::from(long_edge) / f64::from(longest);
        let area_after = (area_now as f64 * scale * scale) as u64;
        freeing += now.saturating_sub(now * area_after / area_now.max(1));
    }
    (shrinking, freeing)
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
    } = *work;
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let before = bytes.len() as u64;
    let Some((width, height)) = dimensions(&bytes) else {
        return Ok(PageResult::Untouched);
    };
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

    // L'impronta nuova e la misura d'origine: senza la prima la verifica
    // completa dichiara corrotta la pagina, senza la seconda non si sa più che
    // era arrivata più grande.
    sidecar::append(
        size_dir,
        &PageRecord {
            index,
            label: None,
            got: dimensions(&reduced),
            bytes: Some(after),
            checksum: Some(checksum),
            at: now_secs(),
            note: Some(Note::Downscaled {
                from: (width, height),
            }),
        },
    )
    .map_err(|error| error.to_string())?;

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
fn detail(done: u32, total: u32, shrunk: u32, freed: u64) -> String {
    serde_json::json!({
        "units": { "done": done, "total": total, "label": "items" },
        "shrunk": shrunk,
        "freed": freed,
    })
    .to_string()
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
    fn the_forecast_counts_only_the_pages_that_would_shrink() {
        // La conferma deve dire quante pagine tocca e quanto libera (§5.7):
        // contare tutta la cartella prometteva un lavoro su pagine che il lavoro
        // stesso avrebbe saltato.
        let dir = temp_dir("forecast");
        std::fs::write(dir.join("0001.jpg"), jpeg(1600, 2000)).unwrap();
        std::fs::write(dir.join("0002.jpg"), jpeg(400, 500)).unwrap();
        std::fs::write(dir.join("pages.jsonl"), b"{}\n").unwrap();

        let (shrinking, freeing) = forecast(&dir, 800);

        assert_eq!(shrinking, 1, "solo la pagina oltre gli 800 px");
        let big = std::fs::metadata(dir.join("0001.jpg")).unwrap().len();
        assert!(
            freeing > 0 && freeing < big,
            "una previsione, non tutto il file"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_forecast_says_nothing_to_do_when_every_page_is_small_enough() {
        let dir = temp_dir("forecast-nulla");
        std::fs::write(dir.join("0001.jpg"), jpeg(400, 500)).unwrap();

        assert_eq!(forecast(&dir, 800), (0, 0));

        let _ = std::fs::remove_dir_all(&dir);
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
        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 800,
            quality: 82,
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
        let work = Workspace {
            root: &root,
            config: &config,
            size_dir: &size_dir,
            staging: &staging,
            long_edge: 800,
            quality: 82,
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
