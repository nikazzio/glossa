use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::OnceLock;

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

// ── Schema della risposta di revisione ────────────────────────────────────
//
// I tipi qui sotto esistono solo per generare lo schema JSON che vincola la
// risposta del modello. Il parsing a runtime resta su `JudgeIssue` e
// `JudgeResponse`, che accettano stringhe libere di proposito: se un modello
// risponde fuori schema vogliamo scartare il singolo campo, non far fallire
// l'intera deserializzazione.
//
// I valori ammessi sono elencati una volta sola, qui: sono la stessa fonte da
// cui `parse_judge_rating` (`llm/prompts.rs`) si aspetta di leggere.

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JudgeRating {
    Critical,
    Poor,
    Fair,
    Good,
    Excellent,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JudgeIssueType {
    Glossary,
    Fluency,
    Accuracy,
    Grammar,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JudgeSeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JudgeIssueSchema {
    #[serde(rename = "type")]
    pub issue_type: JudgeIssueType,
    pub severity: JudgeSeverity,
    pub description: String,
    pub suggested_fix: Option<String>,
    pub phrase: Option<String>,
    pub source_phrase: Option<String>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JudgePayloadSchema {
    pub rating: JudgeRating,
    pub issues: Vec<JudgeIssueSchema>,
    #[schemars(schema_with = "one_based_index_array_schema")]
    pub checked_sentence_indices: Option<Vec<u32>>,
}

/// Gli indici di frase sono 1-based, come dichiarato nel prompt del giudice
/// (`llm/prompts.rs`). Da `Option<Vec<u32>>` schemars dedurrebbe `minimum: 0`
/// e un `format: uint32` che nessun provider elenca fra i supportati.
fn one_based_index_array_schema(
    _generator: &mut schemars::r#gen::SchemaGenerator,
) -> schemars::schema::Schema {
    serde_json::from_value(serde_json::json!({
        "type": ["array", "null"],
        "items": { "type": "integer", "minimum": 1 }
    }))
    // Letterale costante: può fallire solo se qualcuno lo modifica male, e in
    // quel caso deve saltare al primo test, non degradare in silenzio.
    .expect("literal audit index schema is a well-formed JSON Schema")
}

/// `$ref` annidati oltre questa profondità vengono lasciati intatti: i nostri
/// tipi non sono ricorsivi, il limite serve solo a non ciclare all'infinito se
/// un giorno lo diventassero.
const MAX_INLINE_DEPTH: usize = 16;

static AUDIT_SCHEMA: OnceLock<Value> = OnceLock::new();

/// Schema JSON della risposta di revisione: unica fonte di verità per tutti e
/// quattro i provider, generata da `JudgePayloadSchema`.
///
/// Normalizzata nella forma che tutti accettano (documentazioni ufficiali,
/// verificate 2026-08-08):
/// - **rimandi interni distesi**: Gemini non documenta `$ref`/`$defs`, e qui
///   non fattorizzano nulla — ogni tipo compare una volta sola;
/// - **via `$schema`, `title`, `format`**: metadati di draft che nessun
///   provider usa e che non compaiono fra i keyword supportati;
/// - **`additionalProperties: false` e tutte le proprietà in `required`** su
///   ogni oggetto: OpenAI lo impone in strict mode e ammette i campi opzionali
///   solo nella forma "tipo oppure null", che è come schemars rende
///   `Option<T>`. Anthropic richiede anch'esso `additionalProperties: false`.
///
/// Calcolata una volta sola: viene allegata a ogni richiesta di revisione.
pub fn audit_json_schema() -> &'static Value {
    AUDIT_SCHEMA.get_or_init(|| {
        let generated = serde_json::to_value(schemars::schema_for!(JudgePayloadSchema))
            // Fallisce solo se una derive è rotta: deve emergere subito.
            .expect("JudgePayloadSchema schema is serializable");
        normalize_for_providers(generated)
    })
}

fn normalize_for_providers(mut generated: Value) -> Value {
    let definitions = generated
        .get_mut("definitions")
        .and_then(Value::as_object_mut)
        .map(std::mem::take)
        .unwrap_or_default();
    inline_and_tighten(generated, &definitions, 0)
}

fn inline_and_tighten(value: Value, definitions: &Map<String, Value>, depth: usize) -> Value {
    match value {
        Value::Object(map) => {
            if depth < MAX_INLINE_DEPTH {
                if let Some(target) = map
                    .get("$ref")
                    .and_then(Value::as_str)
                    .and_then(|reference| reference.strip_prefix("#/definitions/"))
                    .and_then(|name| definitions.get(name))
                {
                    return inline_and_tighten(target.clone(), definitions, depth + 1);
                }
            }
            let mut normalized = Map::new();
            for (key, entry) in map {
                if matches!(key.as_str(), "$schema" | "title" | "format" | "definitions") {
                    continue;
                }
                normalized.insert(key, inline_and_tighten(entry, definitions, depth));
            }
            tighten_object(&mut normalized);
            Value::Object(normalized)
        }
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| inline_and_tighten(item, definitions, depth))
                .collect(),
        ),
        Value::Number(number) => canonical_number(number),
        other => other,
    }
}

/// I vincoli numerici passano dal modello di schemars, che li tiene in virgola
/// mobile: `minimum: 1` tornerebbe sulla rete come `1.0`. Equivalente per lo
/// standard, ma i provider ricevevano `1` e non c'è motivo di cambiarglielo.
fn canonical_number(number: serde_json::Number) -> Value {
    match number.as_f64() {
        Some(value) if value.fract() == 0.0 && value.abs() < (i64::MAX as f64) => {
            Value::Number(serde_json::Number::from(value as i64))
        }
        _ => Value::Number(number),
    }
}

/// Su ogni schema di oggetto: vieta i campi extra ed elenca tutte le proprietà
/// come obbligatorie. La nullabilità resta espressa dal tipo (`["string",
/// "null"]`), che è la forma richiesta da OpenAI in strict mode.
fn tighten_object(map: &mut Map<String, Value>) {
    let Some(properties) = map.get("properties").and_then(Value::as_object) else {
        return;
    };
    let required: Vec<Value> = properties.keys().cloned().map(Value::String).collect();
    map.insert("required".to_string(), Value::Array(required));
    map.insert("additionalProperties".to_string(), Value::Bool(false));
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

#[cfg(test)]
mod tests {
    use super::audit_json_schema;
    use serde_json::Value;

    fn contains_key_anywhere(value: &Value, key: &str) -> bool {
        match value {
            Value::Object(map) => {
                map.contains_key(key)
                    || map.values().any(|entry| contains_key_anywhere(entry, key))
            }
            Value::Array(items) => items.iter().any(|item| contains_key_anywhere(item, key)),
            _ => false,
        }
    }

    fn enum_values(schema: &Value) -> Vec<String> {
        schema["enum"]
            .as_array()
            .expect("enum values")
            .iter()
            .map(|value| value.as_str().expect("enum value is a string").to_string())
            .collect()
    }

    #[test]
    fn audit_schema_has_no_internal_references_or_draft_metadata() {
        let schema = audit_json_schema();
        for key in ["$ref", "definitions", "$defs", "$schema", "title", "format"] {
            assert!(
                !contains_key_anywhere(schema, key),
                "lo schema contiene ancora `{key}`: Gemini non documenta i rimandi interni"
            );
        }
    }

    #[test]
    fn audit_schema_root_lists_every_property_as_required() {
        let schema = audit_json_schema();
        assert_eq!(schema["type"], "object");
        assert_eq!(schema["additionalProperties"], Value::Bool(false));

        let mut required: Vec<&str> = schema["required"]
            .as_array()
            .expect("required")
            .iter()
            .map(|value| value.as_str().expect("required entry"))
            .collect();
        required.sort_unstable();
        assert_eq!(
            required,
            ["checkedSentenceIndices", "issues", "rating"],
            "OpenAI in strict mode pretende ogni proprietà in `required`"
        );
    }

    #[test]
    fn audit_schema_constrains_rating_to_the_parsed_values() {
        let schema = audit_json_schema();
        assert_eq!(
            enum_values(&schema["properties"]["rating"]),
            ["critical", "poor", "fair", "good", "excellent"],
            "devono restare allineati a `parse_judge_rating`"
        );
    }

    #[test]
    fn audit_schema_constrains_issue_type_and_severity() {
        let schema = audit_json_schema();
        let issue = &schema["properties"]["issues"]["items"];

        assert_eq!(
            enum_values(&issue["properties"]["type"]),
            ["glossary", "fluency", "accuracy", "grammar"]
        );
        assert_eq!(
            enum_values(&issue["properties"]["severity"]),
            ["low", "medium", "high"]
        );
    }

    #[test]
    fn audit_schema_issue_object_forbids_extra_fields_and_requires_all() {
        let schema = audit_json_schema();
        let issue = &schema["properties"]["issues"]["items"];

        assert_eq!(issue["additionalProperties"], Value::Bool(false));

        let mut required: Vec<&str> = issue["required"]
            .as_array()
            .expect("required")
            .iter()
            .map(|value| value.as_str().expect("required entry"))
            .collect();
        required.sort_unstable();
        assert_eq!(
            required,
            [
                "confidence",
                "description",
                "phrase",
                "severity",
                "sourcePhrase",
                "suggestedFix",
                "type"
            ]
        );
    }

    #[test]
    fn audit_schema_keeps_optional_issue_fields_nullable() {
        let schema = audit_json_schema();
        let properties = &schema["properties"]["issues"]["items"]["properties"];

        for field in ["suggestedFix", "phrase", "sourcePhrase"] {
            let types = properties[field]["type"]
                .as_array()
                .unwrap_or_else(|| panic!("`{field}` deve restare nullable"));
            assert!(types.iter().any(|value| value == "null"), "{field}");
        }
        assert!(properties["confidence"]["type"]
            .as_array()
            .expect("confidence nullable")
            .iter()
            .any(|value| value == "null"));
    }

    #[test]
    fn audit_schema_requires_one_based_checked_sentence_indices() {
        let schema = audit_json_schema();
        let indices = &schema["properties"]["checkedSentenceIndices"];

        assert_eq!(indices["items"]["type"], "integer");
        assert_eq!(
            indices["items"]["minimum"], 1,
            "il prompt del giudice dichiara indici 1-based"
        );
        assert!(indices["type"]
            .as_array()
            .expect("nullable array")
            .iter()
            .any(|value| value == "null"));
    }

    #[test]
    fn audit_schema_emits_integral_constraints_as_integers() {
        let schema = audit_json_schema();
        let minimum = &schema["properties"]["checkedSentenceIndices"]["items"]["minimum"];

        assert!(
            minimum.is_i64(),
            "i provider ricevevano `1`, non `1.0`: {minimum}"
        );
    }

    #[test]
    fn audit_schema_is_computed_once() {
        assert!(std::ptr::eq(audit_json_schema(), audit_json_schema()));
    }
}
