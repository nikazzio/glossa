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

/// Mette in coda lo scaricamento di una digitalizzazione: le carte **e le sue
/// miniature**.
///
/// L'interfaccia non scarica niente: chiede un lavoro e poi osserva (D10). La
/// priorità è alta perché è ciò che l'utente ha appena chiesto guardando lo
/// schermo, e la coda deve preferirlo alle verifiche di fondo.
///
/// Le miniature vanno **qui e non all'aggiunta della fonte** *(D6, corretta il
/// 2026-08-15)*: la stima di «3 MB, trascurabili» era su duecento carte, e su un
/// libro di novecento diventa un quarto d'ora di rete per qualcosa che serve
/// solo a chi lavora offline. Finché il libro non si scarica, le miniature si
/// leggono online come le carte. Sono un lavoro a parte, con priorità più
/// bassa: si possono fermare senza fermare il libro, e non rallentano le carte.
#[tauri::command]
pub async fn enqueue_source_download(
    jobs: tauri::State<'_, JobsState>,
    provider_key: String,
    manifest_url: String,
    version_id: Option<String>,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    let pages = enqueue(
        &jobs,
        handler::JOB_TYPE,
        "download",
        10,
        provider_key.clone(),
        manifest_url.clone(),
        version_id.clone(),
        size_tag,
    )
    .await?;

    // Le miniature seguono le carte. Se non si riesce a metterle in coda, il
    // libro si scarica lo stesso: si dice e si va avanti.
    if let Err(error) = enqueue(
        &jobs,
        handler::THUMBNAILS_JOB_TYPE,
        "thumbnails",
        1,
        provider_key,
        manifest_url,
        version_id,
        None,
    )
    .await
    {
        log::warn!("job thumbnails not queued error={error}");
    }

    Ok(pages)
}

/// La messa in coda, uguale per carte e miniature: cambiano il tipo di lavoro,
/// la priorità e il prefisso dell'identificativo, che tiene separati i due
/// lavori sulla stessa digitalizzazione.
#[allow(clippy::too_many_arguments)]
async fn enqueue(
    jobs: &tauri::State<'_, JobsState>,
    job_type: &str,
    id_prefix: &str,
    priority: i64,
    provider_key: String,
    manifest_url: String,
    version_id: Option<String>,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    // Tentativi e attese sono del profilo della biblioteca, non costanti nostre
    // (D16, D18): Gallica ne concede tre, le altre cinque.
    let profile = crate::iiif::find_provider(&provider_key)
        .map(|provider| provider.network)
        .unwrap_or(crate::iiif::network::CAUTIOUS);

    let conn = jobs.0.connection()?;

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

    // Il tetto predefinito lo decide l'impostazione (D4): scriverlo qui
    // significherebbe ignorare la scelta dell'utente.
    let size_tag = match size_tag {
        Some(explicit) => explicit,
        None => crate::jobs::store::read_setting(&conn, "download_size_cap")?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "2000".to_string()),
    };

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
    let id = format!("{id_prefix}:{version_id}");
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
    });

    jobs.0
        .submit(&NewJob {
            id,
            job_type: job_type.to_string(),
            priority,
            config: config.to_string(),
            max_attempts: profile.max_attempts,
            depends_on_job_id: None,
            workspace_id: None,
            message: title,
        })
        .await
}
