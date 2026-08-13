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
    version_id: String,
    provider_key: String,
    manifest_url: String,
    size_tag: Option<String>,
) -> Result<JobRecord, String> {
    let config = serde_json::json!({
        "providerKey": provider_key,
        "versionId": version_id,
        "manifestUrl": manifest_url,
        "sizeTag": size_tag.unwrap_or_else(|| "2000".to_string()),
    });

    jobs.0
        .submit(&NewJob {
            // Un lavoro per digitalizzazione: chiedere due volte la stessa non
            // ne apre due, la seconda viene rifiutata dalla chiave.
            id: format!("download:{version_id}"),
            job_type: handler::JOB_TYPE.to_string(),
            priority: 10,
            config: config.to_string(),
            max_attempts: 3,
            depends_on_job_id: None,
            workspace_id: None,
        })
        .await
}
