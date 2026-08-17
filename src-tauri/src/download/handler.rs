//! Il gestore dello scaricamento: il primo lavoro vero della coda.
//!
//! Dal manifesto alle carte sul disco. Salta ciò che è già valido, salva dove è
//! arrivato, si ferma al confine della carta quando glielo si chiede, e non fa
//! entrare nel deposito niente che non abbia superato la validazione: un file
//! parziale non esiste mai lì dentro (D16-bis).
//!
//! Di ogni carta scaricata **ricava la miniatura** (D6, corretta il
//! 2026-08-16): è lavoro del processore su byte che abbiamo già in mano, e
//! costa qualche decina di millisecondi invece di una seconda richiesta a una
//! biblioteca che risponde fra 1 e 19 secondi.

use async_trait::async_trait;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

use crate::iiif::network::{NetworkProfile, CAUTIOUS};
use crate::images;
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

use super::courtesy::{Courtesy, Signals};
use super::fetch::{build_client, fetch, host_of};
use super::manifest::{image_url, parse, Page};
use super::size;

pub const JOB_TYPE: &str = "source_download";

/// Tetto di riserva quando il tetto configurato non è un numero — cioè quando
/// è la politica «massima», che non passa mai di qui.
const DEFAULT_CAP_PIXELS: u32 = 2000;

/// `assets.kind` delle carte: è quello che conta nella disponibilità (D7) ed è
/// quello che «libera spazio» cancella (D6).
const PAGE_KIND: &str = "image";
/// `assets.kind` delle miniature: fuori dal conteggio delle carte e fuori da
/// «libera spazio».
const THUMBNAIL_KIND: &str = "thumbnail";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadConfig {
    /// Chiave del registro dei provider: porta con sé il profilo di rete (D18).
    pub provider_key: String,
    /// Identificativo interno della digitalizzazione, che nomina la cartella.
    pub version_id: String,
    pub manifest_url: String,
    /// La **politica** di risoluzione: `max`, oppure il lato lungo in pixel.
    /// Nomina la cartella nel deposito; la misura davvero chiesta al servizio è
    /// quella dichiarata più vicina a questo tetto, e le due divergono di
    /// proposito (D4). Se la cartella prendesse il nome dai pixel ottenuti, la
    /// stessa fonte finirebbe sparsa in cartelle diverse.
    #[serde(default = "default_size_tag")]
    pub size_tag: String,
    /// Lato lungo delle miniature ricavate dalle carte. Lo decide
    /// l'impostazione alla messa in coda: qui arriva già scelto.
    #[serde(default = "default_thumbnail_edge")]
    pub thumbnail_edge: u32,
}

fn default_thumbnail_edge() -> u32 {
    images::DEFAULT_THUMBNAIL_EDGE
}

fn default_size_tag() -> String {
    crate::iiif::settings::DEFAULT_SIZE_CAP.to_string()
}

#[derive(Debug, Default, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    /// **Quante** carte del manifesto sono state fatte, non il numero dell'ultima:
    /// la ripresa salta esattamente quelle, e i due valori divergono appena un
    /// canvas del manifesto non è scaricabile (D13).
    done: u32,
}

/// Le fasi dello scaricamento, come le legge il pannello. Ogni tipo di lavoro
/// ha le sue: il riconoscimento testo dirà altre cose.
mod phase {
    /// Configurazione, deposito, area di transito.
    pub const STARTING: &str = "starting";
    /// Il manifesto: quante carte sono e dove stanno.
    pub const MANIFEST: &str = "manifest";
    /// Si chiede al servizio quali misure sa produrre (D4).
    pub const NEGOTIATING: &str = "negotiating";
    /// Le carte, una per volta.
    pub const DOWNLOADING: &str = "downloading";
}

/// Oltre questa attesa il lavoro dichiara che è fermo per i limiti della
/// biblioteca (D17). Più lunga della pausa massima fra due richieste (6 s su
/// Gallica) e molto più corta del raffreddamento più breve (120 s): così la
/// pausa normale non fa lampeggiare la riga, e un raffreddamento sì.
const DECLARE_WAIT_AFTER: Duration = Duration::from_secs(15);

pub struct SourceDownloadJob {
    /// I contatori di cortesia verso le biblioteche (D18): pause, raffica,
    /// raffreddamenti. Stanno fuori dal gestore perché sono **per host**, non
    /// per lavoro.
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
        // Sa dire a che punto era: le carte già complete e verificate si
        // saltano, quindi riprendere costa poco (D13).
        Recovery::Resumable
    }

    async fn run(&self, ctx: JobContext) -> Result<Outcome, JobError> {
        // Guardato durante le attese lunghe: senza, un raffreddamento di dieci
        // minuti renderebbe il lavoro sordo a pausa e annullamento.
        let stop = || ctx.pause_requested() || ctx.cancel_requested();
        // Alzato dalla cortesia mentre è **lei** a farci aspettare: serve a non
        // chiamare «limite della biblioteca» un server semplicemente lento.
        let courtesy_wait = std::sync::atomic::AtomicBool::new(false);
        let signals = Signals {
            stop: &stop,
            courtesy_wait: &courtesy_wait,
        };

        ctx.report_phase(phase::STARTING).await;

        let config: DownloadConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;
        let profile = profile_for(&ctx, &config).await;
        let client = build_client(&profile)?;

        let root = ctx
            .vault_root()
            .await
            .map_err(|error| JobError::new(ErrorKind::Storage, error))?;
        // Radice assente è un caso diverso da file mancante (D1): un disco
        // staccato non va "riparato" creando una cartella locale che ne prende
        // il posto e si riempie di gigabyte fuori posto.
        if !root.is_dir() {
            return Err(JobError::new(
                ErrorKind::Storage,
                "vault_unreachable".to_string(),
            ));
        }
        // La configurazione arriva dal frontend: la cartella di transito si
        // costruisce dalla componente **già validata** dal layout, altrimenti un
        // identificativo con `..` farebbe creare cartelle fuori dal deposito.
        // Una sola cartella per digitalizzazione: sulla stessa fonte gira un
        // lavoro solo, e carta e miniatura hanno nomi diversi lì dentro.
        let staging = root.join(layout::STAGING_DIR).join(
            layout::safe_component(&config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;

        // 1. Il manifesto, conservato com'è (D2-bis).
        ctx.report_phase(phase::MANIFEST).await;
        let manifest_path = root.join(
            layout::manifest_path(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        let manifest_bytes = if manifest_path.is_file() {
            std::fs::read(&manifest_path)
                .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?
        } else {
            let Some(fetched) = fetch(
                &client,
                &self.courtesy,
                &profile,
                &config.manifest_url,
                ctx.attempt,
                &signals,
            )
            .await
            .inspect_err(|_| discard(&staging))?
            else {
                return Ok(stopped_outcome(&ctx, &staging));
            };
            stage_and_promote(
                &staging.join("manifest.json"),
                &manifest_path,
                &fetched.bytes,
                integrity::FileKind::Manifest,
            )?;
            fetched.bytes
        };

        let manifest = parse(&manifest_bytes)?;
        let total = manifest.pages.len() as u32;
        // Il titolo va nel messaggio del lavoro: nel pannello si legge quello,
        // e «207/362» da solo non dice quale libro sta scaricando.
        let title = source_title(&ctx, &config.version_id)
            .await
            .unwrap_or_else(|| config.version_id.clone());
        record_manifest(&ctx, &config, total, &manifest).await?;
        log::info!(
            "job download starting id={} provider={} pages={} resume_from={} cap={} thumb={}",
            ctx.id,
            config.provider_key,
            total,
            ctx.checkpoint
                .as_deref()
                .and_then(|saved| serde_json::from_str::<Checkpoint>(saved).ok())
                .map(|saved| saved.done)
                .unwrap_or(0),
            config.size_tag,
            config.thumbnail_edge
        );

        // 2. Le carte, una per volta: il confine dove ci si può fermare.
        //
        // Il punto salvato conta **le carte fatte**, non il numero dell'ultima:
        // se il manifesto dichiara canvas non scaricabili i due valori
        // divergono, e saltare per numero perderebbe carte a ogni ripresa.
        let start = ctx
            .checkpoint
            .as_deref()
            .and_then(|saved| serde_json::from_str::<Checkpoint>(saved).ok())
            .map(|saved| saved.done.min(total))
            .unwrap_or(0);
        // Le misure decise per gruppo di carte valgono per tutto il lavoro, e
        // con loro le alternative che la biblioteca ha dichiarato.
        let sizes: SizeCache = Default::default();
        let declared: DeclaredSizes = Default::default();
        ctx.report_phase(phase::DOWNLOADING).await;
        let mut done = start;
        // Da qui si misura il ritmo vero: quante pagine sono passate in questo
        // avvio e in quanto tempo. Una ripresa riparte da zero di misura, che è
        // giusto — la biblioteca di adesso non è quella di ieri.
        let started_at = std::time::Instant::now();
        // Quanto pesa già sul disco: serve al messaggio del pannello, e leggerlo
        // una volta sola evita una somma per ogni carta. Sono le **carte**: le
        // miniature pesano una frazione e conteggiarle renderebbe la stima meno
        // leggibile senza dire niente di più.
        let mut bytes = recorded_bytes(&ctx, &config.version_id, PAGE_KIND).await;

        for page in manifest.pages.iter().skip(start as usize) {
            // Il confine dell'unità di lavoro: qui ci si ferma, mai a metà
            // pagina (D14, D15).
            if stop() {
                return Ok(stopped_outcome(&ctx, &staging));
            }

            let eta = estimated_seconds(
                total.saturating_sub(done),
                done.saturating_sub(start),
                started_at.elapsed(),
                &profile,
            );
            let progress = f64::from(done) / f64::from(total.max(1));
            let fetched = self
                .fetch_page_declaring_long_waits(
                    &ctx, &client, &profile, &config, &manifest, &sizes, &declared, &root,
                    &staging, page, progress, &title, eta, &signals,
                )
                .await
                .inspect_err(|_| discard(&staging))?;
            let Some(last) = fetched else {
                return Ok(stopped_outcome(&ctx, &staging));
            };
            let added = last.bytes;

            done += 1;
            bytes += added;
            log::debug!(
                "job page id={} page={}/{} added={} total={}",
                ctx.id,
                done,
                total,
                added,
                bytes
            );
            ctx.save_checkpoint(&serde_json::json!(Checkpoint { done }).to_string())
                .await
                // Senza il punto salvato la ripresa ripartirebbe da più indietro:
                // non è fatale, ma non deve sparire in silenzio.
                .unwrap_or_else(|error| {
                    log::warn!(
                        "job checkpoint not saved id={} at={done} error={error}",
                        ctx.id
                    )
                });

            ctx.report(
                f64::from(done) / f64::from(total.max(1)),
                Some(&title),
                Some(estimated_seconds(
                    total.saturating_sub(done),
                    done.saturating_sub(start),
                    started_at.elapsed(),
                    &profile,
                )),
                Some(&progress_detail(
                    done,
                    total,
                    bytes,
                    &config.size_tag,
                    &known_sizes(&declared),
                    &config.provider_key,
                    &host_of(&page.image_service).unwrap_or_default(),
                    LastPage {
                        index: page.index,
                        label: page.label.clone(),
                        outcome: &last,
                        declared: &known_sizes(&declared),
                    },
                )),
            )
            .await;
        }

        log::info!(
            "job download complete id={} pages={} bytes={}",
            ctx.id,
            done,
            bytes
        );
        discard(&staging);
        Ok(Outcome::Done)
    }
}

impl SourceDownloadJob {
    /// Come `fetch_page`, ma se la carta tarda dichiara **perché** (D17): con i
    /// raffreddamenti di D18 un lavoro può restare fermo minuti, e fermo per
    /// cortesia e fermo per errore sono la stessa immobilità con significati
    /// opposti.
    #[allow(clippy::too_many_arguments)]
    async fn fetch_page_declaring_long_waits(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
        sizes: &SizeCache,
        declared: &DeclaredSizes,
        root: &Path,
        staging: &Path,
        page: &Page,
        progress: f64,
        label: &str,
        eta: i64,
        signals: &Signals<'_>,
    ) -> Result<Option<PageOutcome>, JobError> {
        let work = self.fetch_page(
            ctx, client, profile, config, manifest, sizes, declared, root, staging, page, signals,
        );
        tokio::pin!(work);

        tokio::select! {
            outcome = &mut work => outcome,
            _ = tokio::time::sleep(DECLARE_WAIT_AFTER) => {
                // Si dichiara l'attesa **solo se è la nostra**: pausa, raffica o
                // raffreddamento. Un server lento a rispondere non è un limite
                // che stiamo rispettando, ed è la stessa immobilità con la causa
                // opposta (D17).
                if signals.courtesy_wait.load(std::sync::atomic::Ordering::SeqCst) {
                    log::info!(
                        "job waiting id={} reason={} page={}",
                        ctx.id,
                        crate::jobs::WAITING_LIBRARY_LIMITS,
                        page.index
                    );
                    ctx.report_waiting(progress, Some(label), Some(eta)).await;
                }
                work.await
            }
        }
    }

    /// `Ok(None)` significa che il lavoro è stato fermato mentre aspettava il
    /// suo turno: non è un errore e non è una carta saltata. `Ok(Some(n))` dice
    /// quanti byte sono stati aggiunti al deposito adesso.
    #[allow(clippy::too_many_arguments)]
    async fn fetch_page(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
        sizes: &SizeCache,
        declared: &DeclaredSizes,
        root: &Path,
        staging: &Path,
        page: &Page,
        signals: &Signals<'_>,
    ) -> Result<Option<PageOutcome>, JobError> {
        let relative = layout::page_path(
            &config.provider_key,
            &config.version_id,
            &config.size_tag,
            page.index,
        )
        .map_err(|error| JobError::new(ErrorKind::Internal, error))?;
        let target = root.join(&relative);
        let vault_path = relative.to_string_lossy().replace('\\', "/");

        // Basta che il file ci sia: nel deposito entra **solo** ciò che ha già
        // superato la validazione nell'area di transito (D16-bis), quindi ciò
        // che è lì dentro è valido per costruzione. Rileggerlo e ricalcolarne
        // l'impronta a ogni ripresa vorrebbe dire rileggere centinaia di
        // megabyte per non scoprire niente.
        if target.is_file() {
            // Una carta sul disco senza la sua riga esiste se l'applicazione è
            // morta fra la promozione e la scrittura: senza rifarla adesso, il
            // conteggio della disponibilità resterebbe sotto il vero per
            // sempre, perché la ripresa la salterà ogni volta.
            let mut added = 0;
            if !is_recorded(ctx, &page_asset_id(config, page)).await {
                let scan = integrity::scan_file(&target, integrity::FileKind::Image);
                let size = std::fs::metadata(&target)
                    .map(|meta| meta.len())
                    .unwrap_or(0);
                added = size;
                log::debug!(
                    "job page recovered id={} page={} bytes={} (file sul disco senza riga)",
                    ctx.id,
                    page.index,
                    size
                );
                record_asset(
                    ctx,
                    AssetRow {
                        id: page_asset_id(config, page),
                        version_id: config.version_id.clone(),
                        kind: PAGE_KIND,
                        vault_path: vault_path.clone(),
                        remote_url: Some(self.known_url(sizes, page, manifest)),
                        byte_size: size as i64,
                        checksum: scan.checksum.unwrap_or_default(),
                        page_index: page.index as i64,
                        page_label: page.label.clone(),
                        size_tag: config.size_tag.clone(),
                    },
                )
                .await?;
            }
            // La carta c'era: la miniatura può non esserci — la si ricava solo
            // se manca, rileggendo il file una volta sola.
            self.recover_thumbnail(ctx, config, staging, root, page, &target)
                .await;
            return Ok(Some(PageOutcome {
                bytes: added,
                // Ritrovata sul disco: non è stata chiesta a nessuno, e per
                // questo non c'è una misura negoziata da mostrare.
                recovered: true,
                token: self.requested_size(sizes, page, config),
                url: self.known_url(sizes, page, manifest),
            }));
        }

        let (fetched, url) = match self
            .fetch_at_best_size(
                ctx, client, profile, config, manifest, sizes, declared, page, signals,
            )
            .await?
        {
            Some(found) => found,
            None => return Ok(None),
        };
        let checksum = stage_and_promote(
            &staging.join(page_staging_name(page.index)),
            &target,
            &fetched.bytes,
            integrity::FileKind::Image,
        )?;

        let size = fetched.bytes.len() as u64;
        record_asset(
            ctx,
            AssetRow {
                id: page_asset_id(config, page),
                version_id: config.version_id.clone(),
                kind: PAGE_KIND,
                vault_path,
                remote_url: Some(url.clone()),
                byte_size: size as i64,
                checksum,
                page_index: page.index as i64,
                page_label: page.label.clone(),
                size_tag: config.size_tag.clone(),
            },
        )
        .await?;

        // La miniatura si ricava adesso, dai byte che sono già qui: la carta è
        // al sicuro nel deposito, e se la miniatura non riesce non si perde il
        // lavoro di rete già fatto.
        self.store_thumbnail(ctx, config, staging, root, page, fetched.bytes)
            .await;
        Ok(Some(PageOutcome {
            bytes: size,
            recovered: false,
            token: self.requested_size(sizes, page, config),
            url,
        }))
    }

    /// Ricava la miniatura di una carta e la mette nel deposito.
    ///
    /// **Non fa fallire il lavoro**: una carta senza miniatura è una carta che
    /// si legge lo stesso, e rinunciare a un libro intero per un'immagine da
    /// sfogliare sarebbe sproporzionato. Il caso si legge nel registro e la
    /// verifica del deposito lo riporta come file mancante.
    async fn store_thumbnail(
        &self,
        ctx: &JobContext,
        config: &DownloadConfig,
        staging: &Path,
        root: &Path,
        page: &Page,
        page_bytes: Vec<u8>,
    ) {
        if let Err(error) = self
            .write_thumbnail(ctx, config, staging, root, page, page_bytes)
            .await
        {
            log::warn!(
                "job thumbnail not derived id={} page={} error={}",
                ctx.id,
                page.index,
                error.message
            );
        }
    }

    /// La carta era già nel deposito: se manca la sua miniatura la si ricava
    /// rileggendo il file. Costa una lettura per carta, e solo per le carte a
    /// cui la miniatura manca davvero.
    async fn recover_thumbnail(
        &self,
        ctx: &JobContext,
        config: &DownloadConfig,
        staging: &Path,
        root: &Path,
        page: &Page,
        page_path: &Path,
    ) {
        let Ok(relative) =
            layout::thumbnail_path(&config.provider_key, &config.version_id, page.index)
        else {
            return;
        };
        if root.join(&relative).is_file()
            && is_recorded(ctx, &thumbnail_asset_id(config, page)).await
        {
            return;
        }
        match std::fs::read(page_path) {
            Ok(bytes) => {
                self.store_thumbnail(ctx, config, staging, root, page, bytes)
                    .await
            }
            Err(error) => log::warn!(
                "job thumbnail source unreadable id={} page={} error={error}",
                ctx.id,
                page.index
            ),
        }
    }

    async fn write_thumbnail(
        &self,
        ctx: &JobContext,
        config: &DownloadConfig,
        staging: &Path,
        root: &Path,
        page: &Page,
        page_bytes: Vec<u8>,
    ) -> Result<(), JobError> {
        let relative = layout::thumbnail_path(&config.provider_key, &config.version_id, page.index)
            .map_err(|error| JobError::new(ErrorKind::Internal, error))?;
        let target = root.join(&relative);

        // Decodifica e ricodifica pesano sul processore: dentro il filo del
        // runtime terrebbero fermo tutto il resto della coda mentre lavorano.
        let edge = config.thumbnail_edge;
        let bytes = tokio::task::spawn_blocking(move || images::thumbnail(&page_bytes, edge))
            .await
            .map_err(|error| JobError::new(ErrorKind::Internal, error.to_string()))?
            .map_err(|error| JobError::new(ErrorKind::Internal, error.to_string()))?;

        let checksum = stage_and_promote(
            &staging.join(thumbnail_staging_name(page.index)),
            &target,
            &bytes,
            integrity::FileKind::Image,
        )?;
        record_asset(
            ctx,
            AssetRow {
                id: thumbnail_asset_id(config, page),
                version_id: config.version_id.clone(),
                kind: THUMBNAIL_KIND,
                vault_path: relative.to_string_lossy().replace('\\', "/"),
                // Non arriva da nessun indirizzo: la ricaviamo noi dalla carta.
                remote_url: None,
                byte_size: bytes.len() as i64,
                checksum,
                page_index: page.index as i64,
                page_label: page.label.clone(),
                size_tag: config.thumbnail_edge.to_string(),
            },
        )
        .await
    }

    /// La misura davvero chiesta al servizio per questa unità, come la mostra il
    /// pannello: quella negoziata se c'è stata una negoziazione, il tetto
    /// altrimenti, e la parola per «l'ha dichiarata la biblioteca» quando
    /// l'indirizzo arriva dal manifesto.
    fn requested_size(&self, sizes: &SizeCache, page: &Page, config: &DownloadConfig) -> String {
        cached(sizes, page)
            .map(|token| token.0)
            .unwrap_or_else(|| config.size_tag.clone())
    }

    /// L'indirizzo da cui è arrivata una carta già presente sul disco, per
    /// scriverlo nella sua riga.
    fn known_url(
        &self,
        sizes: &SizeCache,
        page: &Page,
        manifest: &super::manifest::Manifest,
    ) -> String {
        let token = cached(sizes, page)
            .unwrap_or_else(|| size::SizeToken(size::full_size(manifest.presentation2)));
        image_url(&page.image_service, token.as_str())
    }

    /// Prende la carta alla misura dichiarata dal descrittore più vicina al
    /// tetto, letta una volta per gruppo di carte con le stesse dimensioni.
    ///
    /// Non si tenta il tetto alla cieca. È quello che dice D4 — «si legge una
    /// volta per digitalizzazione […] senza tentare richieste a indovinare» — ed
    /// è quello che dice la misura: su archive.org una larghezza che il servizio
    /// non tiene pronta la genera sul momento, 26 secondi contro 2 per una
    /// dichiarata, e non la tiene nemmeno in cache. Il descrittore costa una
    /// richiesta ogni gruppo: cinque su un libro di 924 carte.
    #[allow(clippy::too_many_arguments)]
    async fn fetch_at_best_size(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
        sizes: &SizeCache,
        declared: &DeclaredSizes,
        page: &Page,
        signals: &Signals<'_>,
    ) -> Result<Option<(super::fetch::Fetched, String)>, JobError> {
        // Politica «massima»: non c'è niente da scegliere, la dimensione piena
        // ha un nome suo nella specifica e il descrittore non aggiungerebbe
        // niente (D4).
        let token = if config.size_tag == "max" {
            size::SizeToken(size::full_size(manifest.presentation2))
        } else {
            match cached(sizes, page) {
                Some(token) => token,
                None => {
                    let Some(token) = self
                        .negotiate_size(
                            ctx, client, profile, config, sizes, declared, page, signals,
                        )
                        .await?
                    else {
                        return Ok(None);
                    };
                    token
                }
            }
        };

        let url = image_url(&page.image_service, token.as_str());
        let fetched = fetch(client, &self.courtesy, profile, &url, ctx.attempt, signals).await?;
        Ok(fetched.map(|fetched| (fetched, url)))
    }

    /// Legge il descrittore dell'immagine e ricava la misura da chiedere,
    /// ricordandola per tutte le carte con le stesse dimensioni.
    #[allow(clippy::too_many_arguments)]
    async fn negotiate_size(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        sizes: &SizeCache,
        declared: &DeclaredSizes,
        page: &Page,
        signals: &Signals<'_>,
    ) -> Result<Option<size::SizeToken>, JobError> {
        ctx.report_phase(phase::NEGOTIATING).await;
        let cap = config.size_tag.parse::<u32>().unwrap_or(DEFAULT_CAP_PIXELS);
        let info_url = size::info_url(&page.image_service);
        let Some(fetched) = fetch(
            client,
            &self.courtesy,
            profile,
            &info_url,
            ctx.attempt,
            signals,
        )
        .await?
        else {
            return Ok(None);
        };

        let token = match serde_json::from_slice::<serde_json::Value>(&fetched.bytes) {
            Ok(info) => {
                remember_sizes(declared, &size::available_sizes(&info));
                size::from_info(&info, cap)
            }
            Err(error) => {
                // Descrittore illeggibile: si continua con il riquadro, che non
                // ingrandisce mai, invece di fermare lo scaricamento.
                log::warn!(
                    "job size descriptor unreadable id={} page={} error={error}",
                    ctx.id,
                    page.index
                );
                size::SizeToken(format!("!{cap},{cap}"))
            }
        };

        ctx.report_phase(phase::DOWNLOADING).await;
        log::info!(
            "job size negotiated id={} group={} cap={} chosen={}",
            ctx.id,
            page.size
                .map(|(w, h)| format!("{w}x{h}"))
                .unwrap_or_else(|| "?".to_string()),
            cap,
            token.as_str()
        );
        remember(sizes, page, &token);
        Ok(Some(token))
    }
}

/// Le misure che la biblioteca dichiara di saper servire, raccolte leggendo i
/// descrittori. Sono le alternative fra cui la scelta è stata fatta: senza,
/// «1299» da solo non dice se era il massimo o il minimo disponibile.
type DeclaredSizes = std::sync::Mutex<Vec<(u32, u32)>>;

fn remember_sizes(sizes: &DeclaredSizes, declared: &[(u32, u32)]) {
    let mut known = match sizes.lock() {
        Ok(known) => known,
        Err(poisoned) => poisoned.into_inner(),
    };
    for size in declared {
        if !known.contains(size) {
            known.push(*size);
        }
    }
    known.sort_unstable_by_key(|(width, height)| (*width).max(*height));
}

/// Le alternative dichiarate, come le legge il pannello: `649×963`.
fn known_sizes(sizes: &DeclaredSizes) -> Vec<String> {
    let known = match sizes.lock() {
        Ok(known) => known.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    };
    known
        .into_iter()
        .map(|(width, height)| format!("{width}×{height}"))
        .collect()
}

/// Misura decisa per ogni gruppo di carte con le stesse dimensioni.
///
/// Le carte di uno stesso libro non hanno tutte la stessa dimensione: su
/// archive.org la prima carta può essere 2816x4240 e la terza 2598x3850, e le
/// misure che il servizio offre sono dimezzamenti dell'originale, quindi
/// diverse. Il gruppo è la dimensione dichiarata dal canvas.
type SizeCache = std::sync::Mutex<std::collections::HashMap<(u32, u32), size::SizeToken>>;

fn cached(sizes: &SizeCache, page: &Page) -> Option<size::SizeToken> {
    let key = page.size?;
    match sizes.lock() {
        Ok(cache) => cache.get(&key).cloned(),
        Err(poisoned) => poisoned.into_inner().get(&key).cloned(),
    }
}

fn remember(sizes: &SizeCache, page: &Page, token: &size::SizeToken) {
    let Some(key) = page.size else { return };
    let mut cache = match sizes.lock() {
        Ok(cache) => cache,
        Err(poisoned) => poisoned.into_inner(),
    };
    cache.insert(key, token.clone());
}

/// Titolo della fonte a cui appartiene la digitalizzazione.
async fn source_title(ctx: &JobContext, version_id: &str) -> Option<String> {
    let version_id = version_id.to_string();
    ctx.with_database(move |conn| {
        Ok(conn
            .query_row(
                "SELECT s.title FROM sources s \
                 JOIN source_versions v ON v.source_id = s.id WHERE v.id = ?1",
                rusqlite::params![version_id],
                |row| row.get::<_, String>(0),
            )
            .ok())
    })
    .await
    .ok()
    .flatten()
}

/// Come si è fermato: chi ha chiesto l'annullamento ha la precedenza sulla
/// pausa, perché è la richiesta più forte. In ogni caso la transito si scarta —
/// quello che non è stato promosso non serve a nessuno, e all'annullamento non
/// deve restare niente da pulire (D15).
fn stopped_outcome(ctx: &JobContext, staging: &Path) -> Outcome {
    discard(staging);
    if ctx.cancel_requested() {
        Outcome::Cancelled
    } else {
        Outcome::Paused
    }
}

/// Butta l'area di transito. Fallire qui non cambia l'esito del lavoro: al giro
/// successivo si ricrea.
fn discard(staging: &Path) {
    if let Err(error) = std::fs::remove_dir_all(staging) {
        if error.kind() != std::io::ErrorKind::NotFound {
            log::warn!(
                "job staging not cleaned path={} error={error}",
                staging.display()
            );
        }
    }
}

/// Com'è andata una pagina: quanto pesa, se è stata scaricata o ritrovata sul
/// disco, a che misura è stata chiesta e da dove è arrivata.
struct PageOutcome {
    bytes: u64,
    recovered: bool,
    token: String,
    url: String,
}

/// I dettagli dello scaricamento, come li legge il pannello (D20).
///
/// Il **nome** dell'opera sta nel messaggio; qui stanno i numeri, separati,
/// perché a formattarli — e a tradurli — è l'interfaccia. Il totale in byte è
/// una **stima** ricavata dalle carte già arrivate: dire solo quanto pesa la
/// carta in corso non direbbe niente su quanto manca.
#[allow(clippy::too_many_arguments)]
fn progress_detail(
    done: u32,
    total: u32,
    bytes: u64,
    cap: &str,
    available_sizes: &[String],
    provider: &str,
    host: &str,
    last: LastPage<'_>,
) -> String {
    let estimated = if done > 0 {
        bytes / u64::from(done) * u64::from(total)
    } else {
        0
    };
    serde_json::json!({
        "units": { "done": done, "total": total, "label": "items" },
        "bytes": { "downloaded": bytes, "estimated": estimated },
        // Il tetto **scelto dall'utente**, che è un'altra cosa dalla misura
        // chiesta per una singola pagina: leggerli sotto la stessa etichetta
        // faceva sembrare un'impostazione ciò che era il risultato di una
        // trattativa, e viceversa.
        "cap": cap,
        // Le alternative fra cui la scelta è stata fatta: «1299» da solo non
        // dice se era il massimo o il minimo che la biblioteca sa servire.
        "available": available_sizes,
        "provider": provider,
        "host": host,
        "last": {
            "index": last.index,
            "label": last.label,
            "bytes": last.outcome.bytes,
            // La misura chiesta **per questa pagina**: quella negoziata se c'è
            // stata una trattativa, il tetto altrimenti.
            "size": last.outcome.token,
            "pixels": declared_pixels(last.declared, &last.outcome.token),
            // Ritrovata sul disco invece che scaricata: spiega da sola perché
            // non c'è una misura negoziata e perché è arrivata in un istante.
            "recovered": last.outcome.recovered,
            "url": last.outcome.url,
        },
    })
    .to_string()
}

/// Quello che si sa di una pagina appena passata.
struct LastPage<'a> {
    index: u32,
    label: Option<String>,
    outcome: &'a PageOutcome,
    declared: &'a [String],
}

/// Le dimensioni vere della misura chiesta, se la biblioteca le dichiara.
///
/// Il segnaposto IIIF porta la sola larghezza (`2000,`): l'altezza si trova fra
/// le misure dichiarate, e senza di quelle non si inventa.
fn declared_pixels(declared: &[String], token: &str) -> Option<String> {
    let width = token.trim_end_matches(',');
    declared
        .iter()
        .find(|size| size.split('×').next() == Some(width))
        .cloned()
}

/// Quanto pesa già nel deposito questa digitalizzazione.
async fn recorded_bytes(ctx: &JobContext, version_id: &str, kind: &str) -> u64 {
    let version_id = version_id.to_string();
    let kind = kind.to_string();
    ctx.with_database(move |conn| {
        conn.query_row(
            "SELECT COALESCE(SUM(byte_size), 0) FROM assets \
             WHERE source_version_id = ?1 AND kind = ?2",
            rusqlite::params![version_id, kind],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map(|total| total.max(0) as u64)
    .unwrap_or(0)
}

/// La carta ha già la sua riga? Serve solo quando il file c'è: dice se la riga
/// è andata persa insieme a una chiusura brusca.
async fn is_recorded(ctx: &JobContext, asset_id: &str) -> bool {
    let asset_id = asset_id.to_string();
    ctx.with_database(move |conn| {
        conn.query_row(
            "SELECT 1 FROM assets WHERE id = ?1",
            rusqlite::params![asset_id],
            |_| Ok(true),
        )
        .optional()
        .map_err(|error| error.to_string())
    })
    .await
    .ok()
    .flatten()
    .unwrap_or(false)
}

/// Identificativo della riga di una carta: digitalizzazione, risoluzione,
/// numero. La stessa carta a due risoluzioni sono due righe.
fn page_asset_id(config: &DownloadConfig, page: &Page) -> String {
    format!("{}:{}:{}", config.version_id, config.size_tag, page.index)
}

/// Identificativo della riga di una miniatura. Non porta la misura: di
/// miniature ce n'è una sola per carta, e se il lato lungo cambia si rifà
/// quella, non se ne affianca una seconda.
fn thumbnail_asset_id(config: &DownloadConfig, page: &Page) -> String {
    format!("{}:{}:{}", config.version_id, THUMBNAIL_KIND, page.index)
}

/// I due nomi che una carta prende nell'area di transito. Sono diversi perché
/// la cartella è una sola per digitalizzazione: carta e miniatura ci passano
/// una dopo l'altra.
fn page_staging_name(page_index: u32) -> String {
    format!("{page_index:04}.jpg")
}

fn thumbnail_staging_name(page_index: u32) -> String {
    format!("{page_index:04}-thumb.jpg")
}

/// Il profilo **in vigore** per questa biblioteca: prima quello che l'utente ha
/// cambiato, poi quello compilato nel registro, poi il prudente. Nessuna fonte
/// resta senza politica (D18).
///
/// Si rilegge all'avvio del lavoro e non alla messa in coda: fra le due può
/// passare tempo, e un lavoro ripreso dopo giorni deve rispettare i limiti di
/// adesso, non quelli di allora.
async fn profile_for(ctx: &JobContext, config: &DownloadConfig) -> NetworkProfile {
    let key = config.provider_key.clone();
    let host = host_of(&config.manifest_url).ok();
    ctx.with_database(move |conn| {
        Ok(crate::iiif::settings::effective_profile(
            conn,
            &key,
            host.as_deref(),
        ))
    })
    .await
    .unwrap_or_else(|error| {
        // Il database non risponde: si scarica al ritmo più prudente che
        // conosciamo, non a quello che capita.
        log::warn!(
            "job profile not read id={} error={error} (si usa il ritmo prudente)",
            ctx.id
        );
        CAUTIOUS
    })
}

/// Scrive nell'area di transito, valida, e **solo allora** promuove (D16-bis).
/// Un file parziale non entra mai nel deposito, quindi l'annullamento non deve
/// ripulire niente e una ripresa non rischia di saltarlo credendolo completo.
fn stage_and_promote(
    staged: &Path,
    target: &Path,
    bytes: &[u8],
    kind: integrity::FileKind,
) -> Result<String, JobError> {
    // Si valida quello che è arrivato, che è già in memoria: scriverlo per
    // poterlo rileggere sarebbe una lettura in più per ogni pagina.
    let scan = integrity::scan_bytes(bytes, kind);
    match scan.validation {
        integrity::Validation::Valid => {}
        integrity::Validation::Corrupt(reason) => {
            // Un file troncato ha la dimensione dichiarata dai metadati HTTP:
            // è il caso reale che un controllo di dimensione non vede.
            return Err(JobError::new(ErrorKind::Transport, reason));
        }
        integrity::Validation::Missing => {
            return Err(JobError::new(
                ErrorKind::Storage,
                "risposta vuota".to_string(),
            ))
        }
    }

    // Prima nell'area di transito, poi lo spostamento, che è atomico: se
    // l'applicazione muore in mezzo, nel deposito non resta un file a metà
    // (D16-bis). È anche ciò che permette di fidarsi della sola presenza del
    // file quando si riprende.
    if let Some(parent) = staged.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    std::fs::write(staged, bytes)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    std::fs::rename(staged, target)
        .map_err(|error| JobError::new(ErrorKind::Storage, format!("promozione: {error}")))?;

    scan.checksum
        .ok_or_else(|| JobError::new(ErrorKind::Internal, "impronta mancante".to_string()))
}

async fn record_manifest(
    ctx: &JobContext,
    config: &DownloadConfig,
    total: u32,
    manifest: &super::manifest::Manifest,
) -> Result<(), JobError> {
    let homepage = manifest.homepage.clone();
    let relative = layout::manifest_path(&config.provider_key, &config.version_id)
        .map_err(|error| JobError::new(ErrorKind::Internal, error))?
        .to_string_lossy()
        .replace('\\', "/");
    let version_id = config.version_id.clone();
    let url = config.manifest_url.clone();

    let rights = manifest.rights.clone();
    let attribution = manifest.attribution.clone();

    ctx.with_database(move |conn| {
        conn.execute(
            "UPDATE source_versions SET expected_asset_count = ?2, homepage_url = COALESCE(?3, homepage_url) \
             WHERE id = ?1",
            params![version_id, total as i64, homepage],
        )
        .map_err(|error| format!("conteggio carte: {error}"))?;

        // Licenza e attribuzione dichiarate dal manifesto vanno conservate
        // insieme alla fonte (D2-bis): materiale d'archivio senza attribuzione
        // è un problema, non un dettaglio. Si aggiungono ai metadati esistenti
        // invece di sostituirli, perché quelli vengono dal catalogo.
        if rights.is_some() || attribution.is_some() {
            let existing: Option<String> = conn
                .query_row(
                    "SELECT metadata FROM source_versions WHERE id = ?1",
                    params![version_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("metadati della digitalizzazione: {error}"))?;
            let mut merged: serde_json::Map<String, serde_json::Value> = existing
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or_default();
            if let Some(value) = rights {
                merged.insert("rights".to_string(), serde_json::Value::String(value));
            }
            if let Some(value) = attribution {
                merged.insert("attribution".to_string(), serde_json::Value::String(value));
            }
            conn.execute(
                "UPDATE source_versions SET metadata = ?2 WHERE id = ?1",
                params![version_id, serde_json::Value::Object(merged).to_string()],
            )
            .map_err(|error| format!("licenza e attribuzione: {error}"))?;
        }
        // La riga del manifesto esiste già: l'aggiunta della fonte alla
        // Biblioteca ne crea una `remote`/`catalogued`. Va **aggiornata**, non
        // affiancata da una seconda: due righe manifesto per la stessa
        // digitalizzazione falserebbero il conteggio della disponibilità.
        let updated = conn
            .execute(
                "UPDATE assets SET locality = 'local', availability = 'complete', \
                 vault_path = ?2, updated_at = CURRENT_TIMESTAMP \
                 WHERE source_version_id = ?1 AND kind = 'manifest'",
                params![version_id, relative],
            )
            .map_err(|error| format!("riga del manifesto: {error}"))?;
        if updated == 0 {
            conn.execute(
                "INSERT INTO assets (id, source_version_id, kind, locality, availability, \
                     vault_path, remote_url) \
                 VALUES (?1, ?2, 'manifest', 'local', 'complete', ?3, ?4)",
                params![format!("{version_id}:manifest"), version_id, relative, url],
            )
            .map_err(|error| format!("riga del manifesto: {error}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}

/// Una riga di `assets`, come la scrive questo lavoro: carta o miniatura.
///
/// Sta in una struttura invece che in dieci argomenti perché i due casi
/// differiscono in sei campi su dieci, e allineare posizioni a mano è il modo
/// più facile per scambiare due stringhe senza che nessuno se ne accorga.
struct AssetRow {
    id: String,
    version_id: String,
    kind: &'static str,
    vault_path: String,
    /// Assente per ciò che ricaviamo noi: nessun indirizzo l'ha servito.
    remote_url: Option<String>,
    byte_size: i64,
    checksum: String,
    page_index: i64,
    page_label: Option<String>,
    size_tag: String,
}

async fn record_asset(ctx: &JobContext, row: AssetRow) -> Result<(), JobError> {
    ctx.with_database(move |conn| {
        conn.execute(
            "INSERT INTO assets (id, source_version_id, kind, locality, availability, vault_path, \
                 remote_url, byte_size, checksum, page_index, page_label, size_tag) \
             VALUES (?1, ?2, ?10, 'local', 'complete', ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
             ON CONFLICT(id) DO UPDATE SET vault_path = excluded.vault_path, \
               availability = 'complete', byte_size = excluded.byte_size, \
               checksum = excluded.checksum, updated_at = CURRENT_TIMESTAMP",
            params![
                row.id,
                row.version_id,
                row.vault_path,
                row.remote_url,
                row.byte_size,
                row.checksum,
                row.page_index,
                row.page_label,
                row.size_tag,
                row.kind
            ],
        )
        .map_err(|error| format!("riga dell'immagine: {error}"))?;
        Ok(())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}

/// Quante pagine servono prima di fidarsi del ritmo osservato. Con una o due
/// la media è quella di un campione, non di un andamento.
const PACE_SAMPLE: u32 = 3;

/// Stima del tempo che manca *(D17, corretta il 2026-08-16 dopo averla vista
/// sbagliare)*.
///
/// **Dal ritmo vero del lavoro**: pagine fatte diviso tempo trascorso da quando
/// è partito. La prima stesura la calcolava dalla pausa dichiarata dal profilo,
/// per non far oscillare il numero con la velocità degli ultimi secondi — ma
/// quella pausa è il minimo che aspettiamo noi, non quanto ci mette la
/// biblioteca a rispondere: su archive.org dice 1,6 secondi a pagina dove la
/// realtà misurata va da 1 a 19, e un manoscritto annunciato in sei minuti ne
/// prende quaranta.
///
/// La media **da inizio lavoro** non oscilla come una media sugli ultimi
/// secondi, che era il difetto che la prima stesura voleva evitare: si assesta
/// e cala mentre il lavoro procede. Finché le pagine fatte sono poche resta la
/// pausa dichiarata, che è l'unica cosa che si sa prima di aver misurato.
fn estimated_seconds(
    remaining: u32,
    done_now: u32,
    elapsed: Duration,
    profile: &NetworkProfile,
) -> i64 {
    let per_page = if done_now >= PACE_SAMPLE {
        elapsed / done_now
    } else {
        profile.average_pause() + Duration::from_millis(500)
    };
    (u64::from(remaining) * per_page.as_millis() as u64 / 1000) as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::GALLICA;

    #[test]
    fn before_having_measured_anything_the_estimate_comes_from_the_declared_pause() {
        let quick = estimated_seconds(10, 0, Duration::ZERO, &CAUTIOUS);
        let long = estimated_seconds(210, 0, Duration::ZERO, &GALLICA);

        assert!(long > quick);
        // Con i valori di Gallica un manoscritto di 210 pagine non scende sotto
        // il quarto d'ora: se la stima dicesse meno, mentirebbe.
        assert!(long >= 900, "stimati {long} secondi");
    }

    #[test]
    fn once_it_has_measured_the_estimate_follows_the_real_pace() {
        // La pausa dichiarata da archive.org è poco più di un secondo, ma il
        // servizio ci mette dieci volte tanto: la stima deve dire quello che
        // sta succedendo, non quello che avevamo promesso di aspettare.
        let measured = estimated_seconds(100, 10, Duration::from_secs(120), &CAUTIOUS);

        assert_eq!(measured, 1_200, "12 secondi a pagina per 100 pagine");
        assert!(measured > estimated_seconds(100, 0, Duration::ZERO, &CAUTIOUS));
    }

    #[test]
    fn two_pages_are_not_a_pace() {
        // Con un campione così piccolo una pagina lenta falserebbe tutto.
        let barely_started = estimated_seconds(100, 2, Duration::from_secs(60), &CAUTIOUS);

        assert_eq!(
            barely_started,
            estimated_seconds(100, 0, Duration::ZERO, &CAUTIOUS)
        );
    }

    fn config(size_tag: &str) -> DownloadConfig {
        serde_json::from_value(serde_json::json!({
            "providerKey": "archive_org",
            "versionId": "sver-1",
            "manifestUrl": "https://example.org/manifest",
            "sizeTag": size_tag,
        }))
        .unwrap()
    }

    fn page(index: u32) -> Page {
        Page {
            index,
            label: None,
            image_service: "https://img/1".to_string(),
            size: Some((100, 200)),
        }
    }

    #[test]
    fn a_page_and_its_thumbnail_are_two_distinct_rows() {
        // Se i due identificativi coincidessero, la miniatura sovrascriverebbe
        // la riga della carta e il conteggio della disponibilità crollerebbe.
        let config = config("300");

        assert_ne!(
            page_asset_id(&config, &page(7)),
            thumbnail_asset_id(&config, &page(7))
        );
        // Nemmeno quando il tetto delle carte coincide con il lato lungo delle
        // miniature: l'identificativo della miniatura non porta una misura.
        assert_eq!(thumbnail_asset_id(&config, &page(7)), "sver-1:thumbnail:7");
    }

    #[test]
    fn page_and_thumbnail_do_not_share_a_name_in_the_staging_area() {
        // La cartella di transito è una sola per digitalizzazione: due nomi
        // uguali vorrebbero dire che una delle due immagini porta via l'altra
        // prima della promozione.
        assert_ne!(page_staging_name(12), thumbnail_staging_name(12));
    }

    #[test]
    fn without_a_configured_edge_the_thumbnails_are_the_default_size() {
        // La configurazione arriva dal frontend: se il campo manca, la
        // miniatura si ricava lo stesso, alla misura predefinita.
        assert_eq!(
            config("2000").thumbnail_edge,
            images::DEFAULT_THUMBNAIL_EDGE
        );
    }

    #[test]
    fn the_folder_is_named_by_the_policy_not_by_the_pixels_obtained() {
        // La cartella porta il **tetto** chiesto, non la misura ottenuta: il
        // servizio può servire 1299 dove ne chiedevamo 2000, e le carte dello
        // stesso libro possono avere misure diverse fra loro. Tenere il tetto
        // come nome è ciò che permette a una ripresa di ritrovare le carte già
        // scaricate (D4).
        let relative = crate::vault::layout::page_path("gallica", "v1", "2000", 7).unwrap();
        let served = super::image_url("https://img/1", "1299,");

        assert!(relative.to_string_lossy().contains("/2000/"));
        assert!(served.contains("/full/1299,/"));
    }

    #[test]
    fn the_detail_says_how_much_is_arrived_and_how_much_is_expected() {
        // Dire solo quanto pesa la carta in corso non dice niente su quanto
        // manca: il totale è una stima ricavata da quelle già arrivate.
        let declared = [
            "649×963".to_string(),
            "1299×1925".to_string(),
            "2598×3850".to_string(),
        ];
        let outcome = PageOutcome {
            bytes: 1_420_000,
            recovered: false,
            token: "1299,".to_string(),
            url: "https://iiif.archive.org/img/full/1299,/0/default.jpg".to_string(),
        };
        let detail = progress_detail(
            34,
            352,
            48_234_496,
            "2000",
            &declared,
            "archive_org",
            "iiif.archive.org",
            LastPage {
                index: 34,
                label: Some("f. 17r".to_string()),
                outcome: &outcome,
                declared: &declared,
            },
        );
        let parsed: serde_json::Value = serde_json::from_str(&detail).unwrap();

        assert_eq!(parsed["units"]["done"], 34);
        assert_eq!(parsed["units"]["total"], 352);
        assert_eq!(parsed["bytes"]["downloaded"], 48_234_496);
        // 48 MB per 34 carte, 352 carte in tutto: mezzo giga scarso.
        assert_eq!(parsed["bytes"]["estimated"], 48_234_496u64 / 34 * 352);
        // Il tetto scelto e la misura chiesta per **questa** pagina sono due
        // cose diverse, e stanno in due posti diversi.
        assert_eq!(parsed["cap"], "2000");
        assert_eq!(parsed["last"]["size"], "1299,");
        assert_eq!(parsed["last"]["bytes"], 1_420_000);
        assert_eq!(parsed["last"]["label"], "f. 17r");
        assert_eq!(parsed["last"]["recovered"], false);
        // Le dimensioni vere, prese fra quelle dichiarate: il segnaposto porta
        // solo la larghezza.
        assert_eq!(parsed["last"]["pixels"], "1299×1925");
        // Le alternative dichiarate dalla biblioteca: senza, «1299» non dice se
        // era il massimo o il minimo che sa servire.
        assert_eq!(parsed["available"][0], "649×963");
        assert_eq!(parsed["available"][2], "2598×3850");
    }

    #[test]
    fn a_page_found_on_disk_says_so_and_invents_no_size() {
        // È la spiegazione di due cose insieme: perché è arrivata in un istante
        // e perché la misura mostrata è il tetto invece di una negoziata.
        let outcome = PageOutcome {
            bytes: 613_040,
            recovered: true,
            token: "2000".to_string(),
            url: "https://iiif.archive.org/img/full/2000,/0/default.jpg".to_string(),
        };
        let detail = progress_detail(
            2,
            10,
            1_000_000,
            "2000",
            &[],
            "archive_org",
            "iiif.archive.org",
            LastPage {
                index: 2,
                label: None,
                outcome: &outcome,
                declared: &[],
            },
        );
        let parsed: serde_json::Value = serde_json::from_str(&detail).unwrap();

        assert_eq!(parsed["last"]["recovered"], true);
        assert!(parsed["last"]["pixels"].is_null());
    }

    #[test]
    fn without_a_single_page_done_no_total_is_invented() {
        let outcome = PageOutcome {
            bytes: 0,
            recovered: false,
            token: "2000,".to_string(),
            url: String::new(),
        };
        let detail = progress_detail(
            0,
            352,
            0,
            "2000",
            &[],
            "gallica",
            "gallica.bnf.fr",
            LastPage {
                index: 0,
                label: None,
                outcome: &outcome,
                declared: &[],
            },
        );
        let parsed: serde_json::Value = serde_json::from_str(&detail).unwrap();

        assert_eq!(parsed["bytes"]["estimated"], 0);
    }

    #[test]
    fn the_staging_folder_cannot_be_pushed_outside_the_vault() {
        // La configurazione arriva dal frontend: un identificativo con `..`
        // farebbe creare cartelle fuori dal deposito.
        assert!(layout::safe_component("../../etc").is_err());
        assert!(layout::safe_component("sver-abc123").is_ok());
    }

    #[test]
    fn a_truncated_file_never_reaches_the_vault() {
        let dir = std::env::temp_dir().join("glossa_download_promote");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let staged = dir.join("staged.jpg");
        let target = dir.join("target.jpg");

        let error = stage_and_promote(
            &staged,
            &target,
            b"\xFF\xD8\xFFtroncato",
            integrity::FileKind::Image,
        )
        .unwrap_err();

        assert_eq!(error.kind, ErrorKind::Transport, "si ritenta");
        assert!(!target.exists(), "non deve essere entrato nel deposito");
        assert!(!staged.exists(), "e l'area di transito resta pulita");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_whole_file_is_promoted_with_its_checksum() {
        let dir = std::env::temp_dir().join("glossa_download_promote_ok");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let staged = dir.join("staged.jpg");
        let target = dir.join("pages/2000/0001.jpg");
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(&[0u8; 32]);
        bytes.extend_from_slice(&[0xFF, 0xD9]);

        let checksum =
            stage_and_promote(&staged, &target, &bytes, integrity::FileKind::Image).unwrap();

        assert!(target.is_file());
        assert!(!checksum.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
