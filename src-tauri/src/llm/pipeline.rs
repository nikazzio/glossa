use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::keystore::get_api_key;
use crate::llm::blobs::{compute_blob_assignments, BlobAssignment, ChunkForBlob};
use crate::llm::custom_profiles;
use crate::llm::prompts::{
    build_coherence_prompts, build_judge_prompts, build_stage_prompts, minimal_pipeline_config,
    parse_judge_rating, sanitize_llm_json_output, REFINE_AUDIT_SYSTEM_PROMPT,
    REFINE_STAGE_SYSTEM_PROMPT,
};
use crate::llm::provider::{LlmProvider, LlmRequest};
use crate::llm::providers::{get_provider, with_retry_after};
use crate::llm::stream::{stream_response, StreamGuard, StreamRegistry, STREAM_CANCELLED_ERROR};
use crate::llm::types::{
    CoherenceChunkInput, CoherenceResponse, JudgeIssue, JudgeResponse, PipelineConfig,
    PreflightCheckInput, PreflightCheckResult, ProviderRuntimeConfig, StageConfig,
};

/// Resolves provider + api_key for a given provider id. Handles both built-in providers
/// and custom endpoint profiles (provider == "custom", custom_provider_id set).
fn resolve_provider(
    app: &AppHandle,
    provider_id: &str,
    custom_profile_id: Option<&str>,
    ollama_base_url: Option<String>,
) -> Result<(Box<dyn LlmProvider>, String), String> {
    if provider_id == "custom" {
        let profile_id =
            custom_profile_id.ok_or("customProviderId is required when provider is 'custom'")?;
        let profile = custom_profiles::get_profile(app, profile_id)?;
        let api_key = if profile.requires_api_key {
            let keystore_id = format!("custom:{profile_id}");
            get_api_key(app, &keystore_id)?
        } else {
            String::new()
        };
        let provider: Box<dyn LlmProvider> = Box::new(
            crate::llm::providers::openai::custom_endpoint(profile.base_url),
        );
        Ok((provider, api_key))
    } else {
        let provider = get_provider(provider_id, ollama_base_url)?;
        let api_key = get_api_key(app, provider_id)?;
        Ok((provider, api_key))
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PromptEvent {
    stream_id: Arc<str>,
    system_prompt: String,
    user_prompt: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ResponseEvent {
    stream_id: Arc<str>,
    kind: String,
    raw_json: String,
}

fn pretty_json(value: &serde_json::Value, fallback: &str) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|e| {
        log::warn!("Failed to pretty-print JSON response: {e}");
        fallback.to_string()
    })
}

fn verified_judge_phrase(value: Option<&str>, reference: &str, field: &str) -> Option<String> {
    let phrase = value?.trim();
    if phrase.is_empty() {
        return None;
    }
    if reference.contains(phrase) {
        return Some(phrase.to_string());
    }

    log::warn!(
        "judge_response.discard_non_verbatim_phrase field={field} phrase_chars={}",
        phrase.len()
    );
    None
}

fn parse_judge_issues(
    parsed: &serde_json::Value,
    source_text: &str,
    target_text: &str,
) -> Vec<JudgeIssue> {
    parsed["issues"]
        .as_array()
        .map(|issues| {
            issues
                .iter()
                .filter_map(|value| {
                    Some(JudgeIssue {
                        issue_type: value["type"].as_str()?.to_string(),
                        severity: value["severity"].as_str()?.to_string(),
                        description: value["description"].as_str()?.to_string(),
                        suggested_fix: value["suggestedFix"].as_str().map(str::to_string),
                        phrase: verified_judge_phrase(
                            value["phrase"].as_str(),
                            target_text,
                            "phrase",
                        ),
                        source_phrase: verified_judge_phrase(
                            value["sourcePhrase"].as_str(),
                            source_text,
                            "sourcePhrase",
                        ),
                        confidence: value["confidence"].as_f64().map(|value| value as f32),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    pub content: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cached_input_tokens: Option<u32>,
    pub cache_miss_input_tokens: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryExtractorPair {
    pub source_phrase: String,
    pub target_phrase: String,
    pub confidence: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryExtractorResponse {
    pub pairs: Vec<MemoryExtractorPair>,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn run_stage(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    audit_context: Option<String>,
    stream_id: String,
    ollama_base_url: Option<String>,
) -> Result<StageResult, String> {
    let stream_id: Arc<str> = stream_id.into();
    let (provider, api_key) = resolve_provider(
        &app,
        &stage.provider,
        stage.custom_provider_id.as_deref(),
        ollama_base_url,
    )?;
    provider.preflight(&stage.model).await?;
    let client = provider.http_client()?;
    let structured = build_stage_prompts(
        &text,
        &stage,
        &config,
        previous_result.as_deref(),
        audit_context.as_deref(),
    );
    app.emit(
        "chunk-prompt",
        PromptEvent {
            stream_id: stream_id.clone(),
            system_prompt: structured.flatten_system(),
            user_prompt: structured.user.clone(),
        },
    )
    .ok();
    let req = LlmRequest {
        model: &stage.model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        json_schema_strict: false,
        provider_options: stage.provider_options.as_ref(),
    };
    let cancel = registry.register(&stream_id);
    let _guard = StreamGuard {
        registry: registry.inner(),
        stream_id: stream_id.clone(),
    };

    if cancel.is_cancelled() {
        return Err(STREAM_CANCELLED_ERROR.to_string());
    }

    log::info!(
        "LLM call starting provider={} model={} stage={} stream_id={}",
        stage.provider,
        stage.model,
        stage.name,
        stream_id
    );
    // Non-streaming providers still run over HTTP. Race the request against
    // the shared cancel token so "Stop" drops the in-flight request here too.
    let response = tokio::select! {
        biased;
        _ = cancel.notify.notified() => {
            return Err(STREAM_CANCELLED_ERROR.to_string());
        }
        result = provider.call(&client, &req) => result?,
    };
    match response.usage.as_ref() {
        Some(usage) => log::info!(
            "LLM call completed provider={} model={} stage={} stream_id={} input_tokens={} output_tokens={} cached_input_tokens={} cache_miss_input_tokens={}",
            stage.provider, stage.model, stage.name, stream_id,
            usage.input, usage.output,
            usage.cached_input.unwrap_or(0),
            usage.cache_miss_input.unwrap_or(0),
        ),
        None => log::info!(
            "LLM call completed provider={} model={} stage={} stream_id={} (no usage data)",
            stage.provider, stage.model, stage.name, stream_id
        ),
    }
    Ok(StageResult {
        content: response.content,
        input_tokens: response.usage.as_ref().map(|u| u.input),
        output_tokens: response.usage.as_ref().map(|u| u.output),
        cached_input_tokens: response.usage.as_ref().and_then(|u| u.cached_input),
        cache_miss_input_tokens: response.usage.as_ref().and_then(|u| u.cache_miss_input),
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagePromptPreview {
    pub system_prompt: String,
    pub user_prompt: String,
}

/// Builds the exact prompt a stage would send, without contacting any provider.
/// Lets the UI show the user what will be sent before they launch the pipeline.
#[tauri::command]
pub fn preview_stage_prompt(
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    audit_context: Option<String>,
) -> StagePromptPreview {
    let structured = build_stage_prompts(
        &text,
        &stage,
        &config,
        previous_result.as_deref(),
        audit_context.as_deref(),
    );
    let system_prompt = structured.flatten_system();
    StagePromptPreview {
        system_prompt,
        user_prompt: structured.user,
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn run_stage_stream(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    stream_id: String,
    ollama_base_url: Option<String>,
) -> Result<String, String> {
    let stream_id: Arc<str> = stream_id.into();
    let (provider, api_key) = resolve_provider(
        &app,
        &stage.provider,
        stage.custom_provider_id.as_deref(),
        ollama_base_url,
    )?;
    provider.preflight(&stage.model).await?;
    let client = provider.streaming_client()?;
    let structured = build_stage_prompts(&text, &stage, &config, previous_result.as_deref(), None);
    app.emit(
        "chunk-prompt",
        PromptEvent {
            stream_id: stream_id.clone(),
            system_prompt: structured.flatten_system(),
            user_prompt: structured.user.clone(),
        },
    )
    .ok();
    let req = LlmRequest {
        model: &stage.model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        json_schema_strict: false,
        provider_options: stage.provider_options.as_ref(),
    };

    let cancel = registry.register(&stream_id);
    let _guard = StreamGuard {
        registry: registry.inner(),
        stream_id: stream_id.clone(),
    };

    if cancel.is_cancelled() {
        return Err(STREAM_CANCELLED_ERROR.to_string());
    }

    log::info!(
        "LLM stream starting provider={} model={} stage={} stream_id={}",
        stage.provider,
        stage.model,
        stage.name,
        stream_id
    );
    let resp = provider.build_streaming_request(&client, &req).await?;
    let status = resp.status();
    let response_headers = resp.headers().clone();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_else(|e| {
            log::warn!("Failed to read error response body: {e}");
            String::new()
        });
        return Err(with_retry_after(
            provider.format_http_error(status, &text),
            &response_headers,
        ));
    }

    let result = stream_response(
        &app,
        resp,
        provider.as_ref(),
        &stream_id,
        &cancel,
        &stage.model,
    )
    .await?;
    Ok(result.content)
}

/// Mark a streaming request as cancelled. Idempotent and safe to call
/// after the stream has finished — unknown ids are ignored.
#[tauri::command]
pub fn cancel_stream(registry: State<'_, StreamRegistry>, stream_id: String) {
    registry.cancel(&stream_id);
}

#[tauri::command]
pub async fn judge_translation(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    source_text: String,
    translation: String,
    config: PipelineConfig,
    stream_id: String,
    ollama_base_url: Option<String>,
) -> Result<JudgeResponse, String> {
    let stream_id: Arc<str> = stream_id.into();
    let provider = get_provider(&config.judge_provider, ollama_base_url)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.http_client()?;
    let structured = build_judge_prompts(&source_text, &translation, &config);
    app.emit(
        "chunk-prompt",
        PromptEvent {
            stream_id: stream_id.clone(),
            system_prompt: structured.flatten_system(),
            user_prompt: structured.user.clone(),
        },
    )
    .ok();
    let req = LlmRequest {
        model: &config.judge_model,
        structured: &structured,
        api_key: &api_key,
        json_mode: true,
        json_schema_strict: true,
        provider_options: config.review_provider_options.as_ref(),
    };

    let cancel = registry.register(&stream_id);
    let _guard = StreamGuard {
        registry: registry.inner(),
        stream_id: stream_id.clone(),
    };

    if cancel.is_cancelled() {
        return Err(STREAM_CANCELLED_ERROR.to_string());
    }

    let response = tokio::select! {
        biased;
        _ = cancel.notify.notified() => {
            return Err(STREAM_CANCELLED_ERROR.to_string());
        }
        result = provider.call(&client, &req) => result?,
    };
    let result_text = response.content;
    let usage = response.usage;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = match serde_json::from_str(sanitized) {
        Ok(v) => {
            app.emit(
                "chunk-response",
                ResponseEvent {
                    stream_id: stream_id.clone(),
                    kind: "judge".to_string(),
                    raw_json: pretty_json(&v, sanitized),
                },
            )
            .ok();
            v
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            {
                let preview: String = result_text.chars().take(500).collect();
                let truncated = if result_text.chars().nth(500).is_some() {
                    "…"
                } else {
                    ""
                };
                log::warn!("Failed to parse judge JSON: {e}. Preview: {preview}{truncated}");
            }
            #[cfg(not(debug_assertions))]
            log::warn!("Failed to parse judge JSON: {e}");
            return Err(format!("Failed to parse judge JSON: {e}"));
        }
    };

    let rating = parse_judge_rating(&parsed).map_err(|error| {
        log::warn!("judge_response.invalid_rating error={error}");
        error
    })?;
    let issues = parse_judge_issues(&parsed, &source_text, &translation);

    Ok(JudgeResponse {
        rating,
        issues,
        content: translation,
        input_tokens: usage.as_ref().map(|u| u.input),
        output_tokens: usage.as_ref().map(|u| u.output),
        cached_input_tokens: usage.as_ref().and_then(|u| u.cached_input),
        cache_miss_input_tokens: usage.as_ref().and_then(|u| u.cache_miss_input),
        system_prompt: None,
        user_prompt: None,
        checked_sentences: parsed["checkedSentences"].as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        }),
    })
}

#[tauri::command]
pub async fn refine_prompt(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    context: String,
    ollama_base_url: Option<String>,
) -> Result<String, String> {
    let prov = get_provider(&provider, ollama_base_url)?;
    prov.preflight(&model).await?;
    let api_key = get_api_key(&app, &provider)?;
    let client = prov.http_client()?;
    let system_text = if context == "audit" {
        REFINE_AUDIT_SYSTEM_PROMPT
    } else {
        REFINE_STAGE_SYSTEM_PROMPT
    };
    let refine_config = minimal_pipeline_config(Some(ProviderRuntimeConfig {
        ollama: Some(crate::llm::providers::ollama::default_ollama_config()),
        openai: None,
        deepseek: None,
        gemini: None,
        deepl: None,
    }));
    let structured = crate::llm::types::StructuredPrompt {
        system: vec![crate::llm::types::PromptBlock {
            text: system_text.to_string(),
            cacheable: true,
        }],
        user: format!("Rewrite this prompt professionally:\n\n{prompt}"),
    };
    let req = LlmRequest {
        model: &model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        json_schema_strict: false,
        provider_options: refine_config.review_provider_options.as_ref(),
    };
    prov.call(&client, &req).await.map(|r| r.content)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn extract_phrase_memory_pairs(
    app: AppHandle,
    provider: String,
    model: String,
    prompt: String,
    source_text: String,
    target_text: String,
    source_language: String,
    target_language: String,
    ollama_base_url: Option<String>,
) -> Result<MemoryExtractorResponse, String> {
    let prov = get_provider(&provider, ollama_base_url)?;
    prov.preflight(&model).await?;
    let api_key = get_api_key(&app, &provider)?;
    let client = prov.http_client()?;
    let structured = crate::llm::types::StructuredPrompt {
        system: vec![crate::llm::types::PromptBlock {
            text: prompt,
            cacheable: false,
        }],
        user: format!(
            "Source language: {source_language}\nTarget language: {target_language}\n\nOriginal source chunk:\n<<<SOURCE\n{source_text}\nSOURCE>>>\n\nFinal/current translation:\n<<<TARGET\n{target_text}\nTARGET>>>\n\nReturn JSON only with key \"pairs\"."
        ),
    };
    let req = LlmRequest {
        model: &model,
        structured: &structured,
        api_key: &api_key,
        json_mode: true,
        json_schema_strict: false,
        provider_options: None,
    };

    let result_text = prov.call(&client, &req).await?.content;
    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = serde_json::from_str(sanitized)
        .map_err(|e| format!("Failed to parse phrase memory JSON: {e}"))?;
    let pairs = parsed["pairs"]
        .as_array()
        .ok_or_else(|| "Phrase memory extractor returned JSON without a pairs array".to_string())?;

    let validated = pairs
        .iter()
        .filter_map(|entry| {
            let source_phrase = entry["sourcePhrase"].as_str()?.trim();
            let target_phrase = entry["targetPhrase"].as_str()?.trim();
            if source_phrase.is_empty() || target_phrase.is_empty() {
                return None;
            }
            if !source_text.contains(source_phrase) || !target_text.contains(target_phrase) {
                log::warn!(
                    "phrase_memory.extract_pairs.discard_non_verbatim source_chars={} target_chars={}",
                    source_phrase.len(),
                    target_phrase.len()
                );
                return None;
            }
            let confidence = entry["confidence"].as_f64()?.clamp(0.0, 1.0);
            Some(MemoryExtractorPair {
                source_phrase: source_phrase.to_string(),
                target_phrase: target_phrase.to_string(),
                confidence,
            })
        })
        .collect();

    Ok(MemoryExtractorResponse { pairs: validated })
}

#[tauri::command]
pub async fn run_coherence_for_chunk(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    input: CoherenceChunkInput,
    config: PipelineConfig,
    stream_id: String,
    ollama_base_url: Option<String>,
) -> Result<CoherenceResponse, String> {
    let stream_id: Arc<str> = stream_id.into();
    let provider = get_provider(&config.judge_provider, ollama_base_url)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.http_client()?;
    let structured = build_coherence_prompts(&input, &config);
    app.emit(
        "chunk-prompt",
        PromptEvent {
            stream_id: stream_id.clone(),
            system_prompt: structured.flatten_system(),
            user_prompt: structured.user.clone(),
        },
    )
    .ok();
    let req = LlmRequest {
        model: &config.judge_model,
        structured: &structured,
        api_key: &api_key,
        json_mode: true,
        json_schema_strict: false,
        provider_options: config.review_provider_options.as_ref(),
    };

    let cancel = registry.register(&stream_id);
    let _guard = StreamGuard {
        registry: registry.inner(),
        stream_id: stream_id.clone(),
    };

    if cancel.is_cancelled() {
        return Err(STREAM_CANCELLED_ERROR.to_string());
    }

    let response = tokio::select! {
        biased;
        _ = cancel.notify.notified() => {
            return Err(STREAM_CANCELLED_ERROR.to_string());
        }
        result = provider.call(&client, &req) => result?,
    };
    let result_text = response.content;
    let usage = response.usage;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = match serde_json::from_str(sanitized) {
        Ok(v) => {
            app.emit(
                "chunk-response",
                ResponseEvent {
                    stream_id: stream_id.clone(),
                    kind: "coherence".to_string(),
                    raw_json: pretty_json(&v, sanitized),
                },
            )
            .ok();
            v
        }
        Err(e) => {
            return Err(format!("Failed to parse coherence JSON: {e}"));
        }
    };

    let issues = parse_judge_issues(&parsed, &input.original, &input.translation);

    Ok(CoherenceResponse {
        issues,
        input_tokens: usage.as_ref().map(|u| u.input),
        output_tokens: usage.as_ref().map(|u| u.output),
        cached_input_tokens: usage.as_ref().and_then(|u| u.cached_input),
        cache_miss_input_tokens: usage.as_ref().and_then(|u| u.cache_miss_input),
        system_prompt: None,
        user_prompt: None,
    })
}

#[tauri::command]
pub async fn test_provider_connection(
    app: AppHandle,
    provider: String,
    ollama_base_url: Option<String>,
) -> Result<bool, String> {
    if provider == "ollama" {
        let status =
            crate::llm::providers::ollama::check_ollama_preflight(None, ollama_base_url).await?;
        if !status.reachable {
            return Err("Ollama is not running".into());
        }
        if status.models.is_empty() {
            return Err(
                "Ollama is running but no models are installed. Pull a model before using local inference."
                    .into(),
            );
        }
        return Ok(true);
    }

    let prov = get_provider(&provider, None)?;
    let api_key = get_api_key(&app, &provider)?;
    let client = prov.http_client()?;
    let structured = crate::llm::types::StructuredPrompt {
        system: vec![crate::llm::types::PromptBlock {
            text: "You are a test assistant.".to_string(),
            cacheable: false,
        }],
        user: "Reply with exactly: OK".to_string(),
    };
    let req = LlmRequest {
        model: prov.default_test_model(),
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        json_schema_strict: false,
        provider_options: None,
    };

    match prov.call(&client, &req).await {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

/// Run pre-flight connectivity checks for a set of (provider, model) pairs before
/// starting a pipeline run. Each entry is checked independently:
/// - Ollama: verifies reachability and that the specific model is installed.
/// - Cloud providers: verifies the API key is configured and makes a lightweight
///   test call to confirm the key is valid and the provider is reachable.
///
/// Returns one result per input entry (order preserved). The caller is responsible
/// for deduplicating entries before calling this command.
#[tauri::command]
pub async fn preflight_pipeline(
    app: AppHandle,
    checks: Vec<PreflightCheckInput>,
    ollama_base_url: Option<String>,
) -> Result<Vec<PreflightCheckResult>, String> {
    let mut results = Vec::new();
    for check in checks {
        let (ok, error, available_models, reachable) = if check.provider == "ollama" {
            match run_ollama_preflight_check(&check.model, ollama_base_url.clone()).await {
                Ok(models) => (true, None, Some(models), Some(true)),
                Err((is_reachable, e, models)) => (
                    false,
                    Some(e),
                    if models.is_empty() {
                        None
                    } else {
                        Some(models)
                    },
                    Some(is_reachable),
                ),
            }
        } else {
            match run_cloud_preflight_check(&app, &check.provider).await {
                Ok(()) => (true, None, None, None),
                Err(e) => (false, Some(e), None, None),
            }
        };
        results.push(PreflightCheckResult {
            provider: check.provider,
            model: check.model,
            label: check.label,
            ok,
            error,
            available_models,
            reachable,
        });
    }
    Ok(results)
}

// Returns Err((reachable, error_msg, models)) so callers can distinguish "offline"
// from "model not installed" and always get the installed model list when Ollama
// is reachable (even on failure), so the UI model picker can refresh.
async fn run_ollama_preflight_check(
    model: &str,
    ollama_base_url: Option<String>,
) -> Result<Vec<String>, (bool, String, Vec<String>)> {
    let status = crate::llm::providers::ollama::check_ollama_preflight(
        Some(model.to_string()),
        ollama_base_url,
    )
    .await
    .map_err(|e| (false, e, vec![]))?;
    if !status.reachable {
        return Err((false, "Ollama is not running".into(), vec![]));
    }
    if !status.model_available {
        return Err((
            true,
            format!("Model \"{model}\" is not installed locally"),
            status.models,
        ));
    }
    Ok(status.models)
}

/// For cloud providers only the API key presence is verified — no inference call
/// is made so the check is free and fast. An invalid or expired key will surface
/// naturally on the first real translation request.
async fn run_cloud_preflight_check(app: &AppHandle, provider: &str) -> Result<(), String> {
    get_api_key(app, provider)?;
    Ok(())
}

/// Pure computation: assigns each chunk to a blob based on token budget.
/// Called by the frontend before starting a pipeline run when blob assignments
/// are missing or stale. Returns one assignment per chunk.
#[tauri::command]
pub fn compute_blobs(
    chunks: Vec<ChunkForBlob>,
    budget_tokens: usize,
    overlap: usize,
) -> Vec<BlobAssignment> {
    compute_blob_assignments(&chunks, budget_tokens, overlap)
}
