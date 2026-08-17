use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

const OPENAI_CONNECT_TIMEOUT_SECS: u64 = 10;
const OPENAI_REQUEST_TIMEOUT_SECS: u64 = 45;

#[derive(Debug, thiserror::Error)]
pub enum EmbeddingError {
    #[error("API key not found for provider openai")]
    MissingApiKey,
    #[error("HTTP request failed: {0}")]
    Http(String),
    #[error("Unexpected API response: {0}")]
    Parse(String),
}

impl Serialize for EmbeddingError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

async fn run_blocking<T: Send + 'static>(
    connection: Arc<Mutex<rusqlite::Connection>>,
    operation: impl FnOnce(&mut rusqlite::Connection) -> Result<T, EmbeddingError> + Send + 'static,
) -> Result<T, EmbeddingError> {
    tokio::task::spawn_blocking(move || {
        let mut connection = connection.lock().map_err(|_| {
            EmbeddingError::Http("vector database connection is unavailable".to_string())
        })?;
        operation(&mut connection)
    })
    .await
    .map_err(|error| EmbeddingError::Http(format!("database task failed: {error}")))?
}

fn floats_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn openai_client() -> Result<reqwest::Client, EmbeddingError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(OPENAI_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(OPENAI_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| EmbeddingError::Http(format!("cannot build OpenAI client: {e}")))
}

// ── OpenAI response types ────────────────────────────────────────────

#[derive(Deserialize)]
struct EmbeddingObject {
    embedding: Vec<f32>,
}

#[derive(Deserialize)]
struct OpenAiEmbeddingResponse {
    data: Vec<EmbeddingObject>,
}

// ── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_embeddings(
    app: tauri::AppHandle,
    texts: Vec<String>,
    model: String,
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    if texts.is_empty() {
        return Ok(vec![]);
    }
    let request_started = Instant::now();
    let total_chars: usize = texts.iter().map(|text| text.len()).sum();
    log::debug!(
        "phrase_memory.get_embeddings.start model={model} input_count={} total_chars={total_chars}",
        texts.len()
    );

    let api_key =
        crate::keystore::get_api_key(&app, "openai").map_err(|_| EmbeddingError::MissingApiKey)?;
    if api_key.is_empty() {
        return Err(EmbeddingError::MissingApiKey);
    }

    let body = serde_json::json!({
        "input": texts,
        "model": model,
        "encoding_format": "float"
    });

    let response = openai_client()?
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            log::warn!(
                "phrase_memory.get_embeddings.request_failed model={model} input_count={} elapsed_ms={} error={e}",
                texts.len(),
                request_started.elapsed().as_millis()
            );
            EmbeddingError::Http(e.to_string())
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let preview: String = text.chars().take(500).collect();
        log::warn!(
            "phrase_memory.get_embeddings.http_error model={model} input_count={} elapsed_ms={} status={status} body_preview={preview:?}",
            texts.len(),
            request_started.elapsed().as_millis()
        );
        return Err(EmbeddingError::Http(format!("{status}: {text}")));
    }

    let parsed: OpenAiEmbeddingResponse = response
        .json()
        .await
        .map_err(|e| {
            log::warn!(
                "phrase_memory.get_embeddings.parse_failed model={model} input_count={} elapsed_ms={} error={e}",
                texts.len(),
                request_started.elapsed().as_millis()
            );
            EmbeddingError::Parse(e.to_string())
        })?;

    log::debug!(
        "phrase_memory.get_embeddings.done model={model} input_count={} output_count={} elapsed_ms={}",
        texts.len(),
        parsed.data.len(),
        request_started.elapsed().as_millis()
    );
    Ok(parsed.data.into_iter().map(|o| o.embedding).collect())
}


/// Le frasi che un workspace vede (#213).
///
/// Una frase nata da una traduzione **segue il suo progetto**: il workspace è
/// quello del progetto, e spostare il progetto porta con sé migliaia di righe
/// senza toccarne una. Una frase importata non ha un progetto, e si collega da
/// sola. Prima la colonna sulla riga diceva entrambe le cose, e si
/// disallineava al primo spostamento.
const IN_WORKSPACE: &str = "(pm.project_id IN (SELECT id FROM projects WHERE workspace_id = :ws) \
     OR EXISTS (SELECT 1 FROM workspace_items wi \
                 WHERE wi.item_type = 'phrase' AND wi.item_id = pm.id AND wi.workspace_id = :ws))";

#[derive(Debug, Serialize, Deserialize)]
pub struct PhraseMatchResult {
    pub phrase_memory_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub distance: f64,
    pub confidence: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhraseMemoryEntryResult {
    pub id: String,
    pub workspace_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub confidence: f64,
    pub source_language: String,
    pub target_language: String,
    pub author: Option<String>,
    pub work: Option<String>,
    pub domain: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub chunk_id: Option<String>,
    pub project_id: Option<String>,
    pub embedding_model: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn vec_list_phrase_memory(
    database: State<'_, crate::vector::VectorDatabase>,
    workspace_id: String,
) -> Result<Vec<PhraseMemoryEntryResult>, EmbeddingError> {
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    run_blocking(connection, move |conn| {
        crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
        let query = format!(
            "SELECT pm.id, pm.source_phrase, pm.target_phrase, pm.confidence, pm.source_language, \
                    pm.target_language, pm.author, pm.work, pm.domain, pm.tags, pm.notes, \
                    pm.chunk_id, pm.project_id, pm.embedding_model, pm.created_at \
             FROM phrase_memory pm WHERE {IN_WORKSPACE} \
             ORDER BY datetime(pm.created_at) DESC, pm.id DESC"
        );
        let mut statement = conn
            .prepare(&query)
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        let entries = statement
            .query_map(rusqlite::named_params! { ":ws": workspace_id }, |row| {
                Ok(PhraseMemoryEntryResult {
                    id: row.get(0)?, workspace_id: workspace_id.clone(), source_phrase: row.get(1)?,
                    target_phrase: row.get(2)?, confidence: row.get(3)?, source_language: row.get(4)?,
                    target_language: row.get(5)?, author: row.get(6)?, work: row.get(7)?,
                    domain: row.get(8)?, tags: row.get(9)?, notes: row.get(10)?,
                    chunk_id: row.get(11)?, project_id: row.get(12)?, embedding_model: row.get(13)?,
                    created_at: row.get(14)?,
                })
            })
            .map_err(|error| EmbeddingError::Http(error.to_string()))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        Ok(entries)
    })
    .await
}

#[tauri::command]
pub async fn vec_delete_phrase_memory(
    database: State<'_, crate::vector::VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: String,
    phrase_memory_id: String,
) -> Result<u32, EmbeddingError> {
    let _write_guard = write_coordinator.lock().await;
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    run_blocking(connection, move |conn| {
        crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
        // La frase si cancella solo se **quel** workspace la vede: senza il
        // controllo, un id indovinato toglierebbe una frase di un altro.
        let query = format!(
            "DELETE FROM phrase_memory WHERE id = :id \
             AND EXISTS (SELECT 1 FROM phrase_memory pm WHERE pm.id = :id AND {IN_WORKSPACE})"
        );
        conn.execute(
            &query,
            rusqlite::named_params! { ":id": phrase_memory_id, ":ws": workspace_id },
        )
        .map(|count| count as u32)
        .map_err(|error| EmbeddingError::Http(error.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn vec_update_phrase_memory(
    database: State<'_, crate::vector::VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: String,
    phrase_memory_id: String,
    source_phrase: String,
    target_phrase: String,
    embedding: Vec<f32>,
) -> Result<u32, EmbeddingError> {
    let _write_guard = write_coordinator.lock().await;
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    run_blocking(connection, move |conn| {
        crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
        let query = format!(
            "UPDATE phrase_memory SET source_phrase = :source, target_phrase = :target, \
                    embedding = :embedding \
             WHERE id = :id \
               AND EXISTS (SELECT 1 FROM phrase_memory pm WHERE pm.id = :id AND {IN_WORKSPACE})"
        );
        conn.execute(
            &query,
            rusqlite::named_params! {
                ":source": source_phrase,
                ":target": target_phrase,
                ":embedding": floats_to_blob(&embedding),
                ":id": phrase_memory_id,
                ":ws": workspace_id,
            },
        )
        .map(|count| count as u32)
        .map_err(|error| EmbeddingError::Http(error.to_string()))
    })
    .await
}

#[tauri::command]
pub async fn vec_search_phrase_memory(
    database: State<'_, crate::vector::VectorDatabase>,
    workspace_id: String,
    query_embedding: Vec<f32>,
    threshold: f64,
    max_results: u32,
    embedding_model: String,
) -> Result<Vec<PhraseMatchResult>, EmbeddingError> {
    let blob = floats_to_blob(&query_embedding);
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    run_blocking(connection, move |conn| {
        crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
        let mut statement = conn
            .prepare(&format!(
                "WITH ranked AS ( \
                   SELECT pm.id, pm.source_phrase, pm.target_phrase, pm.confidence, \
                          vec_distance_cosine(pm.embedding, :query) AS distance \
                   FROM phrase_memory pm \
                   WHERE {IN_WORKSPACE} \
                     AND (pm.embedding_model IS NULL OR pm.embedding_model = :model) \
                 ) \
                 SELECT id, source_phrase, target_phrase, confidence, distance FROM ranked \
                 WHERE distance < :threshold ORDER BY distance ASC LIMIT :limit"
            ))
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        let matches = statement
            .query_map(
                rusqlite::named_params! {
                    ":query": blob,
                    ":ws": workspace_id,
                    ":threshold": threshold,
                    ":limit": max_results,
                    ":model": embedding_model,
                },
                |row| {
                    Ok(PhraseMatchResult {
                        phrase_memory_id: row.get(0)?,
                        source_phrase: row.get(1)?,
                        target_phrase: row.get(2)?,
                        confidence: row.get(3)?,
                        distance: row.get(4)?,
                    })
                },
            )
            .map_err(|error| EmbeddingError::Http(error.to_string()))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        Ok(matches)
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhrasePair {
    pub source_phrase: String,
    pub target_phrase: String,
    pub confidence: f64,
    pub source_embedding: Vec<f32>,
}

// 2 State injection + 7 parametri di dominio: raggruppabili in una request struct,
// ma cambierebbe la firma del comando Tauri — rimandato a un refactor dedicato.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn vec_save_locked_phrases(
    database: State<'_, crate::vector::VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    // Il workspace non si passa più: una frase nata da una traduzione sta dove
    // sta il progetto, e chiederlo due volte era il modo di farli divergere.
    project_id: String,
    chunk_id: String,
    pairs: Vec<PhrasePair>,
    source_language: String,
    target_language: String,
    embedding_model: String,
) -> Result<u32, EmbeddingError> {
    let save_started = Instant::now();
    log::debug!(
        "phrase_memory.vec_save_locked_phrases.start project_id={project_id} chunk_id={chunk_id} pair_count={}",
        pairs.len()
    );
    if pairs.is_empty() {
        return Ok(0);
    }

    let _write_guard = write_coordinator.lock().await;
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    run_blocking(connection, move |conn| {

    crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;

    let project_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1",
            rusqlite::params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            log::warn!(
                "phrase_memory.vec_save_locked_phrases.project_check_failed project_id={project_id} error={e}"
            );
            EmbeddingError::Http(e.to_string())
        })?;
    log::debug!(
        "phrase_memory.vec_save_locked_phrases.refs project_id={project_id} project_exists={project_exists}"
    );
    if project_exists == 0 {
        return Err(EmbeddingError::Http(format!(
            "phrase memory references missing: project_id={project_id}"
        )));
    }

    let mut saved: u32 = 0;
    let mut attempted: u32 = 0;
    let tx = conn.transaction().map_err(|e| {
        log::warn!("phrase_memory.vec_save_locked_phrases.transaction_failed error={e}");
        EmbeddingError::Http(e.to_string())
    })?;

    let replaced_rows = tx
        .execute(
            "DELETE FROM phrase_memory WHERE chunk_id = ?1 AND project_id = ?2",
            rusqlite::params![&chunk_id, &project_id],
        )
        .map_err(|e| {
            log::warn!(
                "phrase_memory.vec_save_locked_phrases.replace_failed project_id={project_id} chunk_id={chunk_id} error={e}"
            );
            EmbeddingError::Http(e.to_string())
        })?;
    log::debug!(
        "phrase_memory.vec_save_locked_phrases.replace_done deleted_phrase_memory_rows={replaced_rows}"
    );

    for (index, pair) in pairs.iter().enumerate() {
        attempted += 1;
        let rows = tx
            .execute(
                "INSERT OR IGNORE INTO phrase_memory \
                 (id, project_id, chunk_id, source_phrase, target_phrase, \
                  confidence, source_language, target_language, embedding, embedding_model, created_at) \
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
                rusqlite::params![
                    &project_id,
                    &chunk_id,
                    pair.source_phrase,
                    pair.target_phrase,
                    pair.confidence.clamp(0.0, 1.0),
                    &source_language,
                    &target_language,
                    floats_to_blob(&pair.source_embedding),
                    &embedding_model,
                ],
            )
            .map_err(|e| {
                log::warn!(
                    "phrase_memory.vec_save_locked_phrases.insert_failed project_id={project_id} chunk_id={chunk_id} pair_index={index} source_chars={} target_chars={} embedding_dim={} error={e}",
                    pair.source_phrase.len(),
                    pair.target_phrase.len(),
                    pair.source_embedding.len()
                );
                EmbeddingError::Http(format!("phrase memory insert failed at pair {index}: {e}"))
            })?;

        saved += rows as u32;
    }
    log::debug!(
        "phrase_memory.vec_save_locked_phrases.insert_loop_done pair_count={} attempted={attempted} saved={saved}",
        pairs.len()
    );

    let deleted_source_embeddings = tx
        .execute(
            "DELETE FROM source_phrase_embeddings WHERE chunk_id = ?1 AND project_id = ?2",
            rusqlite::params![&chunk_id, &project_id],
        )
        .map_err(|e| {
            log::warn!(
                "phrase_memory.vec_save_locked_phrases.cleanup_failed project_id={project_id} chunk_id={chunk_id} error={e}"
            );
            EmbeddingError::Http(e.to_string())
        })?;
    log::debug!(
        "phrase_memory.vec_save_locked_phrases.cleanup_done deleted_source_embeddings={deleted_source_embeddings}"
    );
    tx.commit().map_err(|e| {
        log::warn!("phrase_memory.vec_save_locked_phrases.commit_failed error={e}");
        EmbeddingError::Http(e.to_string())
    })?;

    log::info!(
        "phrase_memory.vec_save_locked_phrases.done project_id={project_id} chunk_id={chunk_id} pair_count={} attempted={attempted} saved={saved} elapsed_ms={}",
        pairs.len(),
        save_started.elapsed().as_millis()
    );
        Ok(saved)
    })
    .await
}

#[tauri::command]
pub async fn vec_regenerate_all_embeddings(
    app: tauri::AppHandle,
    database: State<'_, crate::vector::VectorDatabase>,
    write_coordinator: State<'_, crate::db::DbWriteCoordinator>,
    workspace_id: String,
    model: String,
) -> Result<u32, EmbeddingError> {
    log::debug!(
        "phrase_memory.vec_regenerate_all_embeddings.start workspace_id={workspace_id} model={model}"
    );

    // Phase 1: collect entries without blocking the async runtime.
    let connection = database.connection().map_err(EmbeddingError::Http)?;
    let query_workspace_id = workspace_id.clone();
    let entries: Vec<(String, String)> = run_blocking(Arc::clone(&connection), move |conn| {
        crate::vector::verify_phrase_memory_schema(conn).map_err(EmbeddingError::Http)?;
        let mut statement = conn
            .prepare(&format!(
                "SELECT pm.id, pm.source_phrase FROM phrase_memory pm WHERE {IN_WORKSPACE}"
            ))
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        let entries = statement
            .query_map(rusqlite::named_params! { ":ws": query_workspace_id }, |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| EmbeddingError::Http(error.to_string()))?
            .collect::<rusqlite::Result<_>>()
            .map_err(|error| EmbeddingError::Http(error.to_string()))?;
        Ok(entries)
    })
    .await?;

    if entries.is_empty() {
        log::debug!(
            "phrase_memory.vec_regenerate_all_embeddings.empty workspace_id={workspace_id}"
        );
        return Ok(0);
    }

    // Phase 2: embed (async — no conn held across this await)
    let phrases: Vec<String> = entries.iter().map(|(_, p)| p.clone()).collect();
    let embeddings = get_embeddings(app.clone(), phrases, model.clone()).await?;

    // Phase 3: update without blocking the async runtime.
    let update_model = model.clone();
    let _write_guard = write_coordinator.lock().await;
    let updated: u32 = run_blocking(connection, move |conn| {
        entries
            .iter()
            .zip(embeddings.iter())
            .map(|((id, _), embedding)| {
                conn.execute(
                    "UPDATE phrase_memory SET embedding = ?1, embedding_model = ?2 WHERE id = ?3",
                    rusqlite::params![floats_to_blob(embedding), &update_model, id],
                )
                .map(|count| count as u32)
            })
            .collect::<rusqlite::Result<Vec<u32>>>()
            .map_err(|error| EmbeddingError::Http(error.to_string()))
            .map(|counts| counts.into_iter().sum())
    })
    .await?;

    log::info!(
        "phrase_memory.vec_regenerate_all_embeddings.done workspace_id={workspace_id} model={model} updated={updated}"
    );
    Ok(updated)
}
