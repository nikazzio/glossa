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

/// OpenAI-compatible provider.
///
/// `use_responses_api = true`  → OpenAI Responses API  (`/v1/responses`)
/// `use_responses_api = false` → Chat Completions API  (`/v1/chat/completions`)
///                               Used for OpenAI-compatible providers such as DeepSeek.
pub struct OpenAiCompatibleProvider {
    id: &'static str,
    display_name: &'static str,
    /// Owned so tests can point it at a local wiremock server.
    base_url: String,
    env_var: &'static str,
    test_model: &'static str,
    use_responses_api: bool,
}

pub fn openai() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        id: "openai",
        display_name: "OpenAI",
        base_url: "https://api.openai.com/v1".to_string(),
        env_var: "OPENAI_API_KEY",
        test_model: "gpt-4.1-mini",
        use_responses_api: true,
    }
}

pub fn deepseek() -> OpenAiCompatibleProvider {
    OpenAiCompatibleProvider {
        id: "deepseek",
        display_name: "DeepSeek",
        base_url: "https://api.deepseek.com".to_string(),
        env_var: "DEEPSEEK_API_KEY",
        test_model: "deepseek-v4-flash",
        use_responses_api: false,
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
        use_responses_api: bool,
    ) -> Self {
        Self {
            id,
            display_name,
            base_url: base_url.to_string(),
            env_var,
            test_model,
            use_responses_api,
        }
    }

    // ── Chat Completions helpers ──────────────────────────────────────────────

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

    /// Attaches reasoning effort to the request body.
    /// Responses API → `reasoning.effort`; Chat Completions → `reasoning_effort`.
    /// No-op when effort is "none", "auto", or unset.
    fn apply_reasoning_effort(&self, req: &LlmRequest<'_>, body: &mut Value) {
        let Some(effort) = self
            .openai_cache_config(req)
            .and_then(|cfg| cfg.reasoning_effort.as_deref())
            .filter(|e| matches!(*e, "none" | "low" | "medium" | "high"))
        else {
            return;
        };

        if self.use_responses_api {
            body["reasoning"] = serde_json::json!({ "effort": effort });
        } else {
            body["reasoning_effort"] = Value::String(effort.to_string());
        }
    }

    /// Attaches prompt_cache_key (and optionally prompt_cache_retention) to a
    /// Chat Completions request body. No-op for the Responses API path.
    fn apply_cache_fields(&self, req: &LlmRequest<'_>, body: &mut Value) {
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

    fn parse_chat_completions_usage(&self, json: &Value) -> Option<TokenUsage> {
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

    // ── Responses API helpers ─────────────────────────────────────────────────

    fn parse_responses_api_usage(&self, json: &Value) -> Option<TokenUsage> {
        let input = json["usage"]["input_tokens"].as_u64()?;
        let output = json["usage"]["output_tokens"].as_u64()?;
        let cached_input = json["usage"]["input_tokens_details"]["cached_tokens"]
            .as_u64()
            .map(|value| value as u32);
        let cache_miss_input =
            cached_input.map(|cached| (input as u32).saturating_sub(cached));
        Some(TokenUsage {
            input: input as u32,
            output: output as u32,
            cached_input,
            cache_miss_input,
        })
    }

    async fn call_responses(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<LlmResponse, String> {
        let url = format!("{}/responses", self.base_url);

        let mut body = serde_json::json!({
            "model": req.model,
            "instructions": req.structured.flatten_system(),
            "input": req.structured.user,
        });

        if req.json_mode {
            body["text"] = serde_json::json!({"format": {"type": "json_object"}});
        }
        self.apply_reasoning_effort(req, &mut body);

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", req.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API request failed: {e}"))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if !status.is_success() {
            return Err(format_api_error("OpenAI", status, &text));
        }

        let json: Value =
            serde_json::from_str(&text).map_err(|e| format!("Failed to parse response: {e}"))?;

        let content = json["output"][0]["content"][0]["text"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "No text in Responses API output".to_string())?;

        let usage = self.parse_responses_api_usage(&json);
        Ok(LlmResponse { content, usage })
    }

    async fn build_responses_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String> {
        let url = format!("{}/responses", self.base_url);

        let mut body = serde_json::json!({
            "model": req.model,
            "instructions": req.structured.flatten_system(),
            "input": req.structured.user,
            "stream": true,
        });
        self.apply_reasoning_effort(req, &mut body);

        client
            .post(&url)
            .header("Authorization", format!("Bearer {}", req.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("API request failed: {e}"))
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
        if self.use_responses_api {
            if json["type"].as_str() != Some("response.output_text.delta") {
                return None;
            }
            return json["delta"].as_str().map(String::from);
        }
        json["choices"][0]["delta"]["content"]
            .as_str()
            .map(String::from)
    }

    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator) {
        let Ok(json) = serde_json::from_str::<Value>(data) else {
            return;
        };

        if self.use_responses_api {
            if json["type"].as_str() != Some("response.completed") {
                return;
            }
            let usage = &json["response"]["usage"];
            if let (Some(i), Some(o)) = (
                usage["input_tokens"].as_u64(),
                usage["output_tokens"].as_u64(),
            ) {
                state.latest_input = Some(i as u32);
                state.latest_output = Some(o as u32);
                state.latest_cached_input = usage["input_tokens_details"]["cached_tokens"]
                    .as_u64()
                    .map(|value| value as u32);
                state.latest_cache_miss_input = state
                    .latest_cached_input
                    .map(|cached| (i as u32).saturating_sub(cached));
            }
            return;
        }

        // Chat Completions path (DeepSeek)
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

    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String> {
        if self.use_responses_api {
            return self.call_responses(client, req).await;
        }

        // Chat Completions path
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
        self.apply_reasoning_effort(req, &mut body);

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

        let usage = self.parse_chat_completions_usage(&json);
        Ok(LlmResponse { content, usage })
    }

    async fn build_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String> {
        if self.use_responses_api {
            return self.build_responses_streaming_request(client, req).await;
        }

        // Chat Completions path
        let url = format!("{}/chat/completions", self.base_url);

        let mut body = serde_json::json!({
            "model": req.model,
            "messages": [
                {"role": "system", "content": req.structured.flatten_system()},
                {"role": "user", "content": req.structured.user}
            ],
            "stream": true,
            "stream_options": {"include_usage": true}
        });
        self.apply_cache_fields(req, &mut body);
        self.apply_reasoning_effort(req, &mut body);

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
