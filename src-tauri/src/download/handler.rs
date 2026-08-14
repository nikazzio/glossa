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
use super::fetch::{build_client, fetch};
use super::manifest::{image_url, parse, Page};

pub const JOB_TYPE: &str = "source_download";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadConfig {
    /// Chiave del registro dei provider: porta con sé il profilo di rete (D18).
    pub provider_key: String,
    /// Identificativo interno della digitalizzazione, che nomina la cartella.
    pub version_id: String,
    pub manifest_url: String,
    /// Etichetta della risoluzione: `max`, oppure il lato lungo in pixel.
    /// Nomina la cartella **e** il parametro chiesto al servizio, così ciò che
    /// si chiede e ciò che si salva non possono divergere (D4).
    #[serde(default = "default_size_tag")]
    pub size_tag: String,
}

fn default_size_tag() -> String {
    "2000".to_string()
}

#[derive(Debug, Default, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    /// **Quante** carte del manifesto sono state fatte, non il numero dell'ultima:
    /// la ripresa salta esattamente quelle, e i due valori divergono appena un
    /// canvas del manifesto non è scaricabile (D13).
    done: u32,
}

/// Oltre questa attesa il lavoro dichiara che è fermo per i limiti della
/// biblioteca (D17). Più lunga della pausa massima fra due richieste (6 s su
/// Gallica) e molto più corta del raffreddamento più breve (120 s): così la
/// pausa normale non fa lampeggiare la riga, e un raffreddamento sì.
const DECLARE_WAIT_AFTER: Duration = Duration::from_secs(15);

pub struct SourceDownloadJob {
    courtesy: Courtesy,
}

impl SourceDownloadJob {
    pub fn new() -> Self {
        Self {
            courtesy: Courtesy::new(),
        }
    }
}

impl Default for SourceDownloadJob {
    fn default() -> Self {
        Self::new()
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
        let staging = root.join(layout::STAGING_DIR).join(
            layout::safe_component(&config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;

        // 1. Il manifesto, conservato com'è (D2-bis).
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
        let mut done = start;
        // Quanto pesa già sul disco: serve al messaggio del pannello, e leggerlo
        // una volta sola evita una somma per ogni carta.
        let mut bytes = recorded_bytes(&ctx, &config.version_id).await;

        for page in manifest.pages.iter().skip(start as usize) {
            // Il confine dell'unità di lavoro: qui ci si ferma, mai a metà
            // pagina (D14, D15).
            if stop() {
                return Ok(stopped_outcome(&ctx, &staging));
            }

            let label = progress_message(&title, done, total, bytes);
            let eta = estimated_seconds(total.saturating_sub(done), &profile);
            let progress = f64::from(done) / f64::from(total.max(1));
            let fetched = self
                .fetch_page_declaring_long_waits(
                    &ctx, &client, &profile, &config, &manifest, &root, &staging, page, progress,
                    &label, eta, &stop,
                )
                .await
                .inspect_err(|_| discard(&staging))?;
            let Some(added) = fetched else {
                return Ok(stopped_outcome(&ctx, &staging));
            };

            done += 1;
            bytes += added;
            ctx.save_checkpoint(&serde_json::json!(Checkpoint { done }).to_string())
                .await
                // Senza il punto salvato la ripresa ripartirebbe da più indietro:
                // non è fatale, ma non deve sparire in silenzio.
                .unwrap_or_else(|error| log::warn!("job {}: punto non salvato: {error}", ctx.id));

            ctx.report_progress(
                f64::from(done) / f64::from(total.max(1)),
                Some(&progress_message(&title, done, total, bytes)),
                Some(estimated_seconds(total.saturating_sub(done), &profile)),
            )
            .await;
        }

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
        root: &Path,
        staging: &Path,
        page: &Page,
        progress: f64,
        label: &str,
        eta: i64,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<u64>, JobError> {
        let work = self.fetch_page(
            ctx, client, profile, config, manifest, root, staging, page, stop,
        );
        tokio::pin!(work);

        tokio::select! {
            outcome = &mut work => outcome,
            _ = tokio::time::sleep(DECLARE_WAIT_AFTER) => {
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
        root: &Path,
        staging: &Path,
        page: &Page,
        stop: &(dyn Fn() -> bool + Sync),
    ) -> Result<Option<u64>, JobError> {
        let relative = layout::page_path(
            &config.provider_key,
            &config.version_id,
            &config.size_tag,
            page.index,
        )
        .map_err(|error| JobError::new(ErrorKind::Internal, error))?;
        let target = root.join(&relative);
        let vault_path = relative.to_string_lossy().replace('\\', "/");
        let url = image_url(&page.image_service, &manifest.size_token(&config.size_tag));

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
            if is_recorded(ctx, &page_asset_id(config, page)).await {
                return Ok(Some(0));
            }
            let scan = integrity::scan_file(&target, integrity::FileKind::Image);
            let size = std::fs::metadata(&target)
                .map(|meta| meta.len())
                .unwrap_or(0);
            let checksum = scan.checksum.unwrap_or_default();
            record_page(ctx, config, page, &vault_path, &checksum, size as i64, &url).await?;
            return Ok(Some(size));
        }

        let Some(fetched) = fetch(client, &self.courtesy, profile, &url, ctx.attempt, stop).await?
        else {
            return Ok(None);
        };
        let checksum = stage_and_promote(
            &staging.join(format!("{:04}.jpg", page.index)),
            &target,
            &fetched.bytes,
            integrity::FileKind::Image,
        )?;

        let size = fetched.bytes.len() as u64;
        record_page(ctx, config, page, &vault_path, &checksum, size as i64, &url).await?;
        Ok(Some(size))
    }
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
            log::warn!("transito non ripulito ({}): {error}", staging.display());
        }
    }
}

/// La riga del pannello (D20): nome dell'opera, a che punto è, quanto pesa.
/// La forma la decide il tipo di lavoro — questo è quella dello scaricamento.
fn progress_message(title: &str, done: u32, total: u32, bytes: u64) -> String {
    format!("{title} · {done}/{total} · {}", human_size(bytes))
}

/// Dimensione leggibile. Le carte di un manoscritto stanno fra i decimi di
/// megabyte e la decina: sotto il megabyte si scrive in kB, sopra in MB.
fn human_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;
    match bytes {
        0..=KB => format!("{bytes} B"),
        b if b < MB => format!("{} kB", b / KB),
        b if b < GB => format!("{} MB", b / MB),
        b => format!("{:.1} GB", b as f64 / GB as f64),
    }
}

/// Quanto pesa già nel deposito questa digitalizzazione.
async fn recorded_bytes(ctx: &JobContext, version_id: &str) -> u64 {
    let version_id = version_id.to_string();
    ctx.with_database(move |conn| {
        conn.query_row(
            "SELECT COALESCE(SUM(byte_size), 0) FROM assets \
             WHERE source_version_id = ?1 AND kind = 'image'",
            rusqlite::params![version_id],
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

async fn record_page(
    ctx: &JobContext,
    config: &DownloadConfig,
    page: &Page,
    vault_path: &str,
    checksum: &str,
    byte_size: i64,
    url: &str,
) -> Result<(), JobError> {
    let id = page_asset_id(config, page);
    let version_id = config.version_id.clone();
    let size_tag = config.size_tag.clone();
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
             VALUES (?1, ?2, 'image', 'local', 'complete', ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
             ON CONFLICT(id) DO UPDATE SET vault_path = excluded.vault_path, \
               availability = 'complete', byte_size = excluded.byte_size, \
               checksum = excluded.checksum, updated_at = CURRENT_TIMESTAMP",
            params![id, version_id, vault_path, url, byte_size, checksum, index, label, size_tag],
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
    fn the_size_asked_and_the_folder_written_cannot_diverge() {
        // La stessa etichetta nomina la cartella e il parametro chiesto al
        // servizio: se fossero due valori distinti, prima o poi salverebbero
        // una risoluzione dentro la cartella di un'altra (D4).
        let relative = crate::vault::layout::page_path("gallica", "v1", "2000", 7).unwrap();
        let manifest = super::super::manifest::parse(
            br#"{"items":[{"items":[{"items":[{"body":{"service":[{"id":"https://img/1"}]}}]}]}]}"#,
        )
        .unwrap();
        let url = super::image_url("https://img/1", &manifest.size_token("2000"));

        assert!(relative.to_string_lossy().contains("2000"));
        assert!(url.contains("/full/2000,/"));
    }

    #[test]
    fn the_panel_line_says_which_work_where_it_is_and_how_much_it_weighs() {
        // In coda il pannello mostrava «source download»: il nome dell'opera
        // c'è dalla messa in coda, e i numeri arrivano appena si sa quanti sono.
        assert_eq!(
            progress_message("Beatus di Girona", 34, 210, 48_234_496),
            "Beatus di Girona · 34/210 · 46 MB"
        );
    }

    #[test]
    fn sizes_are_written_in_the_unit_that_fits() {
        assert_eq!(human_size(0), "0 B");
        assert_eq!(human_size(900), "900 B");
        assert_eq!(human_size(20_480), "20 kB");
        assert_eq!(human_size(5 * 1024 * 1024), "5 MB");
        assert_eq!(human_size(3 * 1024 * 1024 * 1024), "3.0 GB");
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
