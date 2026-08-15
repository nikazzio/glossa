//! Il gestore dello scaricamento: il primo lavoro vero della coda.
//!
//! Dal manifesto alle carte sul disco. Salta ciò che è già valido, salva dove è
//! arrivato, si ferma al confine della carta quando glielo si chiede, e non fa
//! entrare nel deposito niente che non abbia superato la validazione: un file
//! parziale non esiste mai lì dentro (D16-bis).

use async_trait::async_trait;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

use crate::iiif::network::{NetworkProfile, CAUTIOUS};
use crate::jobs::engine::{JobContext, JobHandler};
use crate::jobs::{ErrorKind, JobError, Outcome, Recovery, ResourceClass};
use crate::vault::{integrity, layout};

use super::courtesy::Courtesy;
use super::fetch::{build_client, fetch, host_of};
use super::manifest::{image_url, parse, Page};
use super::size;

pub const JOB_TYPE: &str = "source_download";
pub const THUMBNAILS_JOB_TYPE: &str = "source_thumbnails";

/// Cosa scarica questo lavoro. Il giro è lo stesso — manifesto, carte una per
/// volta, area di transito, punto salvato — cambiano il tetto di risoluzione,
/// dove finisce il file e come si chiama la riga nel database.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// Le carte alla risoluzione scelta dalla politica (D4).
    Pages,
    /// Le miniature, tutte, **insieme allo scaricamento del libro** (D6,
    /// corretta il 2026-08-15): rendono il libro sfogliabile senza rete, e
    /// finché non lo si scarica si leggono online come le carte.
    Thumbnails,
}

/// Tetto delle miniature, sul lato lungo. Basso e fisso: servono a sfogliare,
/// non a leggere.
const THUMBNAIL_CAP: &str = "256";

impl Target {
    fn job_type(self) -> &'static str {
        match self {
            Target::Pages => JOB_TYPE,
            Target::Thumbnails => THUMBNAILS_JOB_TYPE,
        }
    }

    /// Il tetto di risoluzione da chiedere al servizio.
    fn cap(self, config: &DownloadConfig) -> &str {
        match self {
            Target::Pages => &config.size_tag,
            Target::Thumbnails => THUMBNAIL_CAP,
        }
    }

    /// `assets.kind`: le miniature non contano nella disponibilità delle carte
    /// (D7), e «libera spazio» non le tocca (D6).
    fn asset_kind(self) -> &'static str {
        match self {
            Target::Pages => "image",
            Target::Thumbnails => "thumbnail",
        }
    }

    /// L'indirizzo che la biblioteca dichiara per questa unità, quando esiste.
    ///
    /// È il primo dei tre livelli: la specifica prevede che un canvas possa
    /// dichiarare la propria miniatura già pronta, e in quel caso non c'è
    /// nessuna misura da scegliere né nessun descrittore da leggere.
    fn declared_url(self, page: &Page) -> Option<String> {
        match self {
            Target::Pages => None,
            Target::Thumbnails => page.thumbnail.clone(),
        }
    }

    /// Se leggere il descrittore **prima** di chiedere, invece di provare il
    /// tetto e ripiegare.
    ///
    /// Per le miniature sì, sempre: il tetto è piccolo e quasi mai coincide con
    /// una misura che il servizio tiene pronta, quindi il server la genera sul
    /// momento. Misurato su archive.org: 23 secondi per una larghezza inventata
    /// contro 1 secondo per una dichiarata, senza nemmeno tenerla in cache. Per
    /// le carte no: il tetto è grande, la richiesta o viene servita o dà errore,
    /// e leggere il descrittore costerebbe una richiesta in più per niente.
    fn ask_the_descriptor_first(self) -> bool {
        matches!(self, Target::Thumbnails)
    }

    fn relative_path(
        self,
        config: &DownloadConfig,
        page_index: u32,
    ) -> Result<std::path::PathBuf, String> {
        match self {
            Target::Pages => layout::page_path(
                &config.provider_key,
                &config.version_id,
                &config.size_tag,
                page_index,
            ),
            Target::Thumbnails => {
                layout::thumbnail_path(&config.provider_key, &config.version_id, page_index)
            }
        }
    }
}

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
}

/// Tetto predefinito: 2000 pixel sul lato lungo (D4).
const DEFAULT_CAP: u32 = 2000;

fn default_size_tag() -> String {
    DEFAULT_CAP.to_string()
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
    /// Condivisa fra i tipi di lavoro che parlano con le stesse biblioteche:
    /// carte e miniature dello stesso libro vanno sullo stesso host, e due
    /// contatori separati raddoppierebbero il ritmo verso quel server (D18).
    courtesy: std::sync::Arc<Courtesy>,
    target: Target,
}

impl SourceDownloadJob {
    pub fn new(courtesy: std::sync::Arc<Courtesy>, target: Target) -> Self {
        Self { courtesy, target }
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

        ctx.report_phase(phase::STARTING).await;

        let config: DownloadConfig = serde_json::from_str(&ctx.config).map_err(|error| {
            JobError::new(ErrorKind::Internal, format!("configurazione: {error}"))
        })?;
        let profile = profile_for(&config.provider_key);
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
        // Una transito **per variante**: carte e miniature della stessa
        // digitalizzazione girano insieme, e chi finisce per primo scarta la
        // propria cartella. Con una sola, il primo che finisce porterebbe via il
        // file che l'altro ha appena scritto e non ancora promosso.
        let staging = root
            .join(layout::STAGING_DIR)
            .join(
                layout::safe_component(&config.version_id)
                    .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
            )
            .join(self.target.asset_kind());
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
                &stop,
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
            "job download starting id={} type={} provider={} pages={} resume_from={} cap={}",
            ctx.id,
            self.target.job_type(),
            config.provider_key,
            total,
            ctx.checkpoint
                .as_deref()
                .and_then(|saved| serde_json::from_str::<Checkpoint>(saved).ok())
                .map(|saved| saved.done)
                .unwrap_or(0),
            self.target.cap(&config)
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
        // Le misure decise per gruppo di carte valgono per tutto il lavoro.
        let sizes: SizeCache = Default::default();
        ctx.report_phase(phase::DOWNLOADING).await;
        let mut done = start;
        // Quanto pesa già sul disco: serve al messaggio del pannello, e leggerlo
        // una volta sola evita una somma per ogni carta.
        let mut bytes = recorded_bytes(&ctx, &config.version_id, self.target.asset_kind()).await;

        for page in manifest.pages.iter().skip(start as usize) {
            // Il confine dell'unità di lavoro: qui ci si ferma, mai a metà
            // pagina (D14, D15).
            if stop() {
                return Ok(stopped_outcome(&ctx, &staging));
            }

            let eta = estimated_seconds(total.saturating_sub(done), &profile);
            let progress = f64::from(done) / f64::from(total.max(1));
            let fetched = self
                .fetch_page_declaring_long_waits(
                    &ctx, &client, &profile, &config, &manifest, &sizes, &root, &staging, page,
                    progress, &title, eta, &stop,
                )
                .await
                .inspect_err(|_| discard(&staging))?;
            let Some(added) = fetched else {
                return Ok(stopped_outcome(&ctx, &staging));
            };

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
                Some(estimated_seconds(total.saturating_sub(done), &profile)),
                Some(&progress_detail(
                    done,
                    total,
                    bytes,
                    page.index,
                    added,
                    &self.requested_size(&sizes, page, &config, &manifest),
                    &config.provider_key,
                    &host_of(&page.image_service).unwrap_or_default(),
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
        root: &Path,
        staging: &Path,
        page: &Page,
        progress: f64,
        label: &str,
        eta: i64,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<u64>, JobError> {
        let work = self.fetch_page(
            ctx, client, profile, config, manifest, sizes, root, staging, page, stop,
        );
        tokio::pin!(work);

        tokio::select! {
            outcome = &mut work => outcome,
            _ = tokio::time::sleep(DECLARE_WAIT_AFTER) => {
                log::info!(
                    "job waiting id={} reason={} page={}",
                    ctx.id,
                    crate::jobs::WAITING_LIBRARY_LIMITS,
                    page.index
                );
                ctx.report_waiting(progress, Some(label), Some(eta)).await;
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
        root: &Path,
        staging: &Path,
        page: &Page,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<u64>, JobError> {
        let relative = self
            .target
            .relative_path(config, page.index)
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
            if is_recorded(ctx, &page_asset_id(config, self.target, page)).await {
                return Ok(Some(0));
            }
            let scan = integrity::scan_file(&target, integrity::FileKind::Image);
            let size = std::fs::metadata(&target)
                .map(|meta| meta.len())
                .unwrap_or(0);
            let checksum = scan.checksum.unwrap_or_default();
            let url = self.known_url(sizes, page, config, manifest);
            log::debug!(
                "job page recovered id={} page={} bytes={} (file sul disco senza riga)",
                ctx.id,
                page.index,
                size
            );
            record_page(
                ctx,
                config,
                self.target,
                page,
                &vault_path,
                &checksum,
                size as i64,
                &url,
            )
            .await?;
            return Ok(Some(size));
        }

        let (fetched, url) = match self
            .fetch_at_best_size(ctx, client, profile, config, manifest, sizes, page, stop)
            .await?
        {
            Some(found) => found,
            None => return Ok(None),
        };
        let checksum = stage_and_promote(
            &staging.join(format!(
                "{}-{:04}.jpg",
                self.target.asset_kind(),
                page.index
            )),
            &target,
            &fetched.bytes,
            integrity::FileKind::Image,
        )?;

        let size = fetched.bytes.len() as u64;
        record_page(
            ctx,
            config,
            self.target,
            page,
            &vault_path,
            &checksum,
            size as i64,
            &url,
        )
        .await?;
        Ok(Some(size))
    }

    /// La misura davvero chiesta al servizio per questa unità, come la mostra il
    /// pannello: quella negoziata se c'è stata una negoziazione, il tetto
    /// altrimenti, e la parola per «l'ha dichiarata la biblioteca» quando
    /// l'indirizzo arriva dal manifesto.
    fn requested_size(
        &self,
        sizes: &SizeCache,
        page: &Page,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
    ) -> String {
        if self.target.declared_url(page).is_some() {
            return "declared".to_string();
        }
        cached(sizes, page)
            .or_else(|| {
                size::first_attempt(
                    self.target.cap(config),
                    manifest.presentation2,
                    page.service_level.as_deref(),
                )
            })
            .map(|token| token.0)
            .unwrap_or_else(|| size::full_size(manifest.presentation2))
    }

    /// L'indirizzo da cui è arrivata un'unità già presente sul disco, per
    /// scriverlo nella sua riga.
    fn known_url(
        &self,
        sizes: &SizeCache,
        page: &Page,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
    ) -> String {
        if let Some(declared) = self.target.declared_url(page) {
            return declared;
        }
        let token = cached(sizes, page)
            .or_else(|| {
                size::first_attempt(
                    self.target.cap(config),
                    manifest.presentation2,
                    page.service_level.as_deref(),
                )
            })
            .unwrap_or_else(|| size::SizeToken(size::full_size(manifest.presentation2)));
        image_url(&page.image_service, token.as_str())
    }

    /// Prende l'unità dall'indirizzo migliore fra i tre previsti.
    ///
    /// 1. **quello dichiarato dalla biblioteca**, quando c'è: niente da scegliere;
    /// 2. **la misura dichiarata dal descrittore** più vicina al tetto, letta una
    ///    volta per gruppo di unità con le stesse dimensioni — sempre per le
    ///    miniature, e per le carte solo dopo un rifiuto;
    /// 3. **il tetto così com'è**, che con un servizio conforme è già la
    ///    risposta giusta e non costa richieste in più.
    #[allow(clippy::too_many_arguments)]
    async fn fetch_at_best_size(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        manifest: &super::manifest::Manifest,
        sizes: &SizeCache,
        page: &Page,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<(super::fetch::Fetched, String)>, JobError> {
        if let Some(url) = self.target.declared_url(page) {
            let fetched = fetch(client, &self.courtesy, profile, &url, ctx.attempt, stop).await?;
            return Ok(fetched.map(|fetched| (fetched, url)));
        }

        let first = match cached(sizes, page) {
            Some(token) => Some(token),
            None if self.target.ask_the_descriptor_first() => None,
            None => size::first_attempt(
                self.target.cap(config),
                manifest.presentation2,
                page.service_level.as_deref(),
            ),
        };
        // Niente da tentare: o si è deciso di chiedere prima al descrittore, o
        // il servizio dichiara livello 0, dove la larghezza arbitraria non
        // esiste. In entrambi i casi la misura si legge invece di indovinarla.
        let token = match first {
            Some(token) => token,
            None => {
                let Some(token) = self
                    .negotiate_size(ctx, client, profile, config, sizes, page, stop)
                    .await?
                else {
                    return Ok(None);
                };
                token
            }
        };

        let url = image_url(&page.image_service, token.as_str());
        match fetch(client, &self.courtesy, profile, &url, ctx.attempt, stop).await {
            Ok(Some(fetched)) => Ok(Some((fetched, url))),
            Ok(None) => Ok(None),
            Err(error) => {
                // Rifiuto che può dipendere dalla misura chiesta: il servizio
                // dichiara un livello che non rispetta. Si negozia una volta per
                // gruppo di unità, poi si riprova.
                let renegotiable = matches!(error.kind, ErrorKind::Internal | ErrorKind::Transport)
                    && cached(sizes, page).is_none()
                    && self.target.cap(config) != "max";
                if !renegotiable {
                    return Err(error);
                }
                log::warn!(
                    "job size refused id={} page={} size={} error={}",
                    ctx.id,
                    page.index,
                    token.as_str(),
                    error.message
                );
                let Some(negotiated) = self
                    .negotiate_size(ctx, client, profile, config, sizes, page, stop)
                    .await?
                else {
                    return Ok(None);
                };
                if negotiated == token {
                    return Err(error);
                }
                let url = image_url(&page.image_service, negotiated.as_str());
                let fetched =
                    fetch(client, &self.courtesy, profile, &url, ctx.attempt, stop).await?;
                Ok(fetched.map(|fetched| (fetched, url)))
            }
        }
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
        page: &Page,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<size::SizeToken>, JobError> {
        ctx.report_phase(phase::NEGOTIATING).await;
        let cap = self
            .target
            .cap(config)
            .parse::<u32>()
            .unwrap_or(DEFAULT_CAP);
        let info_url = size::info_url(&page.image_service);
        let Some(fetched) = fetch(
            client,
            &self.courtesy,
            profile,
            &info_url,
            ctx.attempt,
            stop,
        )
        .await?
        else {
            return Ok(None);
        };

        let token = match serde_json::from_slice::<serde_json::Value>(&fetched.bytes) {
            Ok(info) => size::from_info(&info, cap),
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
    last_page: u32,
    last_bytes: u64,
    size_token: &str,
    provider: &str,
    host: &str,
) -> String {
    let estimated = if done > 0 {
        bytes / u64::from(done) * u64::from(total)
    } else {
        0
    };
    serde_json::json!({
        "units": { "done": done, "total": total, "label": "items" },
        "bytes": { "downloaded": bytes, "estimated": estimated },
        "last": { "index": last_page, "bytes": last_bytes },
        "size": size_token,
        "provider": provider,
        "host": host,
    })
    .to_string()
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
fn page_asset_id(config: &DownloadConfig, target: Target, page: &Page) -> String {
    format!(
        "{}:{}:{}",
        config.version_id,
        target.cap(config),
        page.index
    )
}

/// Profilo del provider, o quello prudente per chi non è nel registro: nessuna
/// fonte resta senza politica (D18).
fn profile_for(provider_key: &str) -> NetworkProfile {
    crate::iiif::find_provider(provider_key)
        .map(|provider| provider.network)
        .unwrap_or(CAUTIOUS)
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

#[allow(clippy::too_many_arguments)]
async fn record_page(
    ctx: &JobContext,
    config: &DownloadConfig,
    target: Target,
    page: &Page,
    vault_path: &str,
    checksum: &str,
    byte_size: i64,
    url: &str,
) -> Result<(), JobError> {
    let id = page_asset_id(config, target, page);
    let version_id = config.version_id.clone();
    let kind = target.asset_kind();
    let size_tag = target.cap(config).to_string();
    let (index, label) = (page.index as i64, page.label.clone());
    let (vault_path, checksum, url) = (
        vault_path.to_string(),
        checksum.to_string(),
        url.to_string(),
    );

    ctx.with_database(move |conn| {
        conn.execute(
            "INSERT INTO assets (id, source_version_id, kind, locality, availability, vault_path, \
                 remote_url, byte_size, checksum, page_index, page_label, size_tag) \
             VALUES (?1, ?2, ?10, 'local', 'complete', ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
             ON CONFLICT(id) DO UPDATE SET vault_path = excluded.vault_path, \
               availability = 'complete', byte_size = excluded.byte_size, \
               checksum = excluded.checksum, updated_at = CURRENT_TIMESTAMP",
            params![
                id, version_id, vault_path, url, byte_size, checksum, index, label, size_tag, kind
            ],
        )
        .map_err(|error| format!("riga della carta: {error}"))?;
        Ok(())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}

/// Stima del tempo che manca (D17): si calcola dalla pausa dichiarata dal
/// profilo, non dalla velocità osservata negli ultimi secondi, che con pause di
/// 2,5–6 secondi oscilla troppo per essere utile.
fn estimated_seconds(remaining: u32, profile: &NetworkProfile) -> i64 {
    let per_page = profile.average_pause() + Duration::from_millis(500);
    (u64::from(remaining) * per_page.as_millis() as u64 / 1000) as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::iiif::network::GALLICA;

    #[test]
    fn an_unknown_provider_gets_the_cautious_profile() {
        // Le fonti aggiunte per indirizzo diretto non hanno voce nel registro.
        assert_eq!(profile_for("mai-vista"), CAUTIOUS);
    }

    #[test]
    fn a_known_provider_brings_its_own_profile() {
        assert_eq!(profile_for("gallica"), GALLICA);
    }

    #[test]
    fn the_estimate_grows_with_the_pages_left() {
        let quick = estimated_seconds(10, &CAUTIOUS);
        let long = estimated_seconds(210, &GALLICA);

        assert!(long > quick);
        // Con i valori di Gallica un manoscritto di 210 carte non scende sotto
        // il quarto d'ora: se la stima dicesse meno, mentirebbe.
        assert!(long >= 900, "stimati {long} secondi");
    }

    #[test]
    fn the_thumbnails_ask_the_descriptor_before_requesting() {
        // Il tetto delle miniature quasi mai coincide con una misura pronta:
        // chiederlo alla cieca fa generare l'immagine sul momento — misurato,
        // 23 secondi contro 1.
        assert!(Target::Thumbnails.ask_the_descriptor_first());
        // Per le carte il tetto è grande e la richiesta o è servita o dà
        // errore: leggere il descrittore prima costerebbe una richiesta per
        // niente.
        assert!(!Target::Pages.ask_the_descriptor_first());
    }

    #[test]
    fn a_thumbnail_declared_by_the_library_is_taken_as_it_is() {
        let page = Page {
            index: 1,
            label: None,
            image_service: "https://img/1".to_string(),
            size: Some((100, 200)),
            service_level: None,
            thumbnail: Some("https://img/1/full/160,/0/default.jpg".to_string()),
        };

        assert_eq!(
            Target::Thumbnails.declared_url(&page).as_deref(),
            Some("https://img/1/full/160,/0/default.jpg")
        );
        // La miniatura dichiarata è una miniatura: non è la carta.
        assert_eq!(Target::Pages.declared_url(&page), None);
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
        let detail = progress_detail(
            34,
            352,
            48_234_496,
            34,
            1_420_000,
            "1299,",
            "archive_org",
            "iiif.archive.org",
        );
        let parsed: serde_json::Value = serde_json::from_str(&detail).unwrap();

        assert_eq!(parsed["units"]["done"], 34);
        assert_eq!(parsed["units"]["total"], 352);
        assert_eq!(parsed["bytes"]["downloaded"], 48_234_496);
        // 48 MB per 34 carte, 352 carte in tutto: mezzo giga scarso.
        assert_eq!(parsed["bytes"]["estimated"], 48_234_496u64 / 34 * 352);
        assert_eq!(parsed["last"]["bytes"], 1_420_000);
        assert_eq!(parsed["size"], "1299,");
    }

    #[test]
    fn without_a_single_page_done_no_total_is_invented() {
        let detail = progress_detail(0, 352, 0, 0, 0, "2000,", "gallica", "gallica.bnf.fr");
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
