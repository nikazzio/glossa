use serde::{Deserialize, Serialize};
use reqwest::Client;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

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
    pub score: f64,
    pub issues: Vec<JudgeIssue>,
    pub content: String,
}

// ── API Key management ───────────────────────────────────────────────

fn get_api_key(app: &AppHandle, provider: &str) -> Result<String, String> {
    // Try store first
    let store = app.store("api-keys.json")
        .map_err(|e| format!("Failed to open key store: {e}"))?;

    let store_key = format!("{}_API_KEY", provider.to_uppercase());
    if let Some(val) = store.get(&store_key) {
        if let Some(key) = val.as_str() {
            if !key.is_empty() {
                return Ok(key.to_string());
            }
        }
    }

    // Fallback to environment variable
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
pub async fn save_api_key(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    let store = app.store("api-keys.json")
        .map_err(|e| format!("Failed to open key store: {e}"))?;
    let store_key = format!("{}_API_KEY", provider.to_uppercase());
    store.set(&store_key, serde_json::Value::String(key));
    store.save().map_err(|e| format!("Failed to save key: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn get_api_key_status(app: AppHandle, provider: String) -> Result<bool, String> {
    Ok(get_api_key(&app, &provider).is_ok())
}

// ── Provider implementations ─────────────────────────────────────────

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

    let resp = client.post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
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

/// Route a call to the correct provider
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
        _ => Err(format!("Unsupported provider: {provider}")),
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
         - score: number (0-10)\n\
         - issues: array of objects {{ type: 'glossary'|'fluency'|'accuracy'|'grammar', \
           severity: 'low'|'medium'|'high', description: string, suggestedFix: string }}",
        src = config.source_language,
        tgt = config.target_language,
        instructions = config.judge_prompt,
    );

    let user_prompt = "Perform the audit now and return the JSON report.".to_string();

    (system_prompt, user_prompt)
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
    let client = Client::new();
    let (system_prompt, user_prompt) = build_stage_prompts(&text, &stage, &config, &previous_result);

    call_provider(&client, &stage.provider, &stage.model, &system_prompt, &user_prompt, &api_key, false).await
}

#[tauri::command]
pub async fn judge_translation(
    app: AppHandle,
    original_text: String,
    translation: String,
    config: PipelineConfig,
) -> Result<JudgeResponse, String> {
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = Client::new();
    let (system_prompt, user_prompt) = build_judge_prompts(&original_text, &translation, &config);

    let result_text = call_provider(
        &client, &config.judge_provider, &config.judge_model,
        &system_prompt, &user_prompt, &api_key, true,
    ).await?;

    let parsed: serde_json::Value = serde_json::from_str(&result_text)
        .map_err(|e| format!("Failed to parse judge JSON: {e}. Raw: {result_text}"))?;

    let score = parsed["score"].as_f64().unwrap_or(0.0);
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
        score,
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
    let client = Client::new();

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
    let api_key = get_api_key(&app, &provider)?;
    let client = Client::new();

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
