//! Lo scaricamento delle fonti: il primo gestore di lavoro vero (#218, PR 4).
//!
//! Dal manifesto alle carte sul disco, rispettando i limiti della biblioteca
//! (D18), saltando ciò che è già valido, salvando dove si è arrivati e senza
//! far entrare nel deposito niente che non sia stato validato (D16-bis).

pub mod courtesy;
pub mod fetch;
pub mod handler;
pub mod manifest;

use crate::jobs::commands::JobsState;
use crate::jobs::store::NewJob;
use crate::jobs::JobRecord;

/// Mette in coda lo scaricamento di una digitalizzazione.
///
/// L'interfaccia non scarica niente: chiede un lavoro e poi osserva (D10). La
/// priorità è alta perché è ciò che l'utente ha appena chiesto guardando lo
/// schermo, e la coda deve preferirlo alle verifiche di fondo.
#[tauri::command]
pub async fn enqueue_source_download(
    jobs: tauri::State<'_, JobsState>,
    provider_key: String,
    manifest_url: String,
    version_id: Option<String>,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    // La digitalizzazione si può indicare per identificativo o lasciar
    // ritrovare dall'indirizzo del manifesto, che è l'unica cosa che l'utente
    // ha davvero in mano quando aggiunge una fonte alla Biblioteca.
    let version_id = match version_id {
        Some(id) => id,
        None => {
            let conn = jobs.0.connection()?;
            conn.query_row(
                "SELECT id FROM source_versions WHERE source_url = ?1 ORDER BY created_at LIMIT 1",
                rusqlite::params![manifest_url],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| {
                format!("nessuna fonte in Biblioteca con questo manifesto: {manifest_url}")
            })?
        }
    };

    // Il tetto predefinito lo decide l'impostazione (D4): scriverlo qui
    // significherebbe ignorare la scelta dell'utente.
    let size_tag = match size_tag {
        Some(explicit) => explicit,
        None => {
            let conn = jobs.0.connection()?;
            crate::jobs::store::read_setting(&conn, "download_size_cap")?
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "2000".to_string())
        }
    };

    let config = serde_json::json!({
        "providerKey": provider_key,
        "versionId": version_id,
        "manifestUrl": manifest_url,
        "sizeTag": size_tag,
    });

    // Un lavoro per digitalizzazione. Chiederlo due volte non ne apre due e
    // non è un errore: si ritrova quello che c'è già, che è quello che l'utente
    // voleva vedere.
    let id = format!("download:{version_id}");
    let existing = {
        let conn = jobs.0.connection()?;
        crate::jobs::store::get(&conn, &id)?
    };
    if let Some(job) = existing {
        if !job.status.is_terminal() {
            return Ok(job);
        }
        // Si rilancia **senza azzerare** il punto raggiunto: su una fonte già
        // completa il giro finisce subito, e la percentuale non riparte da zero
        // per pagine che ci sono già.
        jobs.0.retry(&id, false).await?;
        let conn = jobs.0.connection()?;
        return crate::jobs::store::get(&conn, &id)?
            .ok_or_else(|| "il lavoro è sparito subito dopo essere stato ripreso".to_string());
    }

    jobs.0
        .submit(&NewJob {
            id,
            job_type: handler::JOB_TYPE.to_string(),
            priority: 10,
            config: config.to_string(),
            max_attempts: 3,
            depends_on_job_id: None,
            workspace_id: None,
        })
        .await
}
