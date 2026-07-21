use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use super::{format_api_error, translation_audit_schema, with_retry_after};
use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};

/// Whether to attach `cache_control` at all for this request. Opt-in and off by
/// default: unlike OpenAI/Gemini/DeepSeek (automatic prefix caching, no cost
/// tradeoff), Anthropic caching costs a 1.25x-2x write premium on the first
/// hit — worth it only when chunks are worked through close together. Glossa's
/// normal usage (manual review between chunks, sometimes hours apart) would
/// otherwise pay that premium on every call for a cache that never gets read.
fn caching_enabled(req: &LlmRequest<'_>) -> bool {
    req.provider_options
        .as_ref()
        .and_then(|o| o.anthropic.as_ref())
        .and_then(|a| a.enable_caching)
        .unwrap_or(false)
}

/// Whether to request the 1-hour cache TTL instead of the 5-minute default.
/// Only meaningful when `caching_enabled` is true.
fn extended_cache_ttl_enabled(req: &LlmRequest<'_>) -> bool {
    req.provider_options
        .as_ref()
        .and_then(|o| o.anthropic.as_ref())
        .and_then(|a| a.extended_cache_ttl)
        .unwrap_or(false)
}

fn cache_control_value(extended_ttl: bool) -> Value {
    if extended_ttl {
        json!({ "type": "ephemeral", "ttl": "1h" })
    } else {
        json!({ "type": "ephemeral" })
    }
}

/// Build the `system` field for Anthropic requests. Each block in the structured
/// prompt becomes a `{ type: "text", text: "..." }` object. When caching is
/// enabled (`caching_enabled`), blocks marked cacheable receive `cache_control`,
/// telling Anthropic to cache the prefix up to and including that block.
fn build_anthropic_system(req: &LlmRequest<'_>, force_json: bool) -> Value {
    let caching = caching_enabled(req);
    let extended_ttl = extended_cache_ttl_enabled(req);
    let mut blocks: Vec<Value> = req
        .structured
        .system
        .iter()
        .map(|block| {
            let mut obj = json!({ "type": "text", "text": block.text });
            if block.cacheable && caching {
                obj["cache_control"] = cache_control_value(extended_ttl);
            }
            obj
        })
        .collect();

    if force_json {
        // Append the JSON-mode instruction as a non-cacheable trailing block so it
        // doesn't shift the cache boundary of the static prefix above it.
        blocks.push(json!({
            "type": "text",
            "text": "IMPORTANT: Return ONLY valid JSON, with no markdown formatting, code blocks, or extra text."
        }));
    }

    Value::Array(blocks)
}

fn build_anthropic_body(req: &LlmRequest<'_>, stream: bool) -> Value {
    let mut body = json!({
        "model": req.model,
        "max_tokens": max_output_tokens(req),
        "system": build_anthropic_system(req, req.json_mode && !req.json_schema_strict),
        "messages": [{"role": "user", "content": req.structured.user}]
    });

    if stream {
        body["stream"] = json!(true);
    }
    if req.json_schema_strict {
        body["output_config"] = json!({
            "format": {
                "type": "json_schema",
                "schema": translation_audit_schema()
            }
        });
    }
    if let Some(temperature) = temperature_override(req) {
        body["temperature"] = json!(temperature);
    }

    body
}

/// Temperature override for this request, clamped to Anthropic's valid 0.0-1.0
/// range. `None` when unset, letting Anthropic use its own default (1.0).
fn temperature_override(req: &LlmRequest<'_>) -> Option<f32> {
    req.provider_options
        .as_ref()?
        .anthropic
        .as_ref()?
        .temperature
        .map(|t| t.clamp(0.0, 1.0))
}

fn max_output_tokens(req: &LlmRequest<'_>) -> usize {
    const MIN_OUTPUT_TOKENS: usize = 2_048;
    const MAX_OUTPUT_TOKENS: usize = 8_192;
    const OUTPUT_OVERHEAD_TOKENS: usize = 1_024;

    let source_estimate = req.structured.user.chars().count().div_ceil(3);
    (source_estimate + OUTPUT_OVERHEAD_TOKENS).clamp(MIN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
}

fn stop_reason_error(reason: Option<&str>) -> Option<String> {
    match reason {
        Some("end_turn" | "stop_sequence") => None,
        Some("max_tokens") => {
            Some("Anthropic response was truncated at the output token limit".to_string())
        }
        Some(reason) => Some(format!("Anthropic response ended unexpectedly: {reason}")),
        None => Some("Anthropic response is missing a stop reason".to_string()),
    }
}

pub struct AnthropicProvider;

#[async_trait]
impl LlmProvider for AnthropicProvider {
    fn id(&self) -> &'static str {
        "anthropic"
    }

    fn display_name(&self) -> &'static str {
        "Anthropic"
    }

    fn api_key_env_var(&self) -> Option<&'static str> {
        Some("ANTHROPIC_API_KEY")
    }

    fn default_test_model(&self) -> &'static str {
        "claude-haiku-4-5-20251001"
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
        if json["type"].as_str() == Some("content_block_delta") {
            json["delta"]["text"].as_str().map(String::from)
        } else {
            None
        }
    }

    /// Anthropic sends input tokens in `message_start` and output tokens in `message_delta`.
    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
        if let Ok(json) = serde_json::from_str::<Value>(data) {
            match json["type"].as_str() {
                Some("message_start") => {
                    state.pending_input = json["message"]["usage"]["input_tokens"]
                        .as_u64()
                        .map(|n| n as u32);
                    state.latest_cached_input = json["message"]["usage"]["cache_read_input_tokens"]
                        .as_u64()
                        .map(|n| n as u32);
                    state.latest_cache_miss_input = state
                        .pending_input
                        .map(|input| input.saturating_sub(state.latest_cached_input.unwrap_or(0)));
                }
                Some("message_delta") => {
                    if let Some(out) = json["usage"]["output_tokens"].as_u64() {
                        state.latest_input = state.pending_input;
                        state.latest_output = Some(out as u32);
                    }
                }
                _ => {}
            }
        }
    }

    fn streaming_completion_error(&self, data: &str) -> Option<String> {
        let json: Value = serde_json::from_str(data).ok()?;
        if json["type"].as_str() != Some("message_delta") {
            return None;
        }
        stop_reason_error(json["delta"]["stop_reason"].as_str())
    }

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        let body = build_anthropic_body(req, false);

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", req.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "prompt-caching-2024-07-31")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))?;

        let status = resp.status();
        let response_headers = resp.headers().clone();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            return Err(with_retry_after(
                format_api_error("Anthropic", status, &text),
                &response_headers,
            ));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

        if let Some(error) = stop_reason_error(json["stop_reason"].as_str()) {
            return Err(error);
        }

        let content = json["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|block| block["type"].as_str() == Some("text"))
                    .filter_map(|block| block["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .filter(|content| !content.is_empty())
            .ok_or_else(|| "No text in Anthropic response".to_string())?;

        let usage = match (
            json["usage"]["input_tokens"].as_u64(),
            json["usage"]["output_tokens"].as_u64(),
        ) {
            (Some(i), Some(o)) => Some(TokenUsage {
                input: i as u32,
                output: o as u32,
                cached_input: json["usage"]["cache_read_input_tokens"]
                    .as_u64()
                    .map(|n| n as u32),
                cache_miss_input: json["usage"]["cache_read_input_tokens"]
                    .as_u64()
                    .map(|cached| (i as u32).saturating_sub(cached as u32)),
            }),
            _ => None,
        };

        Ok(LlmResponse { content, usage })
    }

    async fn build_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String> {
        let body = build_anthropic_body(req, true);

        client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", req.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "prompt-caching-2024-07-31")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_anthropic_body, build_anthropic_system, max_output_tokens, stop_reason_error,
        temperature_override,
    };
    use crate::llm::provider::LlmRequest;
    use crate::llm::types::{
        AnthropicConfig, PromptBlock, ProviderRuntimeConfig, StructuredPrompt,
    };

    fn request(user: String) -> LlmRequest<'static> {
        request_with_temperature(user, None)
    }

    fn request_with_temperature(user: String, temperature: Option<f32>) -> LlmRequest<'static> {
        request_with_system_and_anthropic_config(
            vec![PromptBlock {
                text: "system".to_string(),
                cacheable: false,
            }],
            user,
            temperature.map(|t| AnthropicConfig {
                temperature: Some(t),
                enable_caching: None,
                extended_cache_ttl: None,
            }),
        )
    }

    fn request_with_system_and_anthropic_config(
        system: Vec<PromptBlock>,
        user: String,
        anthropic: Option<AnthropicConfig>,
    ) -> LlmRequest<'static> {
        let structured = Box::leak(Box::new(StructuredPrompt { system, user }));
        let provider_options = anthropic.map(|anthropic| {
            &*Box::leak(Box::new(ProviderRuntimeConfig {
                ollama: None,
                openai: None,
                deepseek: None,
                gemini: None,
                deepl: None,
                anthropic: Some(anthropic),
            }))
        });
        LlmRequest {
            model: "claude-test",
            structured,
            api_key: "key",
            json_mode: false,
            json_schema_strict: false,
            provider_options,
        }
    }

    #[test]
    fn temperature_override_is_none_when_not_configured() {
        assert_eq!(temperature_override(&request("hi".to_string())), None);
    }

    #[test]
    fn temperature_override_passes_through_value_in_range() {
        assert_eq!(
            temperature_override(&request_with_temperature("hi".to_string(), Some(0.3))),
            Some(0.3)
        );
    }

    #[test]
    fn temperature_override_clamps_out_of_range_values() {
        assert_eq!(
            temperature_override(&request_with_temperature("hi".to_string(), Some(5.0))),
            Some(1.0)
        );
        assert_eq!(
            temperature_override(&request_with_temperature("hi".to_string(), Some(-1.0))),
            Some(0.0)
        );
    }

    #[test]
    fn output_budget_scales_with_request_size_with_safe_bounds() {
        assert_eq!(max_output_tokens(&request("short".to_string())), 2_048);
        assert!(max_output_tokens(&request("x".repeat(12_000))) > 4_096);
        assert_eq!(max_output_tokens(&request("x".repeat(100_000))), 8_192);
    }

    #[test]
    fn max_tokens_stop_reason_is_reported_as_truncation() {
        assert!(stop_reason_error(Some("max_tokens")).is_some());
        assert_eq!(stop_reason_error(Some("end_turn")), None);
    }

    #[test]
    fn strict_json_uses_native_output_schema_without_extra_prompt_instruction() {
        let mut req = request("hi".to_string());
        req.json_mode = true;
        req.json_schema_strict = true;

        let body = build_anthropic_body(&req, false);

        assert_eq!(body["output_config"]["format"]["type"], "json_schema");
        assert_eq!(body["output_config"]["format"]["schema"]["type"], "object");
        assert_eq!(body["system"].as_array().unwrap().len(), 1);
    }

    // ── caching opt-in ──────────────────────────────────────────────────

    fn cacheable_block(text: &str) -> PromptBlock {
        PromptBlock {
            text: text.to_string(),
            cacheable: true,
        }
    }

    #[test]
    fn caching_disabled_by_default_omits_cache_control() {
        let req = request_with_system_and_anthropic_config(
            vec![cacheable_block("static")],
            "hi".to_string(),
            None,
        );
        let system = build_anthropic_system(&req, false);
        assert!(system[0].get("cache_control").is_none());
    }

    #[test]
    fn enable_caching_false_omits_cache_control_even_with_extended_ttl() {
        let req = request_with_system_and_anthropic_config(
            vec![cacheable_block("static")],
            "hi".to_string(),
            Some(AnthropicConfig {
                temperature: None,
                enable_caching: Some(false),
                extended_cache_ttl: Some(true),
            }),
        );
        let system = build_anthropic_system(&req, false);
        assert!(system[0].get("cache_control").is_none());
    }

    #[test]
    fn enable_caching_attaches_default_5m_cache_control() {
        let req = request_with_system_and_anthropic_config(
            vec![cacheable_block("static")],
            "hi".to_string(),
            Some(AnthropicConfig {
                temperature: None,
                enable_caching: Some(true),
                extended_cache_ttl: None,
            }),
        );
        let system = build_anthropic_system(&req, false);
        assert_eq!(
            system[0]["cache_control"],
            serde_json::json!({ "type": "ephemeral" })
        );
    }

    #[test]
    fn enable_caching_with_extended_ttl_requests_1h_cache_control() {
        let req = request_with_system_and_anthropic_config(
            vec![cacheable_block("static")],
            "hi".to_string(),
            Some(AnthropicConfig {
                temperature: None,
                enable_caching: Some(true),
                extended_cache_ttl: Some(true),
            }),
        );
        let system = build_anthropic_system(&req, false);
        assert_eq!(
            system[0]["cache_control"],
            serde_json::json!({ "type": "ephemeral", "ttl": "1h" })
        );
    }

    #[test]
    fn non_cacheable_blocks_never_get_cache_control_even_when_caching_enabled() {
        let req = request_with_system_and_anthropic_config(
            vec![PromptBlock {
                text: "instructions".to_string(),
                cacheable: false,
            }],
            "hi".to_string(),
            Some(AnthropicConfig {
                temperature: None,
                enable_caching: Some(true),
                extended_cache_ttl: None,
            }),
        );
        let system = build_anthropic_system(&req, false);
        assert!(system[0].get("cache_control").is_none());
    }
}
