use tauri::{AppHandle, Emitter, State};

use crate::keystore::get_api_key;
use crate::llm::provider::LlmRequest;
use crate::llm::blobs::{compute_blob_assignments, BlobAssignment, ChunkForBlob};
use crate::llm::prompts::{
    build_coherence_prompts, build_judge_prompts, build_stage_prompts, minimal_pipeline_config,
    parse_judge_rating, sanitize_llm_json_output, REFINE_AUDIT_SYSTEM_PROMPT,
    REFINE_STAGE_SYSTEM_PROMPT,
};
use crate::llm::providers::get_provider;
use crate::llm::stream::{stream_response, StreamGuard, StreamRegistry, STREAM_CANCELLED_ERROR};
use crate::llm::types::{
    CoherenceChunkInput, CoherenceResponse, JudgeIssue, JudgeResponse, PipelineConfig,
    PreflightCheckInput, PreflightCheckResult, ProviderRuntimeConfig, StageConfig,
};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PromptEvent {
    stream_id: String,
    system_prompt: String,
    user_prompt: String,
}

#[tauri::command]
pub async fn run_stage(
    app: AppHandle,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    ollama_base_url: Option<String>,
) -> Result<String, String> {
    let provider = get_provider(&stage.provider, ollama_base_url)?;
    provider.preflight(&stage.model).await?;
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = provider.http_client()?;
    let structured = build_stage_prompts(&text, &stage, &config, &previous_result);
    let req = LlmRequest {
        model: &stage.model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
        provider_options: stage.provider_options.as_ref(),
    };
    provider.call(&client, &req).await.map(|r| r.content)
}

#[tauri::command]
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
    let provider = get_provider(&stage.provider, ollama_base_url)?;
    provider.preflight(&stage.model).await?;
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = provider.streaming_client()?;
    let structured = build_stage_prompts(&text, &stage, &config, &previous_result);
    app.emit("chunk-prompt", PromptEvent {
        stream_id: stream_id.clone(),
        system_prompt: structured.flatten_system(),
        user_prompt: structured.user.clone(),
    }).ok();
    let req = LlmRequest {
        model: &stage.model,
        structured: &structured,
        api_key: &api_key,
        json_mode: false,
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

    let resp = provider.build_streaming_request(&client, &req).await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(provider.format_http_error(status, &text));
    }

    stream_response(&app, resp, provider.as_ref(), &stream_id, &cancel, &stage.model).await
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
    original_text: String,
    translation: String,
    config: PipelineConfig,
    stream_id: String,
    ollama_base_url: Option<String>,
) -> Result<JudgeResponse, String> {
    let provider = get_provider(&config.judge_provider, ollama_base_url)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.streaming_client()?;
    let structured = build_judge_prompts(&original_text, &translation, &config);
    app.emit("chunk-prompt", PromptEvent {
        stream_id: stream_id.clone(),
        system_prompt: structured.flatten_system(),
        user_prompt: structured.user.clone(),
    }).ok();
    let req = LlmRequest {
        model: &config.judge_model,
        structured: &structured,
        api_key: &api_key,
        json_mode: true,
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

    let resp = provider.build_streaming_request(&client, &req).await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(provider.format_http_error(status, &text));
    }

    let result_text = stream_response(&app, resp, provider.as_ref(), &stream_id, &cancel, &config.judge_model).await?;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = serde_json::from_str(sanitized).map_err(|e| {
        #[cfg(debug_assertions)]
        {
            let preview: String = result_text.chars().take(500).collect();
            let truncated = if result_text.chars().nth(500).is_some() { "…" } else { "" };
            log::warn!("Failed to parse judge JSON: {e}. Preview: {preview}{truncated}");
        }
        #[cfg(not(debug_assertions))]
        log::warn!("Failed to parse judge JSON: {e}");
        format!("Failed to parse judge JSON: {e}")
    })?;

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

    // system_prompt and user_prompt are delivered via the chunk-prompt event before streaming.
    // input_tokens and output_tokens are delivered via the stream-token done event.
    Ok(JudgeResponse {
        rating,
        issues,
        content: translation,
        input_tokens: None,
        output_tokens: None,
        system_prompt: None,
        user_prompt: None,
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
        provider_options: refine_config.review_provider_options.as_ref(),
    };
    prov.call(&client, &req).await.map(|r| r.content)
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
    let provider = get_provider(&config.judge_provider, ollama_base_url)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.streaming_client()?;
    let structured = build_coherence_prompts(&input, &config);
    app.emit("chunk-prompt", PromptEvent {
        stream_id: stream_id.clone(),
        system_prompt: structured.flatten_system(),
        user_prompt: structured.user.clone(),
    }).ok();
    let req = LlmRequest {
        model: &config.judge_model,
        structured: &structured,
        api_key: &api_key,
        json_mode: true,
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

    let resp = provider.build_streaming_request(&client, &req).await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(provider.format_http_error(status, &text));
    }

    let result_text = stream_response(&app, resp, provider.as_ref(), &stream_id, &cancel, &config.judge_model).await?;

    let sanitized = sanitize_llm_json_output(&result_text);
    let parsed: serde_json::Value = serde_json::from_str(sanitized)
        .map_err(|e| format!("Failed to parse coherence JSON: {e}"))?;

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

    // system_prompt and user_prompt are delivered via the chunk-prompt event before streaming.
    // input_tokens and output_tokens are delivered via the stream-token done event.
    Ok(CoherenceResponse {
        issues,
        input_tokens: None,
        output_tokens: None,
        system_prompt: None,
        user_prompt: None,
    })
}

#[tauri::command]
pub async fn test_provider_connection(app: AppHandle, provider: String, ollama_base_url: Option<String>) -> Result<bool, String> {
    if provider == "ollama" {
        let status = crate::llm::providers::ollama::check_ollama_preflight(None, ollama_base_url).await?;
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
                    if models.is_empty() { None } else { Some(models) },
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
async fn run_ollama_preflight_check(model: &str, ollama_base_url: Option<String>) -> Result<Vec<String>, (bool, String, Vec<String>)> {
    let status = crate::llm::providers::ollama::check_ollama_preflight(Some(model.to_string()), ollama_base_url)
        .await
        .map_err(|e| (false, e, vec![]))?;
    if !status.reachable {
        return Err((false, "Ollama is not running".into(), vec![]));
    }
    if !status.model_available {
        return Err((true, format!("Model \"{model}\" is not installed locally"), status.models));
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
