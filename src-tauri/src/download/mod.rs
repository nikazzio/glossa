//! Lo scaricamento delle fonti: il primo gestore di lavoro vero (#218, PR 4).
//!
//! Dal manifesto alle carte sul disco, rispettando i limiti della biblioteca
//! (D18), saltando ciò che è già valido, salvando dove si è arrivati e senza
//! far entrare nel deposito niente che non sia stato validato (D16-bis).

pub mod courtesy;
pub mod fetch;
pub mod handler;
pub mod manifest;
pub mod size;

use crate::jobs::commands::JobsState;
use crate::jobs::store::NewJob;
use crate::jobs::JobRecord;

/// Prefisso dell'identificativo del lavoro: **uno per digitalizzazione**.
const JOB_ID_PREFIX: &str = "download";

/// È ciò che l'utente ha appena chiesto guardando lo schermo: la coda lo
/// preferisce alle verifiche di fondo.
const DOWNLOAD_PRIORITY: i64 = 10;

pub const THUMBNAIL_EDGE_SETTING: &str = "thumbnail_long_edge";

/// Estremi entro cui una miniatura resta una miniatura: sotto i 100 pixel non
/// si riconosce una carta, sopra gli 800 non è più una miniatura ma una
/// seconda copia del libro.
pub const MIN_THUMBNAIL_EDGE: u32 = 100;
pub const MAX_THUMBNAIL_EDGE: u32 = 800;

/// Mette in coda lo scaricamento di una digitalizzazione: le carte, e da
/// ognuna la sua miniatura.
///
/// L'interfaccia non scarica niente: chiede un lavoro e poi osserva (D10). La
/// priorità è alta perché è ciò che l'utente ha appena chiesto guardando lo
/// schermo, e la coda deve preferirlo alle verifiche di fondo.
///
/// **Un lavoro solo, non due** *(D6, corretta il 2026-08-16)*: le miniature non
/// si chiedono più alla biblioteca, si ricavano dalla carta appena scaricata.
/// Ogni libro costava due richieste per carta a servizi che rispondono fra 1 e
/// 19 secondi; adesso ne costa una, e la miniatura qualche decina di
/// millisecondi di processore.
#[tauri::command]
pub async fn enqueue_source_download(
    jobs: tauri::State<'_, JobsState>,
    provider_key: String,
    manifest_url: String,
    version_id: Option<String>,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    enqueue(&jobs, provider_key, manifest_url, version_id, size_tag).await
}

async fn enqueue(
    jobs: &tauri::State<'_, JobsState>,
    provider_key: String,
    manifest_url: String,
    version_id: Option<String>,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    let conn = jobs.0.connection()?;

    // Tentativi e attese sono del profilo della biblioteca, non costanti nostre
    // (D16, D18): Gallica ne concede tre, le altre cinque. Il profilo è quello
    // **in vigore**, cioè con dentro le modifiche dell'utente (#421).
    let profile = crate::iiif::settings::effective_profile(
        &conn,
        &provider_key,
        crate::download::fetch::host_of(&manifest_url)
            .ok()
            .as_deref(),
    );

    // La digitalizzazione si può indicare per identificativo o lasciar
    // ritrovare dall'indirizzo del manifesto, che è l'unica cosa che l'utente
    // ha davvero in mano quando aggiunge una fonte alla Biblioteca.
    let version_id = match version_id {
        Some(id) => id,
        None => conn
            .query_row(
                "SELECT id FROM source_versions WHERE source_url = ?1 ORDER BY created_at LIMIT 1",
                rusqlite::params![manifest_url],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| {
                format!("nessuna fonte in Biblioteca con questo manifesto: {manifest_url}")
            })?,
    };

    // Il tetto lo decide la fonte, poi la biblioteca, poi l'impostazione
    // generale (D4). Un valore chiesto esplicitamente — «scarica questa alla
    // massima risoluzione» — passa davanti a tutti, ma deve comunque essere un
    // tetto che significa qualcosa.
    let size_tag = match size_tag
        .as_deref()
        .and_then(crate::iiif::settings::normalise_cap)
    {
        Some(explicit) => explicit,
        None => crate::iiif::settings::effective_size_cap(&conn, &version_id)?,
    };

    // Il lato lungo delle miniature: adesso che le ricaviamo noi è una misura
    // che decidiamo davvero, e non più quella che la biblioteca dava per
    // ripiego. Si legge alla messa in coda, come il tetto.
    let thumbnail_edge = thumbnail_edge(&conn)?;

    // Il nome dell'opera si scrive già adesso: in coda il pannello mostra
    // questo, e «Scaricamento» da solo non dice quale libro (D20).
    let title: Option<String> = conn
        .query_row(
            "SELECT s.title FROM sources s \
             JOIN source_versions v ON v.source_id = s.id WHERE v.id = ?1",
            rusqlite::params![version_id],
            |row| row.get::<_, String>(0),
        )
        .ok();

    // Un lavoro per digitalizzazione. Chiederlo due volte non ne apre due e
    // non è un errore: si ritrova quello che c'è già, che è quello che l'utente
    // voleva vedere.
    let id = format!("{JOB_ID_PREFIX}:{version_id}");
    let existing = crate::jobs::store::get(&conn, &id)?;
    drop(conn);

    if let Some(job) = existing {
        if !job.status.is_terminal() {
            return Ok(job);
        }
        // Un lavoro finito che si rilancia riparte **da capo**: il punto
        // salvato parla di carte che nel frattempo possono essere state
        // cancellate per liberare spazio (D6), e riprendendo da lì non
        // tornerebbero mai più. Le carte ancora sul disco costano un controllo
        // a testa e vengono saltate lo stesso.
        jobs.0.retry(&id, true).await?;
        let conn = jobs.0.connection()?;
        return crate::jobs::store::get(&conn, &id)?
            .ok_or_else(|| "il lavoro è sparito subito dopo essere stato ripreso".to_string());
    }

    let config = serde_json::json!({
        "providerKey": provider_key,
        "versionId": version_id,
        "manifestUrl": manifest_url,
        "sizeTag": size_tag,
        "thumbnailEdge": thumbnail_edge,
    });

    jobs.0
        .submit(&NewJob {
            id,
            job_type: handler::JOB_TYPE.to_string(),
            priority: DOWNLOAD_PRIORITY,
            config: config.to_string(),
            max_attempts: profile.max_attempts,
            depends_on_job_id: None,
            workspace_id: None,
            message: title,
        })
        .await
}

/// Il lato lungo delle miniature, come lo dice l'impostazione. Un valore
/// illeggibile o fuori scala non ferma lo scaricamento: si torna al
/// predefinito, che è una misura che funziona sempre.
fn thumbnail_edge(conn: &rusqlite::Connection) -> Result<u32, String> {
    let configured = crate::jobs::store::read_setting(conn, THUMBNAIL_EDGE_SETTING)?
        .and_then(|value| value.trim().parse::<u32>().ok())
        .filter(|edge| (MIN_THUMBNAIL_EDGE..=MAX_THUMBNAIL_EDGE).contains(edge));
    Ok(configured.unwrap_or(crate::images::DEFAULT_THUMBNAIL_EDGE))
}
