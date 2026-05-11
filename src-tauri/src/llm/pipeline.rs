use tauri::{AppHandle, State};

use crate::keystore::get_api_key;
use crate::llm::provider::LlmRequest;
use crate::llm::prompts::{
    build_coherence_prompts, build_judge_prompts, build_stage_prompts, minimal_pipeline_config,
    parse_judge_rating, sanitize_llm_json_output, REFINE_AUDIT_SYSTEM_PROMPT,
    REFINE_STAGE_SYSTEM_PROMPT,
};
use crate::llm::providers::format_api_error;
use crate::llm::providers::get_provider;
use crate::llm::stream::{stream_response, StreamGuard, StreamRegistry, STREAM_CANCELLED_ERROR};
use crate::llm::types::{
    CoherenceChunkInput, CoherenceResponse, JudgeIssue, JudgeResponse, PipelineConfig,
    ProviderRuntimeConfig, StageConfig,
};

#[tauri::command]
pub async fn run_stage(
    app: AppHandle,
    text: String,
    stage: StageConfig,
    config: PipelineConfig,
    previous_result: Option<String>,
    previous_translation: Option<String>,
) -> Result<String, String> {
    let provider = get_provider(&stage.provider)?;
    provider.preflight(&stage.model).await?;
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = provider.http_client()?;
    let (system_prompt, user_prompt) = build_stage_prompts(
        &text,
        &stage,
        &config,
        &previous_result,
        &previous_translation,
    );
    let req = LlmRequest {
        model: &stage.model,
        system_prompt: &system_prompt,
        user_prompt: &user_prompt,
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
    previous_translation: Option<String>,
    stream_id: String,
) -> Result<String, String> {
    let provider = get_provider(&stage.provider)?;
    provider.preflight(&stage.model).await?;
    let api_key = get_api_key(&app, &stage.provider)?;
    let client = provider.streaming_client()?;
    let (system_prompt, user_prompt) = build_stage_prompts(
        &text,
        &stage,
        &config,
        &previous_result,
        &previous_translation,
    );
    let req = LlmRequest {
        model: &stage.model,
        system_prompt: &system_prompt,
        user_prompt: &user_prompt,
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
        return Err(format_api_error(provider.display_name(), status, &text));
    }

    stream_response(&app, resp, provider.as_ref(), &stream_id, &cancel).await
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
    original_text: String,
    translation: String,
    config: PipelineConfig,
) -> Result<JudgeResponse, String> {
    let provider = get_provider(&config.judge_provider)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.http_client()?;
    let (system_prompt, user_prompt) = build_judge_prompts(&original_text, &translation, &config);
    let req = LlmRequest {
        model: &config.judge_model,
        system_prompt: &system_prompt,
        user_prompt: &user_prompt,
        api_key: &api_key,
        json_mode: true,
        provider_options: config.review_provider_options.as_ref(),
    };

    let response = provider.call(&client, &req).await?;
    let result_text = response.content;
    let usage = response.usage;

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

    Ok(JudgeResponse {
        rating,
        issues,
        content: translation,
        input_tokens: usage.as_ref().map(|u| u.input),
        output_tokens: usage.as_ref().map(|u| u.output),
    })
}

#[tauri::command]
pub async fn refine_prompt(
    app: AppHandle,
    prompt: String,
    provider: String,
    model: String,
    context: String,
) -> Result<String, String> {
    let prov = get_provider(&provider)?;
    prov.preflight(&model).await?;
    let api_key = get_api_key(&app, &provider)?;
    let client = prov.http_client()?;
    let system_prompt = if context == "audit" {
        REFINE_AUDIT_SYSTEM_PROMPT
    } else {
        REFINE_STAGE_SYSTEM_PROMPT
    };
    let user_prompt = format!("Rewrite this prompt professionally:\n\n{prompt}");
    let refine_config = minimal_pipeline_config(Some(ProviderRuntimeConfig {
        ollama: Some(crate::llm::providers::ollama::default_ollama_config()),
    }));
    let req = LlmRequest {
        model: &model,
        system_prompt,
        user_prompt: &user_prompt,
        api_key: &api_key,
        json_mode: false,
        provider_options: refine_config.review_provider_options.as_ref(),
    };
    prov.call(&client, &req).await.map(|r| r.content)
}

#[tauri::command]
pub async fn run_coherence_for_chunk(
    app: AppHandle,
    input: CoherenceChunkInput,
    config: PipelineConfig,
) -> Result<CoherenceResponse, String> {
    let provider = get_provider(&config.judge_provider)?;
    provider.preflight(&config.judge_model).await?;
    let api_key = get_api_key(&app, &config.judge_provider)?;
    let client = provider.http_client()?;
    let (system_prompt, user_prompt) = build_coherence_prompts(&input, &config);
    let req = LlmRequest {
        model: &config.judge_model,
        system_prompt: &system_prompt,
        user_prompt: &user_prompt,
        api_key: &api_key,
        json_mode: true,
        provider_options: config.review_provider_options.as_ref(),
    };

    let response = provider.call(&client, &req).await?;
    let result_text = response.content;
    let usage = response.usage;

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

    Ok(CoherenceResponse {
        issues,
        input_tokens: usage.as_ref().map(|u| u.input),
        output_tokens: usage.as_ref().map(|u| u.output),
    })
}

#[tauri::command]
pub async fn test_provider_connection(app: AppHandle, provider: String) -> Result<bool, String> {
    if provider == "ollama" {
        let status = crate::llm::providers::ollama::check_ollama_preflight(None).await?;
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

    let prov = get_provider(&provider)?;
    let api_key = get_api_key(&app, &provider)?;
    let client = prov.http_client()?;
    let req = LlmRequest {
        model: prov.default_test_model(),
        system_prompt: "You are a test assistant.",
        user_prompt: "Reply with exactly: OK",
        api_key: &api_key,
        json_mode: false,
        provider_options: None,
    };

    match prov.call(&client, &req).await {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}
