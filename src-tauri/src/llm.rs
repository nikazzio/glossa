use serde::{Deserialize, Serialize};
use reqwest::Client;
use tauri::{AppHandle, Emitter, Manager};
use std::{fs, path::PathBuf, time::Duration};

// ── Types matching frontend ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub term: String,
    pub translation: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageConfig {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub model: String,
    pub provider: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineConfig {
    pub source_language: String,
    pub target_language: String,
    pub stages: Vec<StageConfig>,
    pub judge_prompt: String,
    pub judge_model: String,
    pub judge_provider: String,
    pub glossary: Vec<GlossaryEntry>,
    pub use_chunking: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub severity: String,
    pub description: String,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeResponse {
    pub rating: String,
    pub issues: Vec<JudgeIssue>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamToken {
    stream_id: String,
    token: String,
    done: bool,
}

// ── API Key management (OS Keychain) ─────────────────────────────────

const KEYRING_SERVICE: &str = "io.github.nikazzio.glossa";
const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 120;

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    let username = format!("{}_API_KEY", provider.to_uppercase());
    keyring::Entry::new(KEYRING_SERVICE, &username)
        .map_err(|e| format!("Keyring error: {e}"))
}

fn build_http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(HTTP_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(HTTP_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

fn legacy_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config directory: {e}"))?;
    Ok(config_dir.join("api-keys.json"))
}

fn legacy_store_key(provider: &str) -> String {
    format!("{}_API_KEY", provider.to_uppercase())
}

fn read_legacy_api_key_from_store_value(value: &serde_json::Value, provider: &str) -> Option<String> {
    let store_key = legacy_store_key(provider);
    value[store_key.as_str()]
        .as_str()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
}

fn migrate_from_legacy_store(app: &AppHandle, provider: &str) -> Result<String, String> {
    let store_path = legacy_store_path(app)?;
    if !store_path.exists() {
        return Err("Legacy store not found".into());
    }

    let contents = fs::read_to_string(&store_path)
        .map_err(|e| format!("Failed to read legacy store: {e}"))?;
    let mut parsed: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse legacy store: {e}"))?;

    let key = read_legacy_api_key_from_store_value(&parsed, provider)
        .ok_or_else(|| "Provider key not present in legacy store".to_string())?;

    if let Ok(entry) = keyring_entry(provider) {
        entry
            .set_password(&key)
            .map_err(|e| format!("Failed to migrate legacy key to keychain: {e}"))?;
    }

    if let Some(object) = parsed.as_object_mut() {
        object.remove(&legacy_store_key(provider));
        let serialized = serde_json::to_string_pretty(&parsed)
            .map_err(|e| format!("Failed to rewrite legacy store: {e}"))?;
        fs::write(&store_path, serialized)
            .map_err(|e| format!("Failed to update legacy store: {e}"))?;
    }

    log::info!("Migrated {provider} API key from legacy store to OS keychain");
    Ok(key)
}

fn get_api_key(app: &AppHandle, provider: &str) -> Result<String, String> {
    // Ollama doesn't need an API key
    if provider == "ollama" {
        return Ok(String::new());
    }

    // 1. Try OS keychain
    if let Ok(entry) = keyring_entry(provider) {
        if let Ok(secret) = entry.get_password() {
            if !secret.is_empty() {
                return Ok(secret);
            }
        }
    }

    // 2. Migrate from legacy store if present
    if let Ok(key) = migrate_from_legacy_store(app, provider) {
        return Ok(key);
    }

    // 3. Fallback to environment variable
    let env_key = match provider {
        "gemini" => "GEMINI_API_KEY",
        "openai" => "OPENAI_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        "deepseek" => "DEEPSEEK_API_KEY",
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    std::env::var(env_key)
        .map_err(|_| format!("{env_key} is not configured. Set it in Settings."))
}

#[tauri::command]
pub async fn save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring_entry(&provider)?;
    entry.set_password(&key)
        .map_err(|e| format!("Failed to save to keychain: {e}"))
}

#[tauri::command]
pub async fn get_api_key_status(app: AppHandle, provider: String) -> Result<bool, String> {
    Ok(get_api_key(&app, &provider).is_ok())
}

#[tauri::command]
pub async fn delete_api_key(provider: String) -> Result<(), String> {
    let entry = keyring_entry(&provider)?;
    entry.delete_credential()
        .map_err(|e| format!("Failed to delete from keychain: {e}"))
}

// ── Non-streaming provider implementations ───────────────────────────

async fn call_gemini(
    client: &Client,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    );

    let mut gen_config = serde_json::json!({});
    if json_mode {
        gen_config = serde_json::json!({
            "responseMimeType": "application/json"
        });
    }

    let body = serde_json::json!({
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [{
            "role": "user",
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": gen_config
    });

    let resp = client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Gemini API error ({status}): {text}"));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text in Gemini response".to_string())
}

async fn call_openai_compatible(
    client: &Client,
    base_url: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let url = format!("{base_url}/chat/completions");

    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    });

    if json_mode {
        body["response_format"] = serde_json::json!({"type": "json_object"});
    }

    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {api_key}"));
    }

    let resp = req.send().await
        .map_err(|e| format!("API request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("API error ({status}): {text}"));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No content in response".to_string())
}

async fn call_anthropic(
    client: &Client,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    let system = if json_mode {
        format!("{system_prompt}\nIMPORTANT: Return ONLY valid JSON.")
    } else {
        system_prompt.to_string()
    };

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "messages": [{"role": "user", "content": user_prompt}]
    });

    let resp = client.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Anthropic API error ({status}): {text}"));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

    json["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text in Anthropic response".to_string())
}

/// Route a non-streaming call to the correct provider
async fn call_provider(
    client: &Client,
    provider: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
    json_mode: bool,
) -> Result<String, String> {
    match provider {
        "gemini" => call_gemini(client, model, system_prompt, user_prompt, api_key, json_mode).await,
        "openai" => call_openai_compatible(client, "https://api.openai.com/v1", model, system_prompt, user_prompt, api_key, json_mode).await,
        "deepseek" => call_openai_compatible(client, "https://api.deepseek.com", model, system_prompt, user_prompt, api_key, json_mode).await,
        "anthropic" => call_anthropic(client, model, system_prompt, user_prompt, api_key, json_mode).await,
        "ollama" => call_openai_compatible(client, &format!("{OLLAMA_BASE_URL}/v1"), model, system_prompt, user_prompt, api_key, json_mode).await,
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}

// ── Streaming implementation ─────────────────────────────────────────

/// Extract text token from a streaming SSE data payload based on provider
fn extract_streaming_text(provider: &str, data: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(data).ok()?;

    match provider {
        "gemini" => {
            json["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
        }
        "openai" | "deepseek" | "ollama" => {
            json["choices"][0]["delta"]["content"]
                .as_str()
                .map(|s| s.to_string())
        }
        "anthropic" => {
            if json["type"].as_str() == Some("content_block_delta") {
                json["delta"]["text"]
                    .as_str()
                    .map(|s| s.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Build an HTTP request with streaming enabled for the given provider
async fn build_streaming_request(
    client: &Client,
    provider: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    match provider {
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
            );
            let body = serde_json::json!({
                "systemInstruction": { "parts": [{"text": system_prompt}] },
                "contents": [{ "role": "user", "parts": [{"text": user_prompt}] }]
            });
            client.post(&url).json(&body).send().await
                .map_err(|e| format!("Gemini request failed: {e}"))
        }
        "openai" | "deepseek" | "ollama" => {
            let base_url = match provider {
                "openai" => "https://api.openai.com/v1".to_string(),
                "deepseek" => "https://api.deepseek.com".to_string(),
                "ollama" => format!("{OLLAMA_BASE_URL}/v1"),
                _ => unreachable!(),
            };
            let url = format!("{base_url}/chat/completions");
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": true
            });
            let mut req = client.post(&url).json(&body);
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {api_key}"));
            }
            req.send().await.map_err(|e| format!("API request failed: {e}"))
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
                "stream": true
            });
            client.post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send().await
                .map_err(|e| format!("Anthropic request failed: {e}"))
        }
        _ => Err(format!("Unsupported provider for streaming: {provider}")),
    }
}

/// Read an SSE stream, emit tokens via Tauri events, return the full text
async fn stream_response(
    app: &AppHandle,
    mut resp: reqwest::Response,
    provider: &str,
    stream_id: &str,
) -> Result<String, String> {
    let mut full_text = String::new();
    let mut buffer = String::new();

    loop {
        match resp.chunk().await {
            Ok(Some(bytes)) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                // Process complete SSE lines
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim_end().to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" { continue; }
                        if let Some(text) = extract_streaming_text(provider, data) {
                            if !text.is_empty() {
                                full_text.push_str(&text);
                                let _ = app.emit("stream-token", StreamToken {
                                    stream_id: stream_id.to_string(),
                                    token: text,
                                    done: false,
                                });
                            }
                        }
                    }
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("Stream error: {e}")),
        }
    }

    let _ = app.emit("stream-token", StreamToken {
        stream_id: stream_id.to_string(),
        token: String::new(),
        done: true,
    });

    Ok(full_text)
}

// ── Ollama-specific commands ─────────────────────────────────────────

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
    let client = Client::new();
    let resp = client.get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map_err(|_| "Cannot connect to Ollama. Is it running?".to_string())?;

    if !resp.status().is_success() {
        return Err("Ollama returned an error".into());
    }

    let json: serde_json::Value = resp.json().await
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
    let client = Client::new();
    match client.get(format!("{OLLAMA_BASE_URL}/"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

// ── Prompt builders ──────────────────────────────────────────────────

fn build_stage_prompts(
    text: &str,
    stage: &StageConfig,
    config: &PipelineConfig,
    previous_result: &Option<String>,
) -> (String, String) {
    let glossary_str: String = config.glossary.iter()
        .map(|g| format!("- {} -> {} ({})", g.term, g.translation, g.notes.as_deref().unwrap_or("")))
        .collect::<Vec<_>>()
        .join("\n");

    let system_prompt = format!(
        "You are an expert translator and linguist specialized in {} to {} translation.\n\n\
         Core Instructions:\n{}\n\n\
         Glossary of Terms:\n{}",
        config.source_language,
        config.target_language,
        stage.prompt,
        if glossary_str.is_empty() { "No specific glossary entries.".to_string() } else { glossary_str }
    );

    let user_prompt = match previous_result {
        Some(prev) if !prev.is_empty() => format!(
            "Original: {text}\n\nPrevious Iteration: {prev}\n\n\
             Refine the above translation according to your instructions. Provide ONLY the final text."
        ),
        _ => format!("Text to translate: {text}\n\nProvide ONLY the translated text."),
    };

    (system_prompt, user_prompt)
}

fn build_judge_prompts(
    original_text: &str,
    translation: &str,
    config: &PipelineConfig,
) -> (String, String) {
    let glossary_json = serde_json::to_string(&config.glossary).unwrap_or_default();

    let system_prompt = format!(
        "As a translation quality judge, evaluate the following translation.\n\
         Source ({src}): {original_text}\n\
         Target ({tgt}): {translation}\n\n\
         Specific Audit Instructions:\n{instructions}\n\n\
         Glossary to adhere to: {glossary_json}\n\n\
         You MUST respond with a valid JSON object containing:\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects {{ type: 'glossary'|'fluency'|'accuracy'|'grammar', \
           severity: 'low'|'medium'|'high', description: string, suggestedFix: string }}",
        src = config.source_language,
        tgt = config.target_language,
        instructions = config.judge_prompt,
    );

    let user_prompt = "Perform the audit now and return the JSON report.".to_string();

    (system_prompt, user_prompt)
}

fn parse_judge_rating(parsed: &serde_json::Value) -> String {
    if let Some(raw) = parsed["rating"].as_str() {
        match raw.trim().to_lowercase().as_str() {
            "critical" | "critico" | "critica" => return "critical".to_string(),
            "poor" | "scarso" => return "poor".to_string(),
            "fair" | "sufficiente" | "accettabile" | "discreto" => return "fair".to_string(),
            "good" | "buono" => return "good".to_string(),
            "excellent" | "ottimo" => return "excellent".to_string(),
            _ => {}
        }
    }

    "fair".to_string()
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn run_stage(
    app: AppHandle,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
) -> Result<String, String> {
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) = build_stage_prompts(&text, &stage, &config, &previous_result);

    call_provider(&client, &stage.provider, &stage.model, &system_prompt, &user_prompt, &api_key, false).await
}

#[tauri::command]
pub async fn run_stage_stream(
    app: AppHandle,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    stream_id: String,
) -> Result<String, String> {
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) = build_stage_prompts(&text, &stage, &config, &previous_result);

    let resp = build_streaming_request(
        &client, &stage.provider, &stage.model,
        &system_prompt, &user_prompt, &api_key,
    ).await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API error ({status}): {text}"));
    }

    stream_response(&app, resp, &stage.provider, &stream_id).await
}

#[tauri::command]
pub async fn judge_translation(
    app: AppHandle,
    original_text: String,
    translation: String,
    config: PipelineConfig,
) -> Result<JudgeResponse, String> {
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = build_http_client()?;
    let (system_prompt, user_prompt) = build_judge_prompts(&original_text, &translation, &config);

    let result_text = call_provider(
        &client, &config.judge_provider, &config.judge_model,
        &system_prompt, &user_prompt, &api_key, true,
    ).await?;

    let parsed: serde_json::Value = serde_json::from_str(&result_text)
        .map_err(|e| format!("Failed to parse judge JSON: {e}. Raw: {result_text}"))?;

    let rating = parse_judge_rating(&parsed);
    let issues: Vec<JudgeIssue> = parsed["issues"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    Some(JudgeIssue {
                        issue_type: v["type"].as_str()?.to_string(),
                        severity: v["severity"].as_str()?.to_string(),
                        description: v["description"].as_str()?.to_string(),
                        suggested_fix: v["suggestedFix"].as_str().map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(JudgeResponse {
        rating,
        issues,
        content: translation,
    })
}

#[tauri::command]
pub async fn optimize_prompt(
    app: AppHandle,
    current_prompt: String,
) -> Result<String, String> {
    let api_key = get_api_key(&app, "gemini")?;
    let client = build_http_client()?;

    let user_prompt = format!(
        "The user is using the following prompt for an AI-powered translation pipeline. \
         Analyze the prompt and provide a more effective, professional, and detailed version.\n\n\
         Current Prompt: \"{current_prompt}\"\n\n\
         Provide only the improved prompt text."
    );

    call_gemini(&client, "gemini-3-flash-preview", "", &user_prompt, &api_key, false).await
}

#[tauri::command]
pub async fn test_provider_connection(
    app: AppHandle,
    provider: String,
) -> Result<bool, String> {
    if provider == "ollama" {
        return check_ollama_status().await
            .and_then(|ok| if ok { Ok(true) } else { Err("Ollama is not running".into()) });
    }

    let api_key = get_api_key(&app, &provider)?;
    let client = build_http_client()?;

    let result = call_provider(
        &client, &provider,
        match provider.as_str() {
            "gemini" => "gemini-3-flash-preview",
            "openai" => "gpt-4o-mini",
            "anthropic" => "claude-3-haiku-latest",
            "deepseek" => "deepseek-chat",
            _ => return Err(format!("Unknown provider: {provider}")),
        },
        "You are a test assistant.",
        "Reply with exactly: OK",
        &api_key,
        false,
    ).await;

    match result {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config() -> PipelineConfig {
        PipelineConfig {
            source_language: "English".into(),
            target_language: "Italian".into(),
            stages: vec![],
            judge_prompt: "Evaluate translation quality.".into(),
            judge_model: "gemini-3-flash-preview".into(),
            judge_provider: "gemini".into(),
            glossary: vec![
                GlossaryEntry {
                    term: "API".into(),
                    translation: "API".into(),
                    notes: Some("Keep as-is".into()),
                },
            ],
            use_chunking: Some(true),
        }
    }

    fn make_stage(provider: &str) -> StageConfig {
        StageConfig {
            id: "stg-1".into(),
            name: "Translation".into(),
            prompt: "Translate accurately.".into(),
            model: "test-model".into(),
            provider: provider.into(),
            enabled: true,
        }
    }

    // ── extract_streaming_text ───────────────────────────────────────

    #[test]
    fn extract_gemini_streaming() {
        let data = r#"{"candidates":[{"content":{"parts":[{"text":"Ciao"}]}}]}"#;
        assert_eq!(extract_streaming_text("gemini", data), Some("Ciao".into()));
    }

    #[test]
    fn extract_openai_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(extract_streaming_text("openai", data), Some("Hello".into()));
    }

    #[test]
    fn extract_deepseek_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Bonjour"}}]}"#;
        assert_eq!(extract_streaming_text("deepseek", data), Some("Bonjour".into()));
    }

    #[test]
    fn extract_ollama_streaming() {
        let data = r#"{"choices":[{"delta":{"content":"Hola"}}]}"#;
        assert_eq!(extract_streaming_text("ollama", data), Some("Hola".into()));
    }

    #[test]
    fn extract_anthropic_content_block_delta() {
        let data = r#"{"type":"content_block_delta","delta":{"text":"Guten Tag"}}"#;
        assert_eq!(extract_streaming_text("anthropic", data), Some("Guten Tag".into()));
    }

    #[test]
    fn extract_anthropic_non_delta_returns_none() {
        let data = r#"{"type":"message_start","message":{"id":"msg_1"}}"#;
        assert_eq!(extract_streaming_text("anthropic", data), None);
    }

    #[test]
    fn extract_unknown_provider_returns_none() {
        let data = r#"{"text":"hello"}"#;
        assert_eq!(extract_streaming_text("unknown", data), None);
    }

    #[test]
    fn extract_invalid_json_returns_none() {
        assert_eq!(extract_streaming_text("gemini", "not json"), None);
    }

    #[test]
    fn extract_empty_content_returns_empty_string() {
        let data = r#"{"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(extract_streaming_text("openai", data), Some("".into()));
    }

    #[test]
    fn extract_missing_path_returns_none() {
        let data = r#"{"choices":[]}"#;
        assert_eq!(extract_streaming_text("openai", data), None);
    }

    // ── build_stage_prompts ─────────────────────────────────────────

    #[test]
    fn stage_prompt_without_previous() {
        let config = make_config();
        let stage = make_stage("gemini");
        let (system, user) = build_stage_prompts("Hello world", &stage, &config, &None);

        assert!(system.contains("English to Italian"));
        assert!(system.contains("Translate accurately."));
        assert!(system.contains("API -> API"));
        assert!(user.contains("Hello world"));
        assert!(!user.contains("Previous Iteration"));
    }

    #[test]
    fn stage_prompt_with_previous() {
        let config = make_config();
        let stage = make_stage("openai");
        let prev = Some("Ciao mondo".to_string());
        let (system, user) = build_stage_prompts("Hello world", &stage, &config, &prev);

        assert!(system.contains("English to Italian"));
        assert!(user.contains("Hello world"));
        assert!(user.contains("Ciao mondo"));
        assert!(user.contains("Previous Iteration"));
    }

    #[test]
    fn stage_prompt_empty_glossary() {
        let mut config = make_config();
        config.glossary = vec![];
        let stage = make_stage("gemini");
        let (system, _) = build_stage_prompts("text", &stage, &config, &None);

        assert!(system.contains("No specific glossary entries"));
    }

    #[test]
    fn stage_prompt_multiple_glossary_entries() {
        let mut config = make_config();
        config.glossary = vec![
            GlossaryEntry { term: "API".into(), translation: "API".into(), notes: Some("tech".into()) },
            GlossaryEntry { term: "bug".into(), translation: "errore".into(), notes: None },
        ];
        let stage = make_stage("gemini");
        let (system, _) = build_stage_prompts("text", &stage, &config, &None);

        assert!(system.contains("API -> API (tech)"));
        assert!(system.contains("bug -> errore ()"));
    }

    // ── build_judge_prompts ─────────────────────────────────────────

    #[test]
    fn judge_prompt_includes_source_and_target() {
        let config = make_config();
        let (system, user) = build_judge_prompts("Hello", "Ciao", &config);

        assert!(system.contains("English"));
        assert!(system.contains("Italian"));
        assert!(system.contains("Hello"));
        assert!(system.contains("Ciao"));
        assert!(system.contains("rating"));
        assert!(system.contains("critical"));
        assert!(system.contains("poor"));
        assert!(system.contains("fair"));
        assert!(system.contains("good"));
        assert!(system.contains("excellent"));
        assert!(system.contains("issues"));
        assert!(user.contains("audit"));
    }

    #[test]
    fn judge_prompt_includes_instructions() {
        let config = make_config();
        let (system, _) = build_judge_prompts("src", "tgt", &config);

        assert!(system.contains("Evaluate translation quality."));
    }

    #[test]
    fn judge_prompt_includes_glossary_json() {
        let config = make_config();
        let (system, _) = build_judge_prompts("src", "tgt", &config);

        assert!(system.contains("API"));
        assert!(system.contains("Keep as-is"));
    }

    #[test]
    fn parses_semantic_judge_rating() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "sufficiente"}));
        assert_eq!(parsed, "fair");

        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ottimo"}));
        assert_eq!(parsed, "excellent");
    }

    #[test]
    fn defaults_unknown_judge_rating_to_fair() {
        let parsed = parse_judge_rating(&serde_json::json!({"rating": "ambiguous"}));
        assert_eq!(parsed, "fair");
    }

    #[test]
    fn builds_http_client_with_timeouts() {
        let client = build_http_client();
        assert!(client.is_ok());
    }

    #[test]
    fn reads_legacy_api_key_from_store_file_contents() {
        let value = serde_json::json!({
            "OPENAI_API_KEY": "legacy-secret",
            "GEMINI_API_KEY": "other-secret"
        });

        let parsed = read_legacy_api_key_from_store_value(&value, "openai");
        assert_eq!(parsed, Some("legacy-secret".into()));
    }

    #[test]
    fn ignores_empty_legacy_api_keys() {
        let value = serde_json::json!({
            "OPENAI_API_KEY": ""
        });

        let parsed = read_legacy_api_key_from_store_value(&value, "openai");
        assert_eq!(parsed, None);
    }

    // ── Serialization ───────────────────────────────────────────────

    #[test]
    fn glossary_entry_deserializes() {
        let json = r#"{"term":"API","translation":"API","notes":"Keep"}"#;
        let entry: GlossaryEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.term, "API");
        assert_eq!(entry.notes, Some("Keep".into()));
    }

    #[test]
    fn judge_issue_serializes_type_as_type() {
        let issue = JudgeIssue {
            issue_type: "fluency".into(),
            severity: "low".into(),
            description: "Minor".into(),
            suggested_fix: None,
        };
        let json = serde_json::to_string(&issue).unwrap();
        assert!(json.contains(r#""type":"fluency"#));
        assert!(!json.contains("issue_type"));
    }

    #[test]
    fn stream_token_serializes_camel_case() {
        let token = StreamToken {
            stream_id: "s1".into(),
            token: "hi".into(),
            done: false,
        };
        let json = serde_json::to_string(&token).unwrap();
        assert!(json.contains("streamId"));
        assert!(!json.contains("stream_id"));
    }

    #[test]
    fn pipeline_config_roundtrip() {
        let config = make_config();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: PipelineConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.source_language, "English");
        assert_eq!(parsed.glossary.len(), 1);
    }

    // ── call_provider routing ───────────────────────────────────────

    #[tokio::test]
    async fn call_provider_rejects_unknown() {
        let client = Client::new();
        let result = call_provider(&client, "fake_provider", "m", "s", "u", "k", false).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported provider"));
    }
}
