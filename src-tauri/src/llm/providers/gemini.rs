use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};
use super::format_api_error;

pub struct GeminiProvider;

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

        let body = serde_json::json!({
            "systemInstruction": { "parts": [{"text": req.structured.flatten_system()}] },
            "contents": [{ "role": "user", "parts": [{"text": req.structured.user}] }],
            "generationConfig": gen_config
        });

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
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            req.model, req.api_key
        );

        let body = serde_json::json!({
            "systemInstruction": { "parts": [{"text": req.structured.flatten_system()}] },
            "contents": [{ "role": "user", "parts": [{"text": req.structured.user}] }]
        });

        client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gemini request failed: {e}"))
    }
}
