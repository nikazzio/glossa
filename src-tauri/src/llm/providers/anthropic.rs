use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};
use super::format_api_error;

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
        "claude-3-haiku-latest"
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

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        let system = if req.json_mode {
            format!(
                "{}\nIMPORTANT: Return ONLY valid JSON, with no markdown formatting, code blocks, or extra text.",
                req.system_prompt
            )
        } else {
            req.system_prompt.to_string()
        };

        let body = serde_json::json!({
            "model": req.model,
            "max_tokens": 4096,
            "system": system,
            "messages": [{"role": "user", "content": req.user_prompt}]
        });

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", req.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            return Err(format_api_error("Anthropic", status, &text));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

        let content = json["content"][0]["text"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No text in Anthropic response".to_string())?;

        let usage = match (
            json["usage"]["input_tokens"].as_u64(),
            json["usage"]["output_tokens"].as_u64(),
        ) {
            (Some(i), Some(o)) => Some(TokenUsage {
                input: i as u32,
                output: o as u32,
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
        let body = serde_json::json!({
            "model": req.model,
            "max_tokens": 4096,
            "system": req.system_prompt,
            "messages": [{"role": "user", "content": req.user_prompt}],
            "stream": true
        });

        client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", req.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {e}"))
    }
}
