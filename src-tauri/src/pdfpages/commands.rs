//! Mettere in coda l'estrazione delle pagine di una copia PDF.

use tauri::Manager;

use crate::download::inventory;
use crate::jobs::commands::JobsState;
use crate::jobs::store::NewJob;
use crate::jobs::JobRecord;

use super::{job_id, IMPORT_SCHEME, JOB_TYPE};

/// Come l'ottimizzazione: lavoro del processore, dopo la rete.
const PRIORITY: i64 = 5;

/// La copia a immagini nata da una copia PDF ha un identificativo derivato:
/// la si ritrova senza cercarla, e rilanciare l'estrazione non ne crea due.
pub fn image_version_id(pdf_version_id: &str) -> String {
    format!("{pdf_version_id}-img")
}

/// Crea, se manca, la copia a immagini che riceverà le pagine estratte.
///
/// Non è mai la copia primaria: nelle opere importate la primaria è il PDF, che
/// porta i dati dell'opera; nelle opere delle biblioteche resta quella di
/// sempre.
fn ensure_image_version(
    conn: &rusqlite::Connection,
    pdf_version_id: &str,
    provider_key: &str,
) -> Result<(String, String), String> {
    let source_id: String = conn
        .query_row(
            "SELECT source_id FROM source_versions WHERE id = ?1 AND version_kind = 'pdf'",
            rusqlite::params![pdf_version_id],
            |row| row.get(0),
        )
        .map_err(|_| "pdf_version_not_found".to_string())?;
    let image_id = image_version_id(pdf_version_id);
    let metadata = serde_json::json!({
        "providerKey": provider_key,
        "extractedFrom": pdf_version_id,
    })
    .to_string();
    conn.execute(
        "INSERT INTO source_versions (id, source_id, label, version_kind, source_url, metadata, is_primary) \
         VALUES (?1, ?2, 'PDF', 'iiif_manifest', ?3, ?4, 0) \
         ON CONFLICT(id) DO NOTHING",
        rusqlite::params![
            image_id,
            source_id,
            format!("{IMPORT_SCHEME}{image_id}"),
            metadata
        ],
    )
    .map_err(|error| format!("copia a immagini non creata: {error}"))?;
    Ok((source_id, image_id))
}

/// Mette in coda «Estrai le pagine» per una copia PDF sul computer.
#[tauri::command]
pub async fn enqueue_pdf_extraction(
    app: tauri::AppHandle,
    writes: tauri::State<'_, crate::db::DbWriteCoordinator>,
    pdf_version_id: String,
) -> Result<JobRecord, String> {
    let root = crate::vault::commands::root_of(&app)?;
    let inventory = inventory::of_version(&root, &pdf_version_id)
        .filter(|found| found.document.is_some())
        .ok_or_else(|| "pdf_not_local".to_string())?;
    let provider_key = inventory.provider_key;

    let (title, image_id) = {
        let _write_guard = writes.lock().await;
        let conn = crate::db::open_connection(&crate::storage_config::db_path(&app)?)?;
        let (source_id, image_id) = ensure_image_version(&conn, &pdf_version_id, &provider_key)?;
        let title = conn
            .query_row(
                "SELECT title FROM sources WHERE id = ?1",
                rusqlite::params![source_id],
                |row| row.get::<_, String>(0),
            )
            .ok();
        (title, image_id)
    };

    let config = serde_json::json!({
        "providerKey": provider_key,
        "pdfVersionId": pdf_version_id,
        "imageVersionId": image_id,
    })
    .to_string();
    let jobs = app.state::<JobsState>();
    let id = job_id(&pdf_version_id);

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
            message: title,
        })
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("db");
        conn.execute_batch(
            "CREATE TABLE source_versions (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, \
             label TEXT NOT NULL, version_kind TEXT NOT NULL, source_url TEXT, metadata TEXT, \
             is_primary INTEGER NOT NULL DEFAULT 0); \
             INSERT INTO source_versions VALUES ('sver-a', 'source-1', 'primary', 'pdf', NULL, NULL, 1);",
        )
        .expect("schema");
        conn
    }

    #[test]
    fn the_image_copy_is_created_once_never_primary_with_a_local_address() {
        let conn = database();
        let first = ensure_image_version(&conn, "sver-a", "local_import").expect("prima");
        let second = ensure_image_version(&conn, "sver-a", "local_import").expect("seconda");
        assert_eq!(first, second);

        let (kind, url, primary): (String, String, i64) = conn
            .query_row(
                "SELECT version_kind, source_url, is_primary FROM source_versions WHERE id = 'sver-a-img'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("riga");
        assert_eq!(kind, "iiif_manifest");
        assert_eq!(url, "glossa-import:sver-a-img");
        assert_eq!(primary, 0);
    }

    #[test]
    fn a_version_that_is_not_a_pdf_is_refused() {
        let conn = database();
        assert!(ensure_image_version(&conn, "sver-missing", "local_import").is_err());
    }
}
