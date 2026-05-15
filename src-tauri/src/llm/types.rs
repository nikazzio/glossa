use serde::{Deserialize, Serialize};

/// A single section of a system prompt. `cacheable: true` tells the provider
/// to insert a cache breakpoint after this block (Anthropic `cache_control`).
/// Providers that don't support structured caching flatten all blocks to a string.
#[derive(Debug, Clone)]
pub struct PromptBlock {
    pub text: String,
    pub cacheable: bool,
}

/// Structured prompt ready for dispatch. System blocks are ordered; the last
/// cacheable block marks the furthest stable cache boundary for the call.
#[derive(Debug, Clone)]
pub struct StructuredPrompt {
    pub system: Vec<PromptBlock>,
    pub user: String,
}

impl StructuredPrompt {
    /// Flatten all system blocks into a single string for providers that don't
    /// support structured caching.
    pub fn flatten_system(&self) -> String {
        self.system
            .iter()
            .map(|b| b.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub term: String,
    pub translation: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaConfig {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub seed: Option<i32>,
    pub keep_alive: Option<serde_json::Value>,
    pub think: Option<serde_json::Value>,
    pub num_ctx: Option<u32>,
    pub num_predict: Option<i32>,
    pub use_advanced_options: Option<bool>,
    pub advanced_options: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCacheConfig {
    pub prompt_cache_key: Option<String>,
    pub prompt_cache_retention: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCacheConfig {
    pub explicit_caching: Option<bool>,
    pub cache_ttl_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRuntimeConfig {
    pub ollama: Option<OllamaConfig>,
    pub openai: Option<OpenAiCacheConfig>,
    pub deepseek: Option<OpenAiCacheConfig>,
    pub gemini: Option<GeminiCacheConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageConfig {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub model: String,
    pub provider: String,
    pub enabled: bool,
    pub provider_options: Option<ProviderRuntimeConfig>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineConfig {
    pub source_language: String,
    pub target_language: String,
    pub stages: Vec<StageConfig>,
    pub judge_prompt: String,
    pub judge_model: String,
    pub judge_provider: String,
    pub glossary: Vec<GlossaryEntry>,
    pub use_chunking: Option<bool>,
    pub markdown_aware: Option<bool>,
    pub coherence_prompt: Option<String>,
    pub review_provider_options: Option<ProviderRuntimeConfig>,
    pub persona: Option<String>,
    pub ui_language: Option<String>,
    pub custom_source_language: Option<String>,
    pub custom_target_language: Option<String>,
    /// Original text of all chunks in the same blob, injected at call time for context.
    /// Not persisted — computed from blob assignments before each LLM invocation.
    pub blob_context: Option<String>,
    /// Runtime-only id of the chunk currently being translated. Kept outside blob_context
    /// so the cacheable reference block remains identical for every chunk in the same blob.
    pub blob_current_chunk_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheckInput {
    pub provider: String,
    pub model: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheckResult {
    pub provider: String,
    pub model: String,
    pub label: String,
    pub ok: bool,
    pub error: Option<String>,
    /// Populated only for Ollama checks — the full list of locally-installed
    /// models returned by Ollama. Used by the frontend to refresh the model
    /// picker without a separate round-trip.
    pub available_models: Option<Vec<String>>,
    /// True if Ollama responded at all (even if the requested model is missing).
    /// Absent for cloud providers. Lets the frontend distinguish "offline" from
    /// "model not installed" without parsing the error string.
    pub reachable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaPreflightStatus {
    pub reachable: bool,
    pub models: Vec<String>,
    pub requested_model: Option<String>,
    pub model_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub severity: String,
    pub description: String,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeResponse {
    pub rating: String,
    pub issues: Vec<JudgeIssue>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_miss_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoherenceChunkInput {
    pub original: String,
    pub translation: String,
    /// Translated text of all chunks in the same blob, for cross-segment consistency checks.
    pub blob_context: Option<String>,
    pub current_chunk_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoherenceResponse {
    pub issues: Vec<JudgeIssue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_miss_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_prompt: Option<String>,
}
