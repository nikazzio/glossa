use super::embedding::{get_embeddings, run_blocking, EmbeddingError};
use super::memory_search::PhraseMatchResult;
use super::text_units::{self, EmbeddingInput, MemoryEntry, PhrasePair, UpdateInput};
use super::VectorDatabase;
use tauri::State;

fn db(error: rusqlite::Error) -> EmbeddingError {
    EmbeddingError::Http(error.to_string())
}

#[tauri::command]
pub async fn vec_list_phrase_memory(
    database: State<'_, VectorDatabase>,
    workspace_id: Option<String>,
    chunk_id: Option<String>,
) -> Result<Vec<MemoryEntry>, EmbeddingError> {
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
            text_units::list(conn, workspace_id.as_deref(), chunk_id.as_deref())
        },
    )
    .await
}

#[tauri::command]
pub async fn vec_get_phrase_memory(
    database: State<'_, VectorDatabase>,
    workspace_id: Option<String>,
    phrase_memory_id: String,
) -> Result<MemoryEntry, EmbeddingError> {
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| text_units::get(conn, workspace_id.as_deref(), &phrase_memory_id),
    )
    .await
}

#[tauri::command]
pub async fn vec_update_phrase_memory(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    input: UpdateInput,
) -> Result<u32, EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| text_units::update(conn, input),
    )
    .await
}

#[tauri::command]
pub async fn vec_delete_phrase_memory(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: Option<String>,
    phrase_memory_id: String,
) -> Result<u32, EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            let tx = conn.transaction().map_err(db)?;
            let entry = text_units::get(&tx, workspace_id.as_deref(), &phrase_memory_id)?;
            // The memory owns this unit; remove its link before immutable revisions.
            tx.execute("DELETE FROM phrase_memory WHERE id=?1", [&entry.id])
                .map_err(db)?;
            tx.execute("DELETE FROM text_units WHERE id=?1", [entry.unit_id])
                .map_err(db)?;
            tx.commit().map_err(db)?;
            Ok(1)
        },
    )
    .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn vec_save_locked_phrases(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    project_id: String,
    chunk_id: String,
    pairs: Vec<PhrasePair>,
    embedding_model: String,
) -> Result<u32, EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            text_units::save_pairs(
                conn,
                &project_id,
                &chunk_id,
                &embedding_model,
                pairs,
            )
        },
    )
    .await
}

/// Frasi salvate dall'opera con lingue diverse da quelle attuali dell'opera.
#[tauri::command]
pub async fn vec_count_project_phrase_relabels(
    database: State<'_, VectorDatabase>,
    project_id: String,
) -> Result<u32, EmbeddingError> {
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| super::text_languages::count_relabels(conn, &project_id),
    )
    .await
}

/// Dà alle frasi salvate dall'opera le lingue attuali dell'opera.
#[tauri::command]
pub async fn vec_relabel_project_phrases(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    project_id: String,
) -> Result<u32, EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| super::text_languages::relabel_project(conn, &project_id),
    )
    .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn vec_search_phrase_memory(
    database: State<'_, VectorDatabase>,
    workspace_id: String,
    query_embedding: Vec<f32>,
    threshold: f64,
    max_results: u32,
    embedding_model: String,
    all_workspaces: bool,
    source_language: Option<String>,
    target_language: Option<String>,
) -> Result<Vec<PhraseMatchResult>, EmbeddingError> {
    let input = super::memory_search::SearchInput {
        workspace_id,
        query_embedding,
        threshold,
        max_results,
        embedding_model,
        all_workspaces,
        source_language,
        target_language,
    };
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| super::memory_search::search(conn, input),
    )
    .await
}

#[tauri::command]
pub async fn vec_add_phrase_embedding(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: Option<String>,
    phrase_memory_id: String,
    source_revision_id: String,
    embedding: EmbeddingInput,
) -> Result<(), EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            let tx = conn.transaction().map_err(db)?;
            let entry = text_units::get(&tx, workspace_id.as_deref(), &phrase_memory_id)?;
            if entry.source_revision_id != source_revision_id {
                return Err(EmbeddingError::Parse(
                    "Source changed; reload before recalculating".into(),
                ));
            }
            text_units::put_embedding(&tx, &source_revision_id, &embedding)?;
            tx.commit().map_err(db)
        },
    )
    .await
}

#[tauri::command]
pub async fn vec_set_phrase_tags(
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: Option<String>,
    phrase_memory_id: String,
    tags: Vec<String>,
) -> Result<(), EmbeddingError> {
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            let tx = conn.transaction().map_err(db)?;
            let entry = text_units::get(&tx, workspace_id.as_deref(), &phrase_memory_id)?;
            text_units::set_tags(&tx, &entry.unit_id, &tags)?;
            tx.commit().map_err(db)
        },
    )
    .await
}

#[tauri::command]
pub async fn vec_regenerate_all_embeddings(
    app: tauri::AppHandle,
    database: State<'_, VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: String,
    model: String,
) -> Result<u32, EmbeddingError> {
    text_units::dimensions(&model)?;
    let ws = workspace_id.clone();
    let entries = run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| text_units::list(conn, Some(&ws), None),
    )
    .await?;
    if entries.is_empty() {
        return Ok(0);
    }
    let vectors = get_embeddings(
        app,
        entries.iter().map(|e| e.source_phrase.clone()).collect(),
        model.clone(),
    )
    .await?;
    if entries.len() != vectors.len() {
        return Err(EmbeddingError::Parse(
            "Incomplete embedding response".into(),
        ));
    }
    let _guard = write_coordinator.lock().await;
    run_blocking(
        database.connection().map_err(EmbeddingError::Http)?,
        move |conn| {
            let tx = conn.transaction().map_err(db)?;
            for (entry, embedding) in entries.iter().zip(vectors) {
                let current = text_units::get(&tx, Some(&workspace_id), &entry.id)?;
                text_units::ensure_revisions(
                    &current,
                    &entry.source_revision_id,
                    &entry.target_revision_id,
                )?;
                text_units::put_embedding(
                    &tx,
                    &entry.source_revision_id,
                    &EmbeddingInput {
                        model: model.clone(),
                        embedding,
                    },
                )?;
            }
            tx.commit().map_err(db)?;
            Ok(entries.len() as u32)
        },
    )
    .await
}
