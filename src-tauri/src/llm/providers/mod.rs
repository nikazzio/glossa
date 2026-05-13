pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai;

use crate::llm::provider::LlmProvider;

pub fn get_provider(id: &str, ollama_base_url: Option<String>) -> Result<Box<dyn LlmProvider>, String> {
    match id {
        "gemini" => Ok(Box::new(gemini::GeminiProvider)),
        "openai" => Ok(Box::new(openai::openai())),
        "deepseek" => Ok(Box::new(openai::deepseek())),
        "anthropic" => Ok(Box::new(anthropic::AnthropicProvider)),
        "ollama" => Ok(Box::new(ollama::OllamaProvider::new(ollama_base_url))),
        _ => Err(format!("Unknown provider: {id}")),
    }
}

/// Map an HTTP status to a short, user-safe explanation.
///
/// The provider response body may contain echoed prompts, headers, or PII;
/// we never propagate it to the frontend. The full body is logged via a
/// helper that compiles to a no-op outside `debug_assertions`, so release
/// binaries cannot surface the body even if a logger is wired up.
pub(crate) fn format_api_error(
    provider_label: &str,
    status: reqwest::StatusCode,
    body: &str,
) -> String {
    log_response_body(provider_label, status, body);
    let user_message = match status.as_u16() {
        400 => "bad request — check the model name or prompt",
        401 | 403 => "API key not authorized",
        404 => "model or endpoint not found",
        408 => "the provider timed out",
        413 => "input too large for the model",
        429 => "rate limited — retry shortly",
        500..=599 => "provider unavailable",
        _ => "unexpected response",
    };
    format!("{provider_label} API error ({status}): {user_message}")
}

/// Log the raw provider response body. Compiles to a no-op in release
/// builds so prompts/PII cannot leak through the logging subsystem.
#[cfg(debug_assertions)]
fn log_response_body(provider_label: &str, status: reqwest::StatusCode, body: &str) {
    log::debug!("{provider_label} API error body ({status}): {body}");
}

#[cfg(not(debug_assertions))]
fn log_response_body(_: &str, _: reqwest::StatusCode, _: &str) {}

/// Pick a short label from a base URL so error messages identify the
/// provider without leaking the URL itself.
pub(crate) fn provider_label_from_url(base_url: &str) -> &'static str {
    if base_url.contains("api.openai.com") {
        "OpenAI"
    } else if base_url.contains("api.deepseek.com") {
        "DeepSeek"
    } else if base_url.contains("11434") {
        "Ollama"
    } else {
        "Provider"
    }
}
