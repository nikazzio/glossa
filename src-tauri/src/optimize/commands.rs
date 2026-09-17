//! Mettere in coda l'ottimizzazione.

use tauri::Manager;

use crate::download::inventory;
use crate::jobs::commands::JobsState;
use crate::jobs::store::NewJob;
use crate::jobs::JobRecord;

use super::{
    DEFAULT_LONG_EDGE, DEFAULT_QUALITY, JOB_TYPE, MAX_LONG_EDGE, MAX_QUALITY, MIN_LONG_EDGE,
    MIN_QUALITY,
};

/// Priorità sotto lo scaricamento: chi aspetta un libro aspetta la rete, non il
/// processore.
const PRIORITY: i64 = 5;

pub const LONG_EDGE_SETTING: &str = "optimize_long_edge";
pub const QUALITY_SETTING: &str = "optimize_jpeg_quality";

fn setting(conn: &rusqlite::Connection, key: &str) -> Option<u64> {
    crate::jobs::store::read_setting(conn, key)
        .ok()
        .flatten()
        .and_then(|value| value.trim().parse::<u64>().ok())
}

/// I predefiniti configurati, riportati dentro gli estremi accettati.
///
/// La conversione è **controllata**: troncare prima di guardare gli estremi
/// faceva passare una qualità 300 come 44, cioè un valore fuori scala che
/// diventava valido cambiando significato.
pub fn configured(conn: &rusqlite::Connection) -> (u32, u8) {
    let long_edge = setting(conn, LONG_EDGE_SETTING)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| (MIN_LONG_EDGE..=MAX_LONG_EDGE).contains(value))
        .unwrap_or(DEFAULT_LONG_EDGE);
    let quality = setting(conn, QUALITY_SETTING)
        .and_then(|value| u8::try_from(value).ok())
        .filter(|value| (MIN_QUALITY..=MAX_QUALITY).contains(value))
        .unwrap_or(DEFAULT_QUALITY);
    (long_edge, quality)
}

/// Evita scritture concorrenti nella stessa cartella di misura.
fn refuse_while_downloading(app: &tauri::AppHandle, version_id: &str) -> Result<(), String> {
    let conn = crate::db::open_connection(&crate::storage_config::db_path(app)?)?;
    let downloading = crate::jobs::store::get(&conn, &crate::download::job_id(version_id))?
        .is_some_and(|job| !job.status.is_terminal());
    if downloading {
        return Err("download_in_corso".to_string());
    }
    Ok(())
}

/// Mette in coda l'ottimizzazione di **una cartella di misura**.
///
/// Un lavoro per cartella: l'identificativo lo dice, quindi chiederla due volte
/// non ne apre due.
/// Mette in coda la **ricompressione sul posto** delle pagine di una copia.
///
/// I pixel non si toccano: si riscrive ogni pagina a una qualità più bassa per
/// liberare spazio. L'operazione non è reversibile — l'originale non resta da
/// nessuna parte — e per riavere la qualità di prima si riscarica dalla
/// biblioteca. Di una copia si tiene un file per pagina, e questo comando
/// rispetta quella regola invece di creare un secondo libro.
#[tauri::command]
pub async fn enqueue_optimization(
    app: tauri::AppHandle,
    version_id: String,
    size_tag: String,
    quality: Option<u8>,
) -> Result<JobRecord, String> {
    let root = crate::vault::commands::root_of(&app)?;
    let inventory = inventory::of_version(&root, &version_id)
        .ok_or_else(|| "Questa opera non ha pagine nel deposito.".to_string())?;
    refuse_while_downloading(&app, &version_id)?;
    inventory
        .sizes
        .iter()
        .find(|size| size.size_tag == size_tag)
        .ok_or_else(|| "Questa misura non è nel deposito.".to_string())?;
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    let (_, default_quality) = configured(&conn);
    let title = conn
        .query_row(
            "SELECT s.title FROM sources s \
             JOIN source_versions v ON v.source_id = s.id WHERE v.id = ?1",
            rusqlite::params![&version_id],
            |row| row.get::<_, String>(0),
        )
        .ok();
    drop(conn);

    let config = serde_json::json!({
        "providerKey": inventory.provider_key,
        "versionId": version_id,
        "sourceSizeTag": size_tag,
        "quality": quality.unwrap_or(default_quality).clamp(MIN_QUALITY, MAX_QUALITY),
    })
    .to_string();

    let jobs = app.state::<JobsState>();
    let id = format!("optimize:{version_id}:{size_tag}");

    // Un tentativo precedente sulla stessa copia ha lasciato la sua riga in
    // elenco, anche se è fallito: un lavoro in corso si ritrova, uno finito si
    // rilancia da capo con la qualità appena chiesta.
    {
        let conn = jobs.0.connection()?;
        let existing = crate::jobs::store::get(&conn, &id)?;
        drop(conn);
        if let Some(job) = existing {
            if !job.status.is_terminal() {
                return Ok(job);
            }
            jobs.0.relaunch_with_config(&id, &config).await?;
            let conn = jobs.0.connection()?;
            return crate::jobs::store::get(&conn, &id)?
                .ok_or_else(|| "il lavoro è sparito subito dopo essere stato ripreso".to_string());
        }
    }

    jobs.0
        .submit(&NewJob {
            id,
            job_type: JOB_TYPE.to_string(),
            priority: PRIORITY,
            config,
            max_attempts: 1,
            depends_on_job_id: None,
            workspace_id: None,
            // Identifica l'opera nel pannello dei lavori.
            message: title,
        })
        .await
        .map_err(|error| error.to_string())
}
