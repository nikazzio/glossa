pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai;

use crate::llm::provider::LlmProvider;
use reqwest::header::HeaderMap;
use serde_json::{json, Value};

/// JSON Schema shared by every provider that can constrain the translation
/// audit response natively. Providers wrap it in their API-specific envelope.
pub(crate) fn translation_audit_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "rating": {
                "type": "string",
                "enum": ["critical", "poor", "fair", "good", "excellent"]
            },
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["glossary", "fluency", "accuracy", "grammar"]},
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "description": {"type": "string"},
                        "suggestedFix": {"type": "string"},
                        "phrase": {"type": ["string", "null"]},
                        "sourcePhrase": {"type": ["string", "null"]},
                        "confidence": {"type": ["number", "null"]}
                    },
                    "required": ["type", "severity", "description", "suggestedFix", "phrase", "sourcePhrase", "confidence"],
                    "additionalProperties": false
                }
            },
            "checkedSentenceIndices": {
                "type": ["array", "null"],
                "items": {"type": "integer", "minimum": 1}
            }
        },
        "required": ["rating", "issues", "checkedSentenceIndices"],
        "additionalProperties": false
    })
}

#[cfg(test)]
mod tests {
    use super::translation_audit_schema;

    #[test]
    fn audit_schema_requires_one_based_checked_sentence_indices() {
        let schema = translation_audit_schema();

        assert_eq!(
            schema["properties"]["checkedSentenceIndices"]["items"]["minimum"],
            1
        );
    }
}

pub fn get_provider(
    id: &str,
    ollama_base_url: Option<String>,
) -> Result<Box<dyn LlmProvider>, String> {
    match id {
        "gemini" => Ok(Box::new(gemini::GeminiProvider)),
        "openai" => Ok(Box::new(openai::openai())),
        "deepseek" => Ok(Box::new(openai::deepseek())),
        "anthropic" => Ok(Box::new(anthropic::AnthropicProvider)),
        "ollama" => Ok(Box::new(ollama::OllamaProvider::new(ollama_base_url)?)),
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
    let body_lower = body.to_lowercase();
    let user_message = match status.as_u16() {
        400 if body_lower.contains("context")
            || body_lower.contains("too long")
            || body_lower.contains("maximum context")
            || body_lower.contains("context_length_exceeded") =>
        {
            "context window exceeded — reduce chunk size or use a model with a larger context window"
        }
        400 => "bad request — check the model name or prompt",
        401 | 403 => "API key not authorized",
        404 => "model or endpoint not found",
        408 => "the provider timed out",
        413 => "context window exceeded — reduce chunk size or use a model with a larger context window",
        429 => "rate limited — retry shortly",
        500..=599 => "provider unavailable",
        _ => "unexpected response",
    };
    format!("{provider_label} API error ({status}): {user_message}")
}

/// Preserve a provider-supplied retry delay without exposing response bodies.
/// The frontend consumes this compact marker to schedule the next attempt.
pub(crate) fn with_retry_after(error: String, headers: &HeaderMap) -> String {
    let Some(value) = headers.get(reqwest::header::RETRY_AFTER) else {
        return error;
    };
    let Ok(value) = value.to_str() else {
        return error;
    };
    let Ok(seconds) = value.parse::<f64>() else {
        return error;
    };
    if !seconds.is_finite() || seconds < 0.0 {
        return error;
    }
    format!(
        "{error}; retry-after-ms={}",
        (seconds * 1000.0).ceil() as u64
    )
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
