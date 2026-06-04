use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

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

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, EmbeddingError> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("glossa.db"))
        .map_err(|e| EmbeddingError::Http(format!("cannot resolve db path: {e}")))
}

fn floats_to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn ensure_source_phrase_embeddings_schema(conn: &rusqlite::Connection) -> Result<(), EmbeddingError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS source_phrase_embeddings (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id),
            chunk_id TEXT,
            source_phrase TEXT NOT NULL,
            embedding BLOB NOT NULL,
            created_at TEXT NOT NULL
        );",
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))
}

fn ensure_phrase_memory_schema(conn: &rusqlite::Connection) -> Result<(), EmbeddingError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS phrase_memory (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            source_phrase TEXT NOT NULL,
            target_phrase TEXT NOT NULL,
            source_language TEXT NOT NULL,
            target_language TEXT NOT NULL,
            author TEXT,
            work TEXT,
            domain TEXT,
            tags TEXT,
            notes TEXT,
            chunk_id TEXT,
            project_id TEXT REFERENCES projects(id),
            embedding BLOB NOT NULL,
            created_at TEXT NOT NULL
        );",
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))
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

    let api_key = crate::keystore::get_api_key(&app, "openai")
        .map_err(|_| EmbeddingError::MissingApiKey)?;
    if api_key.is_empty() {
        return Err(EmbeddingError::MissingApiKey);
    }

    let body = serde_json::json!({
        "input": texts,
        "model": model,
        "encoding_format": "float"
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::Http(format!("{status}: {text}")));
    }

    let parsed: OpenAiEmbeddingResponse = response
        .json()
        .await
        .map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    Ok(parsed.data.into_iter().map(|o| o.embedding).collect())
}

#[tauri::command]
pub async fn split_phrases_llm(
    app: tauri::AppHandle,
    source_text: String,
) -> Result<Vec<String>, EmbeddingError> {
    let api_key = crate::keystore::get_api_key(&app, "openai")
        .map_err(|_| EmbeddingError::MissingApiKey)?;
    if api_key.is_empty() {
        return Err(EmbeddingError::MissingApiKey);
    }

    let prompt = format!(
        "Split the following text into individual sentences or meaningful phrases. \
        Return a JSON object with a single key \"phrases\" whose value is an array of strings. \
        Each string must be an exact verbatim copy from the source text — no paraphrasing, \
        no added punctuation. \
        Example: {{\"phrases\": [\"First sentence.\", \"Second phrase\"]}}\n\nText:\n{source_text}"
    );

    let body = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(EmbeddingError::Http(format!("{status}: {text}")));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| EmbeddingError::Parse("missing content".into()))?;

    let parsed: serde_json::Value =
        serde_json::from_str(content).map_err(|e| EmbeddingError::Parse(e.to_string()))?;

    let arr = parsed
        .get("phrases")
        .and_then(|v| v.as_array())
        .ok_or_else(|| EmbeddingError::Parse("expected object with \"phrases\" array".into()))?;

    let validated: Vec<String> = arr
        .iter()
        .filter_map(|v| v.as_str())
        .filter(|phrase| {
            let ok = source_text.contains(*phrase);
            if !ok {
                log::warn!("split_phrases_llm: discarding non-verbatim phrase: {phrase:?}");
            }
            ok
        })
        .map(|s| s.to_string())
        .collect();

    Ok(validated)
}

#[tauri::command]
pub async fn vec_upsert_source_phrase(
    app: tauri::AppHandle,
    project_id: String,
    chunk_id: String,
    phrase: String,
    embedding: Vec<f32>,
) -> Result<(), EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_source_phrase_embeddings_schema(&conn)?;

    conn.execute(
        "INSERT OR REPLACE INTO source_phrase_embeddings \
         (id, project_id, chunk_id, source_phrase, embedding, created_at) \
         VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, datetime('now'))",
        rusqlite::params![project_id, chunk_id, phrase, floats_to_blob(&embedding)],
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhraseMatchResult {
    pub phrase_memory_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub distance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PhraseMemoryEntryResult {
    pub id: String,
    pub workspace_id: String,
    pub source_phrase: String,
    pub target_phrase: String,
    pub source_language: String,
    pub target_language: String,
    pub author: Option<String>,
    pub work: Option<String>,
    pub domain: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub chunk_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn vec_list_phrase_memory(
    app: tauri::AppHandle,
    workspace_id: String,
) -> Result<Vec<PhraseMemoryEntryResult>, EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_phrase_memory_schema(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, source_phrase, target_phrase, source_language, target_language, \
                    author, work, domain, tags, notes, chunk_id, project_id, created_at \
             FROM phrase_memory \
             WHERE workspace_id = ?1 \
             ORDER BY datetime(created_at) DESC, id DESC",
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let results: rusqlite::Result<Vec<PhraseMemoryEntryResult>> = stmt
        .query_map(rusqlite::params![workspace_id], |row| {
            Ok(PhraseMemoryEntryResult {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                source_phrase: row.get(2)?,
                target_phrase: row.get(3)?,
                source_language: row.get(4)?,
                target_language: row.get(5)?,
                author: row.get(6)?,
                work: row.get(7)?,
                domain: row.get(8)?,
                tags: row.get(9)?,
                notes: row.get(10)?,
                chunk_id: row.get(11)?,
                project_id: row.get(12)?,
                created_at: row.get(13)?,
            })
        })
        .map_err(|e| EmbeddingError::Http(e.to_string()))?
        .collect();

    results.map_err(|e| EmbeddingError::Http(e.to_string()))
}

#[tauri::command]
pub async fn vec_delete_phrase_memory(
    app: tauri::AppHandle,
    workspace_id: String,
    phrase_memory_id: String,
) -> Result<u32, EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_phrase_memory_schema(&conn)?;

    let deleted = conn
        .execute(
            "DELETE FROM phrase_memory WHERE id = ?1 AND workspace_id = ?2",
            rusqlite::params![phrase_memory_id, workspace_id],
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(deleted as u32)
}

#[tauri::command]
pub async fn vec_update_phrase_memory(
    app: tauri::AppHandle,
    workspace_id: String,
    phrase_memory_id: String,
    source_phrase: String,
    target_phrase: String,
    embedding: Vec<f32>,
) -> Result<u32, EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_phrase_memory_schema(&conn)?;

    let updated = conn
        .execute(
            "UPDATE phrase_memory \
             SET source_phrase = ?1, target_phrase = ?2, embedding = ?3 \
             WHERE id = ?4 AND workspace_id = ?5",
            rusqlite::params![
                source_phrase,
                target_phrase,
                floats_to_blob(&embedding),
                phrase_memory_id,
                workspace_id
            ],
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(updated as u32)
}

#[tauri::command]
pub async fn vec_search_phrase_memory(
    app: tauri::AppHandle,
    workspace_id: String,
    query_embedding: Vec<f32>,
    threshold: f64,
    max_results: u32,
) -> Result<Vec<PhraseMatchResult>, EmbeddingError> {
    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_phrase_memory_schema(&conn)?;

    let blob = floats_to_blob(&query_embedding);

    let mut stmt = conn
        .prepare(
            "WITH ranked AS ( \
               SELECT pm.id, pm.source_phrase, pm.target_phrase, \
                      vec_distance_cosine(pm.embedding, ?1) AS distance \
               FROM phrase_memory pm \
               WHERE pm.workspace_id = ?2 \
             ) \
             SELECT id, source_phrase, target_phrase, distance \
             FROM ranked \
             WHERE distance < ?3 \
             ORDER BY distance ASC \
             LIMIT ?4",
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    let results: rusqlite::Result<Vec<PhraseMatchResult>> = stmt
        .query_map(
            rusqlite::params![blob, workspace_id, threshold, max_results],
            |row| {
                Ok(PhraseMatchResult {
                    phrase_memory_id: row.get(0)?,
                    source_phrase: row.get(1)?,
                    target_phrase: row.get(2)?,
                    distance: row.get(3)?,
                })
            },
        )
        .map_err(|e| EmbeddingError::Http(e.to_string()))?
        .collect();

    results.map_err(|e| EmbeddingError::Http(e.to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhrasePair {
    pub source_phrase: String,
    pub target_phrase: String,
    pub source_embedding: Vec<f32>,
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn vec_save_locked_phrases(
    app: tauri::AppHandle,
    workspace_id: String,
    project_id: String,
    chunk_id: String,
    pairs: Vec<PhrasePair>,
    min_phrase_length: u32,
    source_language: String,
    target_language: String,
) -> Result<u32, EmbeddingError> {
    if pairs.is_empty() {
        return Ok(0);
    }

    let path = db_path(&app)?;
    let conn = crate::vector::open_vec_connection(&path)
        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
    ensure_phrase_memory_schema(&conn)?;
    ensure_source_phrase_embeddings_schema(&conn)?;

    let mut saved: u32 = 0;

    for pair in &pairs {
        if (pair.source_phrase.len() as u32) < min_phrase_length {
            continue;
        }

        let rows = conn
            .execute(
                "INSERT OR IGNORE INTO phrase_memory \
                 (id, workspace_id, project_id, chunk_id, source_phrase, target_phrase, \
                  source_language, target_language, embedding, created_at) \
                 VALUES (lower(hex(randomblob(16))), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
                rusqlite::params![
                    &workspace_id,
                    &project_id,
                    &chunk_id,
                    pair.source_phrase,
                    pair.target_phrase,
                    &source_language,
                    &target_language,
                    floats_to_blob(&pair.source_embedding)
                ],
            )
            .map_err(|e| EmbeddingError::Http(e.to_string()))?;

        saved += rows as u32;
    }

    conn.execute(
        "DELETE FROM source_phrase_embeddings WHERE chunk_id = ?1 AND project_id = ?2",
        rusqlite::params![chunk_id, project_id],
    )
    .map_err(|e| EmbeddingError::Http(e.to_string()))?;

    Ok(saved)
}
