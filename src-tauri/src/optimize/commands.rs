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
/// Mette in coda la creazione di **una nuova copia**, ricavata da una misura
/// già scaricata, mai al suo posto: `size_tag` è la fonte, il lato lungo
/// chiesto diventa il nome della cartella d'arrivo. Se quella cartella esiste
/// già — scaricata o ricavata in un giro precedente — il comando si rifiuta:
/// tocca a chi chiede scegliere un'altra misura o liberare prima quella.
#[tauri::command]
pub async fn enqueue_optimization(
    app: tauri::AppHandle,
    version_id: String,
    size_tag: String,
    long_edge: Option<u32>,
    quality: Option<u8>,
) -> Result<JobRecord, String> {
    let root = crate::vault::commands::root_of(&app)?;
    let inventory = inventory::of_version(&root, &version_id)
        .ok_or_else(|| "Questa opera non ha pagine nel deposito.".to_string())?;
    refuse_while_downloading(&app, &version_id)?;
    let source = inventory
        .sizes
        .iter()
        .find(|size| size.size_tag == size_tag)
        .ok_or_else(|| "Questa misura non è nel deposito.".to_string())?;
    if source.derived {
        return Err("Una copia già ricavata in locale non si ricomprime di nuovo.".to_string());
    }
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    let (default_edge, default_quality) = configured(&conn);
    let long_edge = long_edge
        .unwrap_or(default_edge)
        .clamp(MIN_LONG_EDGE, MAX_LONG_EDGE);
    let target_tag = long_edge.to_string();
    if inventory
        .sizes
        .iter()
        .any(|size| size.size_tag == target_tag)
    {
        return Err("Questa misura esiste già per quest'opera.".to_string());
    }
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
        "targetSizeTag": target_tag,
        "longEdge": long_edge,
        "quality": quality.unwrap_or(default_quality).clamp(MIN_QUALITY, MAX_QUALITY),
    })
    .to_string();

    let jobs = app.state::<JobsState>();
    let id = format!("optimize:{version_id}:{target_tag}");

    // Un tentativo precedente per la stessa misura ha lasciato la sua riga in
    // elenco, anche se è fallito. Riproporlo come lavoro nuovo urtava contro
    // l'identificativo già in uso e l'errore arrivava a schermo così com'era:
    // un lavoro già in corso si ritrova, uno finito si rilancia da capo con la
    // qualità e il lato lungo appena chiesti.
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
