//! Il gestore dello scaricamento: il primo lavoro vero della coda.
//!
//! Dal manifesto alle carte sul disco. Salta ciò che è già valido, salva dove è
//! arrivato, si ferma al confine della carta quando glielo si chiede, e non fa
//! entrare nel deposito niente che non abbia superato la validazione: un file
//! parziale non esiste mai lì dentro (D16-bis).

use async_trait::async_trait;
use rusqlite::params;
use serde::Deserialize;
use std::path::{Path, PathBuf};
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
    /// Ultima carta completata: la ripresa riparte dalla successiva (D13).
    done: u32,
}

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
        let staging = root.join("staging").join(&config.version_id);
        std::fs::create_dir_all(&staging).map_err(|error| {
            JobError::new(ErrorKind::Storage, format!("area di transito: {error}"))
        })?;

        // 1. Il manifesto, conservato com'è (D2-bis).
        let manifest_path = promote_path(
            &root,
            layout::manifest_path(&config.provider_key, &config.version_id)
                .map_err(|error| JobError::new(ErrorKind::Internal, error))?,
        );
        let manifest_bytes = if is_valid(&manifest_path, integrity::FileKind::Manifest) {
            std::fs::read(&manifest_path)
                .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?
        } else {
            let fetched = fetch(&client, &self.courtesy, &profile, &config.manifest_url).await?;
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
        record_manifest(&ctx, &config, total, &manifest).await?;

        // 2. Le carte, una per volta: il confine dove ci si può fermare.
        let start = ctx
            .checkpoint
            .as_deref()
            .and_then(|saved| serde_json::from_str::<Checkpoint>(saved).ok())
            .map(|saved| saved.done)
            .unwrap_or(0);

        for page in manifest.pages.iter().skip(start as usize) {
            if ctx.cancel_requested() {
                return Ok(Outcome::Cancelled);
            }
            if ctx.pause_requested() {
                return Ok(Outcome::Paused);
            }

            self.fetch_page(&ctx, &client, &profile, &config, &root, &staging, page)
                .await?;

            let _ = ctx
                .save_checkpoint(
                    &serde_json::to_string(&Checkpoint { done: page.index })
                        .unwrap_or_else(|_| "{}".to_string()),
                )
                .await;
            let remaining = total.saturating_sub(page.index);
            ctx.report_progress(
                f64::from(page.index) / f64::from(total.max(1)),
                Some(&format!("{}/{}", page.index, total)),
                Some(estimated_seconds(remaining, &profile)),
            )
            .await;
        }

        // L'area di transito si scarta: quello che non è stato promosso non
        // serve a nessuno.
        let _ = std::fs::remove_dir_all(&staging);
        Ok(Outcome::Done)
    }
}

impl SourceDownloadJob {
    #[allow(clippy::too_many_arguments)]
    async fn fetch_page(
        &self,
        ctx: &JobContext,
        client: &reqwest::Client,
        profile: &NetworkProfile,
        config: &DownloadConfig,
        root: &Path,
        staging: &Path,
        page: &Page,
    ) -> Result<(), JobError> {
        let relative = layout::page_path(
            &config.provider_key,
            &config.version_id,
            &config.size_tag,
            page.index,
        )
        .map_err(|error| JobError::new(ErrorKind::Internal, error))?;
        let target = root.join(&relative);

        // Saltare ciò che è già valido è quello che rende una ripresa
        // sostenibile: con i limiti di Gallica, riscaricare tutto significa un
        // quarto d'ora buttato (D18).
        if is_valid(&target, integrity::FileKind::Image) {
            return Ok(());
        }

        let url = image_url(&page.image_service, &config.size_tag);
        let fetched = fetch(client, &self.courtesy, profile, &url).await?;
        // Se il turno è costato più di un secondo, il lavoro è rimasto fermo
        // per rispettare i limiti della biblioteca: va detto, perché è la
        // stessa immobilità di un errore con il significato opposto (D17).
        if fetched.waited > Duration::from_secs(1) {
            ctx.report_waiting("libraryLimits", Some(fetched.waited.as_secs() as i64))
                .await;
        }
        let checksum = stage_and_promote(
            &staging.join(format!("{:04}.jpg", page.index)),
            &target,
            &fetched.bytes,
            integrity::FileKind::Image,
        )?;

        record_page(
            ctx,
            config,
            page,
            &relative.to_string_lossy().replace('\\', "/"),
            &checksum,
            fetched.bytes.len() as i64,
            &url,
        )
        .await
    }
}

/// Profilo del provider, o quello prudente per chi non è nel registro: nessuna
/// fonte resta senza politica (D18).
fn profile_for(provider_key: &str) -> NetworkProfile {
    crate::iiif::find_provider(provider_key)
        .map(|provider| provider.network)
        .unwrap_or(CAUTIOUS)
}

fn promote_path(root: &Path, relative: PathBuf) -> PathBuf {
    root.join(relative)
}

fn is_valid(path: &Path, kind: integrity::FileKind) -> bool {
    matches!(
        integrity::scan_file(path, kind).validation,
        integrity::Validation::Valid
    )
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
    if let Some(parent) = staged.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;
    }
    std::fs::write(staged, bytes)
        .map_err(|error| JobError::new(ErrorKind::Storage, error.to_string()))?;

    let scan = integrity::scan_file(staged, kind);
    match scan.validation {
        integrity::Validation::Valid => {}
        integrity::Validation::Corrupt(reason) => {
            let _ = std::fs::remove_file(staged);
            // Un file troncato ha la dimensione dichiarata dai metadati HTTP:
            // è il caso reale che un controllo di dimensione non vede.
            return Err(JobError::new(ErrorKind::Transport, reason));
        }
        integrity::Validation::Missing => {
            return Err(JobError::new(
                ErrorKind::Storage,
                "il file appena scritto non esiste".to_string(),
            ))
        }
    }

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
    let id = format!("{}:{}:{}", config.version_id, config.size_tag, page.index);
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
        let url = super::image_url("https://img/1", "2000");

        assert!(relative.to_string_lossy().contains("2000"));
        assert!(url.contains("/full/2000,/"));
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
