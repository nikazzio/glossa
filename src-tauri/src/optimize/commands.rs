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
    /// La cartella su cui si lavora: è la metà «da quale misura» che la conferma
    /// deve dichiarare.
    pub size_tag: String,
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

/// Cosa c'è in ballo, prima di chiedere conferma: quante pagine ci sono, quante
/// verrebbero davvero ridotte, quanto occupano adesso e quanto si prevede di
/// liberare.
///
/// Gira su un **filo di lavoro**: apre l'intestazione di ogni pagina della
/// cartella, e su 900 pagine — o su un deposito di rete — sul filo
/// dell'interfaccia bloccherebbe la finestra prima che la conferma compaia.
#[tauri::command]
pub async fn optimize_estimate(
    app: tauri::AppHandle,
    version_id: String,
    size_tag: String,
) -> Result<OptimizeEstimate, String> {
    let root = crate::vault::commands::root_of(&app)?;
    let db_path = crate::storage_config::db_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let entry = inventory::of_version(&root, &version_id)
            .ok_or_else(|| "Questa opera non ha pagine nel deposito.".to_string())?;
        let found = entry
            .sizes
            .iter()
            .find(|size| size.size_tag == size_tag)
            .ok_or_else(|| "Questa misura non è nel deposito.".to_string())?;
        let conn = crate::db::open_connection(&db_path)?;
        let (long_edge, _) = configured(&conn);
        let size_dir = root
            .join(crate::vault::layout::pages_dir(
                &entry.provider_key,
                &version_id,
            )?)
            .join(crate::vault::layout::safe_component(&size_tag)?);
        let (shrinking, freeing) = super::forecast(&size_dir, long_edge);
        Ok(OptimizeEstimate {
            size_tag,
            pages: found.pages,
            shrinking,
            bytes: found.bytes,
            freeing,
            long_edge,
        })
    })
    .await
    .map_err(|error| format!("previsione non riuscita: {error}"))?
}

/// Rifiuta se uno scaricamento di quest'opera non è ancora finito.
///
/// I due lavori scriverebbero nella stessa cartella e aggiungerebbero righe allo
/// stesso `pages.jsonl`: se l'ottimizzazione sostituisce una pagina fra la
/// promozione di quella pagina e la scrittura della sua riga, a vincere resta la
/// riga dello scaricamento, con l'impronta di byte che non esistono più — e la
/// verifica completa dichiara corrotta una pagina integra.
///
/// Non si usa la dipendenza fra lavori perché si sblocca solo su un lavoro
/// **completato**: con uno scaricamento in pausa l'ottimizzazione resterebbe in
/// coda per sempre, senza dirlo a nessuno.
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
    if !inventory.sizes.iter().any(|size| size.size_tag == size_tag) {
        return Err("Questa misura non è nel deposito.".to_string());
    }
    let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
    let (default_edge, default_quality) = configured(&conn);
    let thumbnail_edge = crate::download::thumbnail_edge(&conn)?;
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
            // Il titolo dell'opera nella riga del lavoro **già in coda**: senza,
            // il pannello mostrerebbe «Ottimizzazione delle immagini» per ogni
            // libro, che è il difetto che D20 nomina. La scrittura
            // dell'avanzamento lo conserva, quindi si scrive una volta sola.
            message: title,
        })
        .await
        .map_err(|error| error.to_string())
}
