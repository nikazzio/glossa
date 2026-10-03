use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

pub(super) async fn run_blocking<T: Send + 'static>(
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

pub(super) fn floats_to_blob(v: &[f32]) -> Vec<u8> {
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
    index: usize,
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
    super::text_units::dimensions(&model)?;
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
    ordered_embeddings(parsed.data, texts.len(), &model)
}

fn ordered_embeddings(
    mut data: Vec<EmbeddingObject>,
    count: usize,
    model: &str,
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    if data.len() != count {
        return Err(EmbeddingError::Parse(
            "Incomplete embedding response".into(),
        ));
    }
    data.sort_by_key(|item| item.index);
    data.into_iter()
        .enumerate()
        .map(|(index, item)| {
            if item.index != index {
                return Err(EmbeddingError::Parse(
                    "Invalid embedding response indices".into(),
                ));
            }
            super::text_units::validate_embedding(model, &item.embedding)?;
            Ok(item.embedding)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object(index: usize, value: f32) -> EmbeddingObject {
        EmbeddingObject {
            index,
            embedding: vec![value; 1536],
        }
    }

    #[test]
    fn provider_indices_restore_order_before_pair_alignment() {
        let vectors = ordered_embeddings(
            vec![object(1, 2.0), object(0, 1.0)],
            2,
            "text-embedding-3-small",
        )
        .expect("valid response");
        assert_eq!(vectors[0][0], 1.0);
        assert_eq!(vectors[1][0], 2.0);
    }

    #[test]
    fn incomplete_duplicate_or_out_of_range_provider_indices_are_rejected() {
        assert!(ordered_embeddings(vec![object(0, 1.0)], 2, "text-embedding-3-small").is_err());
        assert!(ordered_embeddings(
            vec![object(0, 1.0), object(0, 1.0)],
            2,
            "text-embedding-3-small"
        )
        .is_err());
        assert!(ordered_embeddings(vec![object(1, 1.0)], 1, "text-embedding-3-small").is_err());
    }

    #[test]
    fn provider_values_and_dimensions_are_validated_before_any_write() {
        assert!(
            ordered_embeddings(vec![object(0, f32::INFINITY)], 1, "text-embedding-3-small")
                .is_err()
        );
        assert!(ordered_embeddings(vec![object(0, 1.0)], 1, "text-embedding-3-large").is_err());
    }
}
