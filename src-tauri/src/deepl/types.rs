use serde::{Deserialize, Serialize};

// Opzioni runtime DeepL per uno stage (viene da ProviderRuntimeConfig.deepl)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeeplConfig {
    pub model_type: Option<String>,
    pub formality: Option<String>,
    pub context: Option<String>,
    pub preserve_formatting: Option<bool>,
    pub glossary_id: Option<String>,
    pub show_billed_characters: Option<bool>,
}

// Input per run_deepl_stage (parametri chiamata)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeeplStageInput {
    pub text: String,
    pub source_lang: Option<String>,
    pub target_lang: String,
    pub deepl_config: Option<DeeplConfig>,
}

// Output di run_deepl_stage
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeeplStageOutput {
    pub content: String,
    pub billed_characters: Option<u64>,
    pub detected_source_language: Option<String>,
}

// Struttura interna per la chiamata HTTP DeepL translate
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct DeeplTranslateRequest {
    pub text: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_lang: Option<String>,
    pub target_lang: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preserve_formatting: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glossary_id: Option<String>,
    pub show_billed_characters: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DeeplTranslateResponse {
    pub translations: Vec<DeeplTranslation>,
    pub billed_characters: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DeeplTranslation {
    pub detected_source_language: Option<String>,
    pub text: String,
    pub billed_characters: Option<u64>,
}

// Per get_deepl_languages
#[derive(Debug, Deserialize)]
pub(crate) struct DeeplLanguageRaw {
    pub language: String,
    pub name: String,
    #[serde(default)]
    pub supports_formality: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeeplLanguageInfo {
    pub language: String,
    pub name: String,
    pub supports_formality: bool,
}

// Info di un glossario DeepL (risposta da GET /v3/glossaries)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeeplGlossaryInfo {
    pub glossary_id: String,
    pub name: String,
    pub ready: bool,
    pub source_lang: String,
    pub target_lang: String,
    pub entry_count: u32,
    pub creation_time: String,
}

// Input per creare un glossario da termini Glossa
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDeeplGlossaryInput {
    pub name: String,
    pub source_lang: String,
    pub target_lang: String,
    pub entries: Vec<GlossaryEntryPair>,
}

#[derive(Debug, Deserialize)]
pub struct GlossaryEntryPair {
    pub source: String,
    pub target: String,
}

// Struttura interna per POST /v3/glossaries
#[derive(Debug, Serialize)]
pub(crate) struct DeeplCreateGlossaryBody {
    pub name: String,
    pub dictionaries: Vec<DeeplGlossaryDictionary>,
}

#[derive(Debug, Serialize)]
pub(crate) struct DeeplGlossaryDictionary {
    pub source_lang: String,
    pub target_lang: String,
    pub entries: String,              // TSV: "termine\ttraduzione\n"
    pub entries_format: &'static str, // sempre "tsv"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deepl_config_round_trip_camel_case() {
        let json = r#"{"modelType":"quality_optimized","formality":"more","glossaryId":"gl-123"}"#;
        let cfg: DeeplConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.model_type.as_deref(), Some("quality_optimized"));
        assert_eq!(cfg.formality.as_deref(), Some("more"));
        assert_eq!(cfg.glossary_id.as_deref(), Some("gl-123"));
        let back = serde_json::to_string(&cfg).unwrap();
        assert!(back.contains("modelType"));
    }
}
