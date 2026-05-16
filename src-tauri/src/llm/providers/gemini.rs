use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use super::format_api_error;
use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};
use crate::llm::types::GeminiCacheConfig;

pub struct GeminiProvider;

struct GeminiCacheEntry {
    name: String,
    created_at: Instant,
}

static GEMINI_CACHE_NAMES: LazyLock<Mutex<HashMap<String, GeminiCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn estimate_tokens(text: &str) -> usize {
    let words = text.split_whitespace().count();
    words + words / 3
}

fn min_explicit_cache_tokens(model: &str) -> usize {
    if model.to_ascii_lowercase().contains("pro") {
        8192
    } else {
        2048
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    fn id(&self) -> &'static str {
        "gemini"
    }

    fn display_name(&self) -> &'static str {
        "Gemini"
    }

    fn api_key_env_var(&self) -> Option<&'static str> {
        Some("GEMINI_API_KEY")
    }

    fn default_test_model(&self) -> &'static str {
        "gemini-3-flash-preview"
    }

    fn stream_timeouts(&self) -> StreamTimeouts {
        default_stream_timeouts()
    }

    fn stream_format(&self) -> StreamFormat {
        StreamFormat::Sse
    }

    fn http_client(&self) -> Result<Client, String> {
        build_default_http_client()
    }

    fn extract_streaming_token(&self, data: &str) -> Option<String> {
        let json: Value = serde_json::from_str(data).ok()?;
        json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .map(String::from)
    }

    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
        if let Ok(json) = serde_json::from_str::<Value>(data) {
            if let (Some(i), Some(o)) = (
                json["usageMetadata"]["promptTokenCount"].as_u64(),
                json["usageMetadata"]["candidatesTokenCount"].as_u64(),
            ) {
                state.latest_input = Some(i as u32);
                state.latest_output = Some(o as u32);
                state.latest_cached_input = json["usageMetadata"]["cachedContentTokenCount"]
                    .as_u64()
                    .map(|value| value as u32);
                state.latest_cache_miss_input = state
                    .latest_cached_input
                    .map(|cached| (i as u32).saturating_sub(cached));
            }
        }
    }

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            req.model, req.api_key
        );

        let gen_config = if req.json_mode {
            serde_json::json!({ "responseMimeType": "application/json" })
        } else {
            serde_json::json!({})
        };

        let mut body = serde_json::json!({
            "contents": [{ "role": "user", "parts": [{"text": req.structured.user}] }],
            "generationConfig": gen_config
        });

        if let Some(cache_name) = ensure_gemini_cached_content(client, req).await? {
            body["cachedContent"] = Value::String(cache_name);
        } else {
            body["systemInstruction"] =
                serde_json::json!({ "parts": [{"text": req.structured.flatten_system()}] });
        }

        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gemini request failed: {e}"))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            if text.to_ascii_lowercase().contains("cachedcontent")
                || text.to_ascii_lowercase().contains("cached content")
            {
                invalidate_gemini_cache(req);
            }
            return Err(format_api_error("Gemini", status, &text));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

        let content = json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No text in Gemini response".to_string())?;

        let usage = match (
            json["usageMetadata"]["promptTokenCount"].as_u64(),
            json["usageMetadata"]["candidatesTokenCount"].as_u64(),
        ) {
            (Some(i), Some(o)) => {
                let cached_input = json["usageMetadata"]["cachedContentTokenCount"]
                    .as_u64()
                    .map(|value| value as u32);
                Some(TokenUsage {
                    input: i as u32,
                    output: o as u32,
                    cached_input,
                    cache_miss_input: cached_input.map(|cached| (i as u32).saturating_sub(cached)),
                })
            }
            _ => None,
        };

        Ok(LlmResponse { content, usage })
    }

    async fn build_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            req.model, req.api_key
        );

        let mut body = serde_json::json!({
            "contents": [{ "role": "user", "parts": [{"text": req.structured.user}] }]
        });

        if let Some(cache_name) = ensure_gemini_cached_content(client, req).await? {
            body["cachedContent"] = Value::String(cache_name);
        } else {
            body["systemInstruction"] =
                serde_json::json!({ "parts": [{"text": req.structured.flatten_system()}] });
        }

        client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gemini request failed: {e}"))
    }
}

fn gemini_cache_config<'a>(req: &'a LlmRequest<'_>) -> Option<&'a GeminiCacheConfig> {
    req.provider_options.as_ref()?.gemini.as_ref()
}

fn gemini_explicit_caching_enabled(req: &LlmRequest<'_>) -> bool {
    gemini_cache_config(req)
        .and_then(|config| config.explicit_caching)
        .unwrap_or(true)
}

fn gemini_cache_ttl_seconds(req: &LlmRequest<'_>) -> u32 {
    gemini_cache_config(req)
        .and_then(|config| config.cache_ttl_seconds)
        .filter(|value| *value > 0)
        .unwrap_or(3600)
}

fn gemini_cache_lookup_key(req: &LlmRequest<'_>) -> String {
    let mut hasher = DefaultHasher::new();
    req.api_key.hash(&mut hasher);
    req.model.hash(&mut hasher);
    req.structured.flatten_system().hash(&mut hasher);
    format!("gemini:{:016x}", hasher.finish())
}

fn gemini_cache_safety_window(req: &LlmRequest<'_>) -> Duration {
    let ttl = gemini_cache_ttl_seconds(req);
    let safety = ttl.saturating_div(10).max(60);
    Duration::from_secs(ttl.saturating_sub(safety) as u64)
}

fn invalidate_gemini_cache(req: &LlmRequest<'_>) {
    let key = gemini_cache_lookup_key(req);
    if let Ok(mut guard) = GEMINI_CACHE_NAMES.lock() {
        guard.remove(&key);
    }
}

async fn ensure_gemini_cached_content(
    client: &Client,
    req: &LlmRequest<'_>,
) -> Result<Option<String>, String> {
    if !gemini_explicit_caching_enabled(req) {
        return Ok(None);
    }

    let system_prompt = req.structured.flatten_system();
    if estimate_tokens(&system_prompt) < min_explicit_cache_tokens(req.model) {
        return Ok(None);
    }

    let cache_key = gemini_cache_lookup_key(req);
    if let Ok(guard) = GEMINI_CACHE_NAMES.lock() {
        if let Some(entry) = guard.get(&cache_key) {
            if entry.created_at.elapsed() < gemini_cache_safety_window(req) {
                log::debug!(
                    "Gemini explicit cache hit model={} cache_name={}",
                    req.model,
                    entry.name
                );
                return Ok(Some(entry.name.clone()));
            }
        }
    }

    let body = json!({
        "model": format!("models/{}", req.model),
        "systemInstruction": { "parts": [{ "text": system_prompt }] },
        "ttl": format!("{}s", gemini_cache_ttl_seconds(req)),
    });

    let resp = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/cachedContents?key={}",
            req.api_key
        ))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini cache creation failed: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Gemini cache response: {e}"))?;

    if !status.is_success() {
        log::warn!(
            "Gemini explicit cache creation failed (status={}); falling back to inline system prompt",
            status
        );
        return Ok(None);
    }

    let json: Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Gemini cache response: {e}"))?;
    let cache_name = json["name"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "Gemini cache creation did not return a cache name".to_string())?;

    log::info!(
        "Gemini explicit cache created model={} cache_name={} ttl_seconds={}",
        req.model,
        cache_name,
        gemini_cache_ttl_seconds(req),
    );

    if let Ok(mut guard) = GEMINI_CACHE_NAMES.lock() {
        guard.insert(
            cache_key,
            GeminiCacheEntry {
                name: cache_name.clone(),
                created_at: Instant::now(),
            },
        );
    }

    Ok(Some(cache_name))
}
