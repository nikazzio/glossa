use async_trait::async_trait;
use reqwest::Client;

use crate::llm::stream::StreamTimeouts;
use crate::llm::types::ProviderRuntimeConfig;

#[derive(Debug, Clone)]
pub struct TokenUsage {
    pub input: u32,
    pub output: u32,
}

pub struct LlmRequest<'a> {
    pub model: &'a str,
    pub system_prompt: &'a str,
    pub user_prompt: &'a str,
    pub api_key: &'a str,
    pub json_mode: bool,
    pub provider_options: Option<&'a ProviderRuntimeConfig>,
}

#[derive(Debug)]
pub struct LlmResponse {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamFormat {
    Sse,
    NewlineJson,
}

/// Tracks token usage across a streaming session.
///
/// `pending_input` handles providers that emit input tokens in one event and output in another
/// (Anthropic sends `message_start` with input tokens, then `message_delta` with output tokens).
#[derive(Default)]
pub struct UsageAccumulator {
    pub latest_input: Option<u32>,
    pub latest_output: Option<u32>,
    pub pending_input: Option<u32>,
}

impl UsageAccumulator {
    pub fn final_usage(&self) -> Option<TokenUsage> {
        match (self.latest_input, self.latest_output) {
            (Some(i), Some(o)) => Some(TokenUsage { input: i, output: o }),
            _ => None,
        }
    }
}

/// A single LLM backend. Implement this trait to add a new provider.
///
/// The factory [`crate::llm::providers::get_provider`] routes provider id strings to concrete
/// types. Each provider owns its HTTP client selection, SSE parsing, and error formatting.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    /// Environment variable name for the provider's API key. Reserved for future
    /// tooling (e.g., auto-detecting key setup); not called in production paths.
    #[allow(dead_code)]
    fn api_key_env_var(&self) -> Option<&'static str>;
    fn default_test_model(&self) -> &'static str;
    fn stream_timeouts(&self) -> StreamTimeouts;

    /// Whether the provider uses SSE ("data: {...}\n") or newline-delimited JSON ("{...}\n").
    fn stream_format(&self) -> StreamFormat {
        StreamFormat::Sse
    }

    fn http_client(&self) -> Result<Client, String>;

    fn streaming_client(&self) -> Result<Client, String> {
        self.http_client()
    }

    /// Extract the text token from a single SSE/JSON line.
    fn extract_streaming_token(&self, data: &str) -> Option<String>;

    /// Update usage counters from a single streaming event. Mutates `state` in place.
    fn update_streaming_usage(&self, data: &str, state: &mut UsageAccumulator);

    /// Non-streaming call. Returns content + optional token usage.
    async fn call(&self, client: &Client, req: &LlmRequest<'_>) -> Result<LlmResponse, String>;

    /// Build and send the HTTP streaming request; return the open response.
    async fn build_streaming_request(
        &self,
        client: &Client,
        req: &LlmRequest<'_>,
    ) -> Result<reqwest::Response, String>;

    /// Provider-specific readiness check (default: no-op). Ollama overrides this.
    async fn preflight(&self, _model: &str) -> Result<(), String> {
        Ok(())
    }

    /// Flush any remaining content in the stream buffer at EOS (default: none).
    /// Ollama overrides this to handle the final non-terminated JSON line.
    fn finalize_buffer(&self, _buffer: &str) -> Option<String> {
        None
    }
}
