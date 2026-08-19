//! Mettere in coda l'ottimizzazione, e sapere prima quanto costa.

use serde::Serialize;
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

/// Cosa succederebbe lanciandola: serve alla conferma, che deve dichiarare
/// quante pagine tocca e da quale misura a quale (§5.7).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeEstimate {
    /// Pagine nella cartella di misura.
    pub pages: u32,
    /// Quante di quelle verrebbero davvero ridotte: le altre sono già dentro il
    /// lato lungo scelto e non si toccano.
    pub shrinking: u32,
    /// Quanto occupa adesso quella cartella.
    pub bytes: u64,
    /// Quanto si prevede di liberare. È una previsione: i byte di un JPEG non
    /// scendono esattamente come i pixel, e il rapporto delle aree è la
    /// approssimazione più onesta che si può fare senza ricomprimere davvero.
    pub freeing: u64,
    /// Il lato lungo di arrivo che verrebbe usato.
    pub long_edge: u32,
    pub quality: u8,
}

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

/// Quante pagine e quanto spazio ci sono in ballo, prima di chiedere conferma
/// (§5.7: la conferma dichiara quante pagine, da quale misura a quale, e quanto
/// si prevede di liberare).
#[tauri::command]
pub fn optimize_estimate(
    app: tauri::AppHandle,
    version_id: String,
    size_tag: String,
) -> Result<OptimizeEstimate, String> {
    let root = crate::vault::commands::root_of(&app)?;
    let entry = inventory::of_version(&root, &version_id)
        .ok_or_else(|| "Questa opera non ha pagine nel deposito.".to_string())?;
    let found = entry
        .sizes
        .iter()
        .find(|size| size.size_tag == size_tag)
        .ok_or_else(|| "Questa misura non è nel deposito.".to_string())?;
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    let (long_edge, quality) = configured(&conn);
    let size_dir = root
        .join(crate::vault::layout::pages_dir(
            &entry.provider_key,
            &version_id,
        )?)
        .join(crate::vault::layout::safe_component(&size_tag)?);
    let (shrinking, freeing) = super::forecast(&size_dir, long_edge);
    Ok(OptimizeEstimate {
        pages: found.pages,
        shrinking,
        bytes: found.bytes,
        freeing,
        long_edge,
        quality,
    })
}

/// Mette in coda l'ottimizzazione di **una cartella di misura**.
///
/// Un lavoro per cartella: l'identificativo lo dice, quindi chiederla due volte
/// non ne apre due.
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
    if !inventory.sizes.iter().any(|size| size.size_tag == size_tag) {
        return Err("Questa misura non è nel deposito.".to_string());
    }
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    let (default_edge, default_quality) = configured(&conn);
    let thumbnail_edge = crate::download::thumbnail_edge(&conn)?;
    drop(conn);

    let config = serde_json::json!({
        "providerKey": inventory.provider_key,
        "versionId": version_id,
        "sizeTag": size_tag,
        "longEdge": long_edge.unwrap_or(default_edge).clamp(MIN_LONG_EDGE, MAX_LONG_EDGE),
        "quality": quality.unwrap_or(default_quality).clamp(MIN_QUALITY, MAX_QUALITY),
        // Le miniature si rifanno, e vanno della misura scelta nelle
        // impostazioni: la stessa che usa lo scaricamento.
        "thumbnailEdge": thumbnail_edge,
    })
    .to_string();

    let jobs = app.state::<JobsState>();
    jobs.0
        .submit(&NewJob {
            id: format!("optimize:{version_id}:{size_tag}"),
            job_type: JOB_TYPE.to_string(),
            priority: PRIORITY,
            config,
            max_attempts: 1,
            depends_on_job_id: None,
            workspace_id: None,
            message: None,
        })
        .await
        .map_err(|error| error.to_string())
}
