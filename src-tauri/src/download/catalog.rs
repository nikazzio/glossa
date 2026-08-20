//! Le poche cose che restano nel database dopo il §5.4: conteggio atteso,
//! licenza, attribuzione, titolo dell'opera e profilo di rete. Tutto il resto lo
//! dice la cartella — dove sta il manifesto compreso.

use rusqlite::params;

use crate::iiif::network::{NetworkProfile, CAUTIOUS};
use crate::jobs::engine::JobContext;
use crate::jobs::{ErrorKind, JobError};

use super::fetch::host_of;
use super::handler::DownloadConfig;
use super::manifest::Manifest;

/// Profilo di rete in vigore per questa biblioteca, riletto all'avvio del
/// lavoro e non alla messa in coda: un lavoro ripreso dopo giorni deve
/// rispettare i limiti di adesso.
pub(crate) async fn profile_for(ctx: &JobContext, config: &DownloadConfig) -> NetworkProfile {
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
        // Database non raggiungibile: si scarica al ritmo più prudente che
        // conosciamo, non a quello che capita.
        log::warn!("job profile not read id={} error={error}", ctx.id);
        CAUTIOUS
    })
}

/// Il titolo va nel messaggio del lavoro: nel pannello si legge quello, e
/// «207/362» da solo non dice quale libro sta scaricando.
pub(crate) async fn source_title(ctx: &JobContext, version_id: &str) -> Option<String> {
    let version_id = version_id.to_string();
    ctx.with_database(move |conn| {
        Ok(conn
            .query_row(
                "SELECT s.title FROM sources s \
                 JOIN source_versions v ON v.source_id = s.id WHERE v.id = ?1",
                params![version_id],
                |row| row.get::<_, String>(0),
            )
            .ok())
    })
    .await
    .ok()
    .flatten()
}

/// Conteggio atteso, licenza e attribuzione: le cose che si leggono dal manifesto
/// e non si ricavano da una cartella.
///
/// Il conteggio atteso è l'unica cosa che dice quante pagine *dovrebbero*
/// esserci. Dove sta il file del manifesto non si registra: lo dice la
/// disposizione delle cartelle, e l'inventario risponde già a «c'è o no».
pub(crate) async fn record_manifest(
    ctx: &JobContext,
    config: &DownloadConfig,
    total: u32,
    manifest: &Manifest,
) -> Result<(), JobError> {
    let homepage = manifest.homepage.clone();
    let version_id = config.version_id.clone();
    let rights = manifest.rights.clone();
    let attribution = manifest.attribution.clone();

    ctx.with_database(move |conn| {
        conn.execute(
            "UPDATE source_versions SET expected_asset_count = ?2, homepage_url = COALESCE(?3, homepage_url) \
             WHERE id = ?1",
            params![version_id, total as i64, homepage],
        )
        .map_err(|error| format!("conteggio pagine: {error}"))?;

        // Licenza e attribuzione si aggiungono ai metadati del catalogo invece
        // di sostituirli.
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
        Ok(())
    })
    .await
    .map_err(|error| JobError::new(ErrorKind::Storage, error))
}
