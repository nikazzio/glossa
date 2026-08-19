//! Gestore del lavoro `source_download`: il ciclo, e nient'altro.
//!
//! Sette passi (piano §5.2), nessun ramo oltre a quelli del §5.1:
//!
//! 1. manifesto — dal deposito se c'è, altrimenti dalla rete, conservato com'è
//!    arrivato (D2-bis);
//! 2. per ogni pagina nell'ordine dichiarato: salta se il file c'è già, calcola
//!    la larghezza, aspetta il turno verso l'host, chiedi, valida, promuovi,
//!    ricava la miniatura, riferisci (`pages::PageFetcher`);
//! 3. cartella di misura vuota a fine lavoro ⇒ `Err`.
//!
//! Due invarianti che il resto del modulo presuppone:
//!
//! - **il disco è la verità** (§5.4): nessuna riga per pagina nel database. Il
//!   conteggio lo dà la cartella, l'impronta il file di lato (`sidecar`);
//! - **nel deposito entra solo ciò che ha superato la validazione** (D16-bis,
//!   `vault_io`). Da qui la ripresa può fidarsi della sola presenza del file.
//!
//! Non esiste più un punto di ripresa salvato (§5.3): riprendere significa
//! rileggere la cartella.

use async_trait::async_trait;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::iiif::network::NetworkProfile;
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

use super::catalog::{profile_for, record_manifest, source_title};
use super::courtesy::{Courtesy, Signals};
use super::fetch::{build_client, fetch, host_of};
use super::manifest::{parse, Manifest};
use super::pages::{one_declaring_long_waits, PageFetcher, PageOutcome};
use super::progress::{Progress, Reporter};
use super::sidecar::{self, PageRecord};
use super::sizing::{self, SizeCap, Sizing, SizingRule};
use super::vault_io::{discard, folder_state, now_secs, stage_and_promote, stopped_outcome};

pub const JOB_TYPE: &str = "source_download";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadConfig {
    /// Chiave del registro dei provider: determina il profilo di rete (D18).
    pub provider_key: String,
    /// Identificativo della digitalizzazione; nomina la cartella nel deposito.
    pub version_id: String,
    pub manifest_url: String,
    /// Tetto della misura: `max`, oppure il lato lungo in pixel. Nomina la
    /// cartella; la larghezza chiesta al servizio varia di pagina in pagina e
    /// **non** entra nel nome (D4, §5.1).
    #[serde(default = "default_size_tag")]
    pub size_tag: String,
    /// Lato lungo delle miniature, scelto alla messa in coda.
    #[serde(default = "default_thumbnail_edge")]
    pub thumbnail_edge: u32,
}

fn default_thumbnail_edge() -> u32 {
    images::DEFAULT_THUMBNAIL_EDGE
}

fn default_size_tag() -> String {
    crate::iiif::settings::DEFAULT_SIZE_CAP.to_string()
}

/// Fasi riportate al pannello. `negotiating` non esiste più: la misura si
/// calcola, non si negozia (§5.1).
mod phase {
    pub const STARTING: &str = "starting";
    pub const MANIFEST: &str = "manifest";
    pub const DOWNLOADING: &str = "downloading";
}

/// Radice raggiungibile e area di transito pronta.
///
/// Radice assente ≠ file mancante (D1): un disco staccato non si "ripara"
/// creando una cartella locale che ne prende il posto e si riempie di gigabyte
/// fuori posto.
///
/// `version_id` arriva dalla configurazione: la componente si valida, altrimenti
/// un valore con `..` creerebbe cartelle fuori dal deposito. Una cartella di
/// transito per digitalizzazione, perché sulla stessa fonte gira un lavoro solo.
fn open_staging(root: &Path, version_id: &str) -> Result<PathBuf, JobError> {
    if !root.is_dir() {
        return Err(JobError::new(
            ErrorKind::Storage,
            "vault_unreachable".to_string(),
        ));
    }
    let staging = root.join(layout::STAGING_DIR).join(
        layout::safe_component(version_id)
            .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
    );
    std::fs::create_dir_all(&staging)
        .map_err(|error| JobError::new(ErrorKind::Storage, format!("area di transito: {error}")))?;
    Ok(staging)
}

/// L'esito del lavoro, letto sulla **cartella** e non su questo avvio: una
/// ripresa in cui le ultime venti pagine mancano non ha scaricato niente, ma il
/// libro c'è (§5.2).
fn finished(
    id: &str,
    progress: &Progress,
    profile: &NetworkProfile,
    attempt: u32,
) -> Result<Outcome, JobError> {
    log::info!(
        "job download complete id={id} present={} skipped={} bytes={}",
        progress.present,
        progress.unavailable,
        progress.bytes
    );
    if progress.present == 0 {
        return Err(JobError {
            retry_after: Some(Duration::from_secs(profile.wait_after(None, attempt, None))),
            ..JobError::new(
                ErrorKind::NotFound,
                "la biblioteca non ha servito nessuna pagina".to_string(),
            )
        });
    }
    Ok(Outcome::Done)
}

/// Porta l'esito di una pagina dentro il conto del lavoro e la memoria di ciò
/// che la biblioteca non serve.
fn account_for(
    outcome: PageOutcome,
    page: &super::manifest::Page,
    progress: &mut Progress,
    known: &mut std::collections::BTreeMap<u32, PageRecord>,
) {
    match outcome {
        PageOutcome::Written { bytes } => {
            progress.present += 1;
            progress.fetched_now += 1;
            progress.bytes += bytes;
            // La riga appena scritta vale per il resto del lavoro: una pagina
            // prima dichiarata mancante non lo è più.
            known.remove(&page.index);
        }
        PageOutcome::Present => progress.present += 1,
        PageOutcome::NotServed => {
            progress.unavailable += 1;
            known.insert(
                page.index,
                PageRecord::not_served(page.index, page.label.clone(), now_secs()),
            );
        }
        // Il ciclo esce prima: qui non arriva.
        PageOutcome::Stopped => {}
    }
}

/// Dove cercare il manifesto e con che ritmo chiederlo.
struct ManifestSource<'a> {
    client: &'a reqwest::Client,
    profile: &'a NetworkProfile,
    config: &'a DownloadConfig,
    root: &'a Path,
    staging: &'a Path,
}

/// Quello che la preparazione mette insieme prima che il ciclo cominci.
struct Prepared {
    config: DownloadConfig,
    profile: NetworkProfile,
    client: reqwest::Client,
    root: PathBuf,
    staging: PathBuf,
    manifest: Manifest,
    title: String,
    cap: SizeCap,
    size_dir: PathBuf,
    /// Come calcolare la misura per questo libro (§5.9). Decisa qui perché qui
    /// ci sono già client, profilo e manifesto; il ciclo la può solo declassare
    /// a `Full` dopo un rifiuto.
    sizing: Sizing,
}

pub struct SourceDownloadJob {
    /// Contatori di cortesia per host (D18): pause, raffica, raffreddamenti.
    courtesy: std::sync::Arc<Courtesy>,
}

impl SourceDownloadJob {
    pub fn new(courtesy: std::sync::Arc<Courtesy>) -> Self {
        Self { courtesy }
    }
}

#[async_trait]
impl JobHandler for SourceDownloadJob {
    fn resource_class(&self) -> ResourceClass {
        ResourceClass::Network
    }

    fn recovery(&self) -> Recovery {
        // Riprendere = rileggere la cartella e saltare i file presenti (§5.3).
        Recovery::Resumable
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        let stop = || ctx.pause_requested() || ctx.cancel_requested();
        // Alzato dalla cortesia mentre è lei a imporre l'attesa: distingue
        // «fermo per i limiti della biblioteca» da «server lento» (D17).
        let courtesy_wait = std::sync::atomic::AtomicBool::new(false);
        let signals = Signals {
            stop: &stop,
            courtesy_wait: &courtesy_wait,
        };

        let Some(prepared) = self.prepare(&ctx, &signals).await? else {
            return Ok(if ctx.cancel_requested() {
                Outcome::Cancelled
            } else {
                Outcome::Paused
            });
        };
        self.download(&ctx, &prepared, &signals).await
    }
}

impl SourceDownloadJob {
    /// Configurazione, deposito, manifesto: tutto ciò che serve prima di
    /// cominciare. `Ok(None)` = fermato mentre aspettava il turno.
    async fn prepare(
        &self,
        ctx: &JobContext,
        signals: &Signals<'_>,
    ) -> Result<Option<Prepared>, JobError> {
        ctx.report_phase(phase::STARTING).await;

        let config: DownloadConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;
        let profile = profile_for(ctx, &config).await;
        let client = build_client(&profile)?;

        let root = ctx
            .vault_root()
            .await
            .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        let staging = open_staging(&root, &config.version_id)?;

        ctx.report_phase(phase::MANIFEST).await;
        let Some(bytes) = self
            .read_or_fetch_manifest(
                ctx,
                &ManifestSource {
                    client: &client,
                    profile: &profile,
                    config: &config,
                    root: &root,
                    staging: &staging,
                },
                signals,
            )
            .await?
        else {
            return Ok(None);
        };
        let manifest = parse(&bytes)?;
        let total = manifest.pages.len() as u32;
        let title = source_title(ctx, &config.version_id)
            .await
            .unwrap_or_else(|| config.version_id.clone());
        record_manifest(ctx, &config, total, &manifest).await?;

        let cap = SizeCap::parse(&config.size_tag);
        let size_dir = root.join(
            layout::pages_dir(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?
                .join(cap.folder()),
        );

        let sizing = self
            .decide_sizing(&client, &profile, &manifest, cap, signals)
            .await;
        log::info!(
            "job download starting id={} provider={} pages={total} cap={} rule={:?} correction={:?}",
            ctx.id,
            config.provider_key,
            config.size_tag,
            sizing.rule,
            sizing.correction
        );

        Ok(Some(Prepared {
            config,
            profile,
            client,
            root,
            staging,
            manifest,
            title,
            cap,
            size_dir,
            sizing,
        }))
    }

    /// Il ciclo sulle pagine.
    async fn download(
        &self,
        ctx: &JobContext,
        prepared: &Prepared,
        signals: &Signals<'_>,
    ) -> Result<Outcome, JobError> {
        let Prepared {
            config,
            profile,
            client,
            root,
            staging,
            manifest,
            title,
            cap,
            size_dir,
            sizing,
        } = prepared;

        // Stato di partenza letto dal disco, non da un punto salvato (§5.3).
        let mut known = sidecar::read(size_dir);
        let (present, bytes) = folder_state(size_dir);
        let mut sizing = sizing.clone();

        ctx.report_phase(phase::DOWNLOADING).await;
        let started_at = std::time::Instant::now();
        let host = host_of(&config.manifest_url).unwrap_or_default();
        let fetcher = PageFetcher {
            courtesy: &self.courtesy,
            client,
            profile,
            config,
            manifest,
            cap: *cap,
            size_dir,
            staging,
            root,
            attempt: ctx.attempt,
        };
        let reporter = Reporter {
            ctx,
            title,
            started_at,
            profile,
        };
        let mut progress = Progress {
            present,
            total: manifest.pages.len() as u32,
            bytes,
            unavailable: 0,
            fetched_now: 0,
        };

        for page in &manifest.pages {
            if ctx.pause_requested() || ctx.cancel_requested() {
                return Ok(stopped_outcome(ctx.cancel_requested(), staging));
            }

            let outcome = one_declaring_long_waits(
                &fetcher,
                &mut sizing,
                page,
                &known,
                &progress,
                &reporter,
                signals,
            )
            .await
            .inspect_err(|_| discard(staging))?;

            if matches!(outcome, PageOutcome::Stopped) {
                return Ok(stopped_outcome(ctx.cancel_requested(), staging));
            }
            account_for(outcome, page, &mut progress, &mut known);

            reporter
                .advanced(
                    &progress,
                    &progress.detail(&config.size_tag, &config.provider_key, &host, page),
                )
                .await;
        }

        discard(staging);
        finished(&ctx.id, &progress, profile, ctx.attempt)
    }

    /// Manifesto dal deposito, o dalla rete conservandolo com'è arrivato
    /// (D2-bis). `Ok(None)` = fermato mentre aspettava il turno.
    async fn read_or_fetch_manifest(
        &self,
        ctx: &JobContext,
        source: &ManifestSource<'_>,
        signals: &Signals<'_>,
    ) -> Result<Option<Vec<u8>>, JobError> {
        let ManifestSource {
            client,
            profile,
            config,
            root,
            staging,
        } = source;
        let manifest_path = root.join(
            layout::manifest_path(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        if manifest_path.is_file() {
            return std::fs::read(&manifest_path)
                .map(Some)
                .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()));
        }
        let Some(fetched) = fetch(
            client,
            &self.courtesy,
            profile,
            &config.manifest_url,
            ctx.attempt,
            signals,
        )
        .await
        .inspect_err(|_| discard(staging))?
        else {
            return Ok(None);
        };
        stage_and_promote(
            &staging.join("manifest.json"),
            &manifest_path,
            &fetched.bytes,
            integrity::FileKind::Manifest,
        )?;
        Ok(Some(fetched.bytes))
    }

    /// Legge il descrittore della prima pagina e ne ricava la regola di calcolo
    /// per tutto il libro (§5.9). Costo: una richiesta, 4,3 s misurati.
    ///
    /// Serve a due cose, non a una: sapere se la biblioteca tiene pronti i
    /// dimezzamenti, e sapere se le dimensioni che il manifesto dichiara sono
    /// quelle vere. La seconda si paga a ogni pagina se non la si scopre qui.
    async fn decide_sizing(
        &self,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        manifest: &Manifest,
        cap: SizeCap,
        signals: &Signals<'_>,
    ) -> Sizing {
        if matches!(cap, SizeCap::Max) {
            return Sizing::new(SizingRule::Full);
        }
        let Some(page) = manifest.pages.first() else {
            return Sizing::new(SizingRule::ExactWidth);
        };
        let url = sizing::info_url(&page.image_service);
        let info = match fetch(client, &self.courtesy, profile, &url, 1, signals).await {
            Ok(Some(fetched)) => serde_json::from_slice::<serde_json::Value>(&fetched.bytes).ok(),
            // Silenzio passeggero o descrittore illeggibile: regola generale
            // (fatto 6). Non si riprova: il guadagno è di velocità, non di esito.
            _ => None,
        };
        sizing::from_info(info.as_ref(), Some(page), cap)
    }
}
