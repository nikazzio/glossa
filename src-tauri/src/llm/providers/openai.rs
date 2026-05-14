use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};
use super::{format_api_error, provider_label_from_url};

/// OpenAI-compatible provider. Used for both OpenAI and DeepSeek which share the same API shape.
pub struct OpenAiCompatibleProvider {
    id: &'static str,
    display_name: &'static str,
    /// Owned so tests can point it at a local wiremock server.
    base_url: String,
    env_var: &'static str,
    test_model: &'static str,
}

pub fn openai() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        id: "openai",
        display_name: "OpenAI",
        base_url: "https://api.openai.com/v1".to_string(),
        env_var: "OPENAI_API_KEY",
        test_model: "gpt-4o-mini",
    }
}

pub fn deepseek() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        id: "deepseek",
        display_name: "DeepSeek",
        base_url: "https://api.deepseek.com".to_string(),
        env_var: "DEEPSEEK_API_KEY",
        test_model: "deepseek-chat",
    }
}

impl OpenAiCompatibleProvider {
    /// Construct a provider with a custom base URL — used in tests to point
    /// at a local wiremock server without needing `&'static str`.
    #[cfg(test)]
    pub fn new_with_base_url(
        id: &'static str,
        display_name: &'static str,
        base_url: &str,
        env_var: &'static str,
        test_model: &'static str,
    ) -> Self {
        Self {
            id,
            display_name,
            base_url: base_url.to_string(),
            env_var,
            test_model,
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompatibleProvider {
    fn id(&self) -> &'static str {
        self.id
    }

    fn display_name(&self) -> &'static str {
        self.display_name
    }

    fn api_key_env_var(&self) -> Option<&'static str> {
        Some(self.env_var)
    }

    fn default_test_model(&self) -> &'static str {
        self.test_model
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
        json["choices"][0]["delta"]["content"]
            .as_str()
            .map(String::from)
    }

    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
        if let Ok(json) = serde_json::from_str::<Value>(data) {
            if let (Some(i), Some(o)) = (
                json["usage"]["prompt_tokens"].as_u64(),
                json["usage"]["completion_tokens"].as_u64(),
            ) {
                state.latest_input = Some(i as u32);
                state.latest_output = Some(o as u32);
            }
        }
    }

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        let url = format!("{}/chat/completions", self.base_url);

        let mut body = serde_json::json!({
            "model": req.model,
            "messages": [
                {"role": "system", "content": req.structured.flatten_system()},
                {"role": "user", "content": req.structured.user}
            ]
        });

        if req.json_mode {
            body["response_format"] = serde_json::json!({"type": "json_object"});
        }

        let mut request = client.post(&url).json(&body);
        if !req.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", req.api_key));
        }

        let resp = request
            .send()
            .await
            .map_err(|e| format!("API request failed: {e}"))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            return Err(format_api_error(
                provider_label_from_url(&self.base_url),
                status,
                &text,
            ));
        }

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse response: {e}"))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No content in response".to_string())?;

        let usage = match (
            json["usage"]["prompt_tokens"].as_u64(),
            json["usage"]["completion_tokens"].as_u64(),
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
        let url = format!("{}/chat/completions", self.base_url);

        let body = serde_json::json!({
            "model": req.model,
            "messages": [
                {"role": "system", "content": req.structured.flatten_system()},
                {"role": "user", "content": req.structured.user}
            ],
            "stream": true,
            "stream_options": {"include_usage": true}
        });

        let mut request = client.post(&url).json(&body);
        if !req.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", req.api_key));
        }

        request
            .send()
            .await
            .map_err(|e| format!("API request failed: {e}"))
    }
}
