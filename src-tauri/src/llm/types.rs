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

/// A hand-picked, already-approved chunk translation used as a few-shot style
/// example. Injected into the cacheable static block (unlike Phrase Memory,
/// which is per-chunk vector search appended to the non-cacheable
/// stage-instructions block), so the marginal cost stays near zero after the
/// first chunk of a run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FewShotExample {
    pub source_text: String,
    pub target_text: String,
    pub label: Option<String>,
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
    pub reasoning_effort: Option<String>,
    /// 0.0-2.0. Only applied when reasoning is effectively off — GPT-5.x and
    /// DeepSeek-v4 both reject/ignore temperature while actively reasoning.
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCacheConfig {
    pub explicit_caching: Option<bool>,
    pub cache_ttl_seconds: Option<u32>,
    pub thinking_budget: Option<i32>,
    /// 0.0-2.0. Coexists with thinkingBudget without conflict on Gemini's API.
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicConfig {
    /// 0.0-1.0. `None` lets Anthropic use its own default (1.0).
    pub temperature: Option<f32>,
    /// Opt-in: attach `cache_control` to cacheable system blocks. `None`/`false`
    /// means no caching at all for this call — the right default for pipelines
    /// where chunks are worked on minutes or hours apart, where the 5-minute
    /// cache would never hit and the write premium would be pure waste.
    pub enable_caching: Option<bool>,
    /// Only meaningful when `enable_caching` is true: use Anthropic's 1-hour
    /// cache TTL instead of the 5-minute default (2x write cost instead of
    /// 1.25x), for mixed pipelines with slow non-Anthropic stages in between.
    pub extended_cache_ttl: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRuntimeConfig {
    pub ollama: Option<OllamaConfig>,
    pub openai: Option<OpenAiCacheConfig>,
    pub deepseek: Option<OpenAiCacheConfig>,
    pub gemini: Option<GeminiCacheConfig>,
    pub deepl: Option<crate::deepl::types::DeeplConfig>,
    pub anthropic: Option<AnthropicConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub role: Option<String>,
    pub prompt: String,
    pub model: String,
    pub provider: String,
    pub enabled: bool,
    pub provider_options: Option<ProviderRuntimeConfig>,
    #[serde(default)]
    pub custom_provider_id: Option<String>,
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
    /// Hand-picked example translations, folded into the cacheable static
    /// block (see `prompts::format_few_shot_block`). Defaults to empty for
    /// pipelines saved before this field existed.
    #[serde(default)]
    pub few_shot_examples: Vec<FewShotExample>,
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
    /// Exact verbatim substring copied from the target translation that contains the issue.
    pub phrase: Option<String>,
    /// Exact verbatim substring copied from the SOURCE text corresponding to this issue.
    pub source_phrase: Option<String>,
    /// Model confidence for this issue (0.0–1.0). Lower values mean the model is less certain.
    pub confidence: Option<f32>,
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
    /// 1-based source sentence indices the model checked during the audit scan
    /// (self-verification list — indices instead of full text to avoid billing
    /// the whole source back at output-token rates).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_sentence_indices: Option<Vec<u32>>,
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
