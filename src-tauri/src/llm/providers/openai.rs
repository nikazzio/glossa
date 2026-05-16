use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use super::{format_api_error, provider_label_from_url};
use crate::llm::provider::{
    LlmProvider, LlmRequest, LlmResponse, StreamFormat, TokenUsage, UsageAccumulator,
};
use crate::llm::stream::{build_default_http_client, default_stream_timeouts, StreamTimeouts};
use crate::llm::types::OpenAiCacheConfig;

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

    fn derive_prompt_cache_key(&self, req: &LlmRequest<'_>) -> String {
        let mut hasher = DefaultHasher::new();
        self.id.hash(&mut hasher);
        req.model.hash(&mut hasher);
        req.structured.flatten_system().hash(&mut hasher);
        format!("glossa:{:016x}", hasher.finish())
    }

    fn openai_cache_config<'a>(&self, req: &'a LlmRequest<'_>) -> Option<&'a OpenAiCacheConfig> {
        if self.id == "openai" {
            req.provider_options.as_ref()?.openai.as_ref()
        } else if self.id == "deepseek" {
            req.provider_options.as_ref()?.deepseek.as_ref()
        } else {
            None
        }
    }

    fn apply_cache_fields(&self, req: &LlmRequest<'_>, body: &mut Value) {
        if self.id != "openai" && self.id != "deepseek" {
            return;
        }

        let cfg = self.openai_cache_config(req);
        let cache_key = cfg
            .and_then(|value| value.prompt_cache_key.as_ref())
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| self.derive_prompt_cache_key(req));
        body["prompt_cache_key"] = Value::String(cache_key);

        if self.id == "openai" {
            if let Some(retention) = cfg
                .and_then(|value| value.prompt_cache_retention.as_ref())
                .filter(|value| matches!(value.as_str(), "in_memory" | "24h"))
            {
                body["prompt_cache_retention"] = Value::String(retention.clone());
            }
        }
    }

    fn parse_usage(&self, json: &Value) -> Option<TokenUsage> {
        let input = json["usage"]["prompt_tokens"].as_u64()?;
        let output = json["usage"]["completion_tokens"].as_u64()?;
        let cached_input = if self.id == "deepseek" {
            json["usage"]["prompt_cache_hit_tokens"]
                .as_u64()
                .map(|value| value as u32)
        } else {
            json["usage"]["prompt_tokens_details"]["cached_tokens"]
                .as_u64()
                .map(|value| value as u32)
        };
        let cache_miss_input = if self.id == "deepseek" {
            json["usage"]["prompt_cache_miss_tokens"]
                .as_u64()
                .map(|value| value as u32)
        } else {
            cached_input.map(|cached| (input as u32).saturating_sub(cached))
        };

        Some(TokenUsage {
            input: input as u32,
            output: output as u32,
            cached_input,
            cache_miss_input,
        })
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
                state.latest_cached_input = if self.id == "deepseek" {
                    json["usage"]["prompt_cache_hit_tokens"]
                        .as_u64()
                        .map(|value| value as u32)
                } else {
                    json["usage"]["prompt_tokens_details"]["cached_tokens"]
                        .as_u64()
                        .map(|value| value as u32)
                };
                state.latest_cache_miss_input = if self.id == "deepseek" {
                    json["usage"]["prompt_cache_miss_tokens"]
                        .as_u64()
                        .map(|value| value as u32)
                } else {
                    state
                        .latest_cached_input
                        .map(|cached| (i as u32).saturating_sub(cached))
                };
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
        self.apply_cache_fields(req, &mut body);

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

        let json: Value =
            serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {e}"))?;

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No content in response".to_string())?;

        let usage = self.parse_usage(&json);

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
        let mut body = body;
        self.apply_cache_fields(req, &mut body);

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
