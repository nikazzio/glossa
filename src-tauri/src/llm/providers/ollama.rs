use async_trait::async_trait;
use reqwest::Client;
use serde_json::{Map, Value};
use std::{
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{
    format_transport_error, ollama_stream_timeouts, with_stream_header_timeout, StreamTimeouts,
    OLLAMA_HTTP_CLIENT, OLLAMA_STREAMING_HTTP_CLIENT,
};
use crate::llm::types::{OllamaConfig, OllamaPreflightStatus};

const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const OLLAMA_PREFLIGHT_CACHE_TTL_SECS: u64 = 5;

static OLLAMA_PREFLIGHT_CACHE: LazyLock<Mutex<Option<CachedOllamaPreflight>>> =
    LazyLock::new(|| Mutex::new(None));

#[derive(Debug, Clone)]
struct CachedOllamaPreflight {
    fetched_at: Instant,
    reachable: bool,
    models: Vec<String>,
}

pub struct OllamaProvider;

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn id(&self) -> &'static str {
        "ollama"
    }

    fn display_name(&self) -> &'static str {
        "Ollama"
    }

    fn api_key_env_var(&self) -> Option<&'static str> {
        None
    }

    fn default_test_model(&self) -> &'static str {
        ""
    }

    fn stream_format(&self) -> StreamFormat {
        StreamFormat::NewlineJson
    }

    fn stream_timeouts(&self) -> StreamTimeouts {
        ollama_stream_timeouts()
    }

    fn http_client(&self) -> Result<Client, String> {
        Ok(OLLAMA_HTTP_CLIENT.clone())
    }

    fn streaming_client(&self) -> Result<Client, String> {
        Ok(OLLAMA_STREAMING_HTTP_CLIENT.clone())
    }

    fn extract_streaming_token(&self, data: &str) -> Option<String> {
        let json: Value = serde_json::from_str(data).ok()?;
        json["message"]["content"].as_str().map(String::from)
    }

    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
        if let Ok(json) = serde_json::from_str::<Value>(data) {
            if let Some((i, o)) = parse_ollama_usage(&json) {
                state.latest_input = Some(i);
                state.latest_output = Some(o);
            }
        }
    }

    fn format_http_error(&self, status: reqwest::StatusCode, body: &str) -> String {
        format_ollama_api_error(status, body)
    }

    async fn preflight(&self, model: &str) -> Result<(), String> {
        ensure_ollama_model_ready(model).await
    }

    fn finalize_buffer(&self, buffer: &str) -> Option<String> {
        let trimmed = buffer.trim();
        if trimmed.is_empty() {
            return None;
        }
        let json: Value = serde_json::from_str(trimmed).ok()?;
        let text = json["message"]["content"].as_str()?;
        Some(text.to_string())
    }

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        let ollama = req
            .provider_options
            .and_then(|o| o.ollama.as_ref())
            .map(|c| merge_ollama_config(None, Some(c)))
            .unwrap_or_else(default_ollama_config);

        let body = build_ollama_chat_body(
            req.model,
            req.system_prompt,
            req.user_prompt,
            &ollama,
            false,
            req.json_mode,
        );

        let resp = client
            .post(format!("{OLLAMA_BASE_URL}/api/chat"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format_transport_error("ollama", "chat request", e))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format_transport_error("ollama", "response read", e))?;

        if !status.is_success() {
            return Err(format_ollama_api_error(status, &text));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

        let content = json["message"]["content"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No content in Ollama response".to_string())?;

        let usage = parse_ollama_usage(&json).map(|(i, o)| TokenUsage { input: i, output: o });

        Ok(LlmResponse { content, usage })
    }

    async fn build_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String> {
        let ollama = req
            .provider_options
            .and_then(|o| o.ollama.as_ref())
            .map(|c| merge_ollama_config(None, Some(c)))
            .unwrap_or_else(default_ollama_config);

        let body = build_ollama_chat_body(
            req.model,
            req.system_prompt,
            req.user_prompt,
            &ollama,
            true,
            false,
        );

        with_stream_header_timeout(
            "ollama",
            ollama_stream_timeouts().header,
            client
                .post(format!("{OLLAMA_BASE_URL}/api/chat"))
                .json(&body)
                .send(),
            |e| format_transport_error("ollama", "stream request", e),
        )
        .await
    }
}

// ── Ollama config helpers ─────────────────────────────────────────────

pub(crate) fn default_ollama_config() -> OllamaConfig {
    OllamaConfig {
        temperature: Some(0.1),
        top_p: Some(1.0),
        seed: None,
        keep_alive: Some(Value::String("15m".to_string())),
        think: Some(Value::Bool(false)),
        num_ctx: Some(8192),
        num_predict: None,
        use_advanced_options: Some(false),
        advanced_options: Some(Map::new()),
    }
}

pub(crate) fn merge_ollama_config(
    base: Option<&OllamaConfig>,
    override_config: Option<&OllamaConfig>,
) -> OllamaConfig {
    let defaults = default_ollama_config();
    let base = base.cloned().unwrap_or_else(default_ollama_config);
    let override_config = override_config.cloned().unwrap_or(OllamaConfig {
        temperature: None,
        top_p: None,
        seed: None,
        keep_alive: None,
        think: None,
        num_ctx: None,
        num_predict: None,
        use_advanced_options: None,
        advanced_options: None,
    });
    OllamaConfig {
        temperature: override_config
            .temperature
            .or(base.temperature)
            .or(defaults.temperature),
        top_p: override_config.top_p.or(base.top_p).or(defaults.top_p),
        seed: override_config.seed.or(base.seed).or(defaults.seed),
        keep_alive: override_config
            .keep_alive
            .or(base.keep_alive)
            .or(defaults.keep_alive),
        think: override_config.think.or(base.think).or(defaults.think),
        num_ctx: override_config
            .num_ctx
            .or(base.num_ctx)
            .or(defaults.num_ctx),
        num_predict: override_config
            .num_predict
            .or(base.num_predict)
            .or(defaults.num_predict),
        use_advanced_options: override_config
            .use_advanced_options
            .or(base.use_advanced_options)
            .or(defaults.use_advanced_options),
        advanced_options: Some({
            let mut merged = base.advanced_options.unwrap_or_default();
            if let Some(override_options) = override_config.advanced_options {
                merged.extend(override_options);
            }
            if merged.is_empty() {
                defaults.advanced_options.unwrap_or_default()
            } else {
                merged
            }
        }),
    }
}

pub(crate) fn build_ollama_options(config: &OllamaConfig) -> Map<String, Value> {
    let mut options = Map::new();
    if let Some(temperature) = config.temperature {
        options.insert("temperature".to_string(), serde_json::json!(temperature));
    }
    if let Some(top_p) = config.top_p {
        options.insert("top_p".to_string(), serde_json::json!(top_p));
    }
    if let Some(seed) = config.seed {
        options.insert("seed".to_string(), serde_json::json!(seed));
    }
    if let Some(num_ctx) = config.num_ctx {
        options.insert("num_ctx".to_string(), serde_json::json!(num_ctx));
    }
    if let Some(num_predict) = config.num_predict {
        options.insert("num_predict".to_string(), serde_json::json!(num_predict));
    }
    if config.use_advanced_options == Some(true) {
        if let Some(advanced) = &config.advanced_options {
            options.extend(advanced.clone());
        }
    }
    options
}

pub(crate) fn build_ollama_chat_body(
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    ollama: &OllamaConfig,
    stream: bool,
    json_mode: bool,
) -> Value {
    let options = build_ollama_options(ollama);
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": stream,
        "options": options,
    });

    if let Some(think) = ollama.think.clone() {
        body["think"] = think;
    }
    if let Some(keep_alive) = ollama.keep_alive.clone() {
        body["keep_alive"] = keep_alive;
    }
    if json_mode {
        body["format"] = serde_json::json!("json");
    }

    body
}

pub(crate) fn parse_ollama_usage(json: &Value) -> Option<(u32, u32)> {
    match (
        json["prompt_eval_count"].as_u64(),
        json["eval_count"].as_u64(),
    ) {
        (Some(input), Some(output)) => Some((input as u32, output as u32)),
        _ => None,
    }
}

fn format_ollama_api_error(status: reqwest::StatusCode, body: &str) -> String {
    #[cfg(debug_assertions)]
    log::debug!("Ollama API error body ({status}): {body}");
    #[cfg(not(debug_assertions))]
    let _ = body;

    match status.as_u16() {
        404 => "Ollama model or endpoint not found. Verify that the configured model is installed locally.".to_string(),
        408 => "Ollama timed out while preparing the response. The model may be too large for the available VRAM/CPU budget.".to_string(),
        503 => "Ollama is overloaded and rejected the request. The server queue may be full or the machine may not have enough free memory.".to_string(),
        500..=599 => "Ollama failed while loading or running the model. This usually means insufficient VRAM, a model crash, or a local server fault.".to_string(),
        _ => format!("Ollama API error ({status}): unexpected response"),
    }
}

fn find_matching_ollama_model<'a>(
    models: &'a [String],
    requested_model: &str,
) -> Option<&'a String> {
    models.iter().find(|model| {
        model == &requested_model
            || model.strip_suffix(":latest") == Some(requested_model)
            || requested_model.strip_suffix(":latest") == Some(model.as_str())
    })
}

async fn ensure_ollama_preflight(model: Option<&str>) -> Result<OllamaPreflightStatus, String> {
    let cached = {
        let guard = OLLAMA_PREFLIGHT_CACHE.lock().unwrap();
        guard.as_ref().and_then(|entry| {
            (entry.fetched_at.elapsed() < Duration::from_secs(OLLAMA_PREFLIGHT_CACHE_TTL_SECS))
                .then_some(entry.clone())
        })
    };

    let base = match cached {
        Some(entry) => entry,
        None => {
            let reachable = check_ollama_status().await?;
            let models = if reachable {
                list_ollama_models().await?
            } else {
                vec![]
            };
            let entry = CachedOllamaPreflight {
                fetched_at: Instant::now(),
                reachable,
                models,
            };
            let mut guard = OLLAMA_PREFLIGHT_CACHE.lock().unwrap();
            *guard = Some(entry.clone());
            entry
        }
    };

    if !base.reachable {
        return Ok(OllamaPreflightStatus {
            reachable: false,
            models: vec![],
            requested_model: model.map(ToOwned::to_owned),
            model_available: false,
        });
    }

    let model_available = match model {
        Some(requested) => find_matching_ollama_model(&base.models, requested).is_some(),
        None => !base.models.is_empty(),
    };

    Ok(OllamaPreflightStatus {
        reachable: base.reachable,
        models: base.models,
        requested_model: model.map(ToOwned::to_owned),
        model_available,
    })
}

async fn ensure_ollama_model_ready(model: &str) -> Result<(), String> {
    let status = ensure_ollama_preflight(Some(model)).await?;
    if !status.reachable {
        return Err(
            "Ollama is not reachable on localhost:11434. Start it with 'ollama serve' before running the pipeline."
                .to_string(),
        );
    }
    if status.models.is_empty() {
        return Err(
            "Ollama is reachable but no models are installed. Run 'ollama pull <model>' before starting the pipeline."
                .to_string(),
        );
    }
    if !status.model_available {
        return Err(format!(
            "Ollama model '{model}' is not installed locally. Pull it first or change the configured model."
        ));
    }
    Ok(())
}

// ── Tauri commands (Ollama-specific) ──────────────────────────────────

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    use crate::llm::stream::build_http_client_with_timeout;
    let client = build_http_client_with_timeout(3)?;
    let resp = client
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .send()
        .await
        .map_err(|e| format_transport_error("ollama", "model listing", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format_ollama_api_error(status, &body));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid Ollama response: {e}"))?;

    let models = json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<bool, String> {
    use crate::llm::stream::build_http_client_with_timeout;
    let client = build_http_client_with_timeout(3)?;
    match client.get(format!("{OLLAMA_BASE_URL}/")).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn check_ollama_preflight(
    model: Option<String>,
) -> Result<OllamaPreflightStatus, String> {
    ensure_ollama_preflight(model.as_deref()).await
}
