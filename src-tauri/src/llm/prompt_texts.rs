//! System texts of the prompts: every piece of wording the program adds around
//! the user's own prompts. Each has a stable id, a default and the placeholders
//! it must keep. A pipeline may override any of them; an override that drops a
//! required placeholder is ignored, so a chunk can never be sent without its text.

use std::collections::HashMap;

use crate::llm::types::PipelineConfig;

pub(crate) struct SystemText {
    pub id: &'static str,
    pub default: &'static str,
    /// Placeholders the text must contain; without them the default is used.
    pub required: &'static [&'static str],
}

const fn text(
    id: &'static str,
    default: &'static str,
    required: &'static [&'static str],
) -> SystemText {
    SystemText {
        id,
        default,
        required,
    }
}

pub(crate) const SYSTEM_TEXTS: &[SystemText] = &[
    // Shared by every LLM phase that receives them.
    text(
        "context-frame",
        "Translation context:\n{{TRANSLATION_CONTEXT}}",
        &["TRANSLATION_CONTEXT"],
    ),
    text("chunk-id", "Current chunk id: {{CHUNK_ID}}", &["CHUNK_ID"]),
    // Translation and Refine.
    text(
        "translation.role",
        "You are an expert translator and linguist. Follow the translation context and the instructions for the current stage.",
        &[],
    ),
    text(
        "translation.structural-rules",
        "Structural Preservation Rules:\n\
         - Preserve paragraph boundaries and line breaks unless the source is clearly malformed\n\
         - Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning",
        &[],
    ),
    text(
        "translation.glossary-rules",
        "Glossary Constraints:\n\
         - Treat every glossary entry as mandatory terminology, not as a suggestion\n\
         - When a source glossary term appears, use the required target term exactly unless the notes explicitly justify a variant\n\
         - Preserve case, product names, abbreviations, and domain terminology consistently across the whole translation\n\
         - Do not omit glossary terms, paraphrase them away, or replace them with near-synonyms\n\
         - If a glossary term appears inside Markdown, links, or footnotes, still apply the glossary while preserving the surrounding syntax\n\
         - Glossary:\n{{GLOSSARY_TABLE}}",
        &["GLOSSARY_TABLE"],
    ),
    text(
        "translation.glossary-empty",
        "Glossary Constraints:\n- No glossary entries were provided.",
        &[],
    ),
    text(
        "translation.markdown-rules",
        "Markdown Preservation Rules:\n\
         - Preserve every Markdown marker exactly as needed (*, **, _, [], (), headings, lists, block quotes, footnotes)\n\
         - Do not remove, reformat, or invent Markdown structure\n\
         - Translate only the human-language content while keeping Markdown syntax valid",
        &[],
    ),
    text(
        "translation.examples",
        "Example Translations (match this style, register, and tone):\n{{EXAMPLES}}",
        &["EXAMPLES"],
    ),
    text(
        "translation.neighbours",
        "[Reference document block - context only]\n\
         This block may include the current chunk. Use it for terminology, continuity, names, pronouns, formatting, and narrative context.\n\
         Do not translate this block as a whole. Translate only the current chunk identified in the user message.\n\
         {{NEIGHBOUR_CHUNKS}}\n\
         [End reference document block]",
        &["NEIGHBOUR_CHUNKS"],
    ),
    text(
        "translation.stage-frame",
        "Core Instructions:\n{{STAGE_PROMPT}}",
        &["STAGE_PROMPT"],
    ),
    text(
        "translation.output-contract",
        "Output only the translated text.",
        &[],
    ),
    text(
        "translation.user-message",
        "Text to translate from the current chunk:\n{{TEXT}}\n\nTranslate only the current chunk. Output only its translation.",
        &["TEXT"],
    ),
    text(
        "refine.output-contract",
        "Output the complete refined translation in full. Do not summarize, abbreviate, or output only the changed portions — rewrite the entire chunk from start to finish.",
        &[],
    ),
    text(
        "refine.user-message",
        "Original text for the current chunk:\n{{TEXT}}\n\n\
         Previous Iteration for the current chunk:\n{{PREVIOUS_RESULT}}\n\n\
         Refine only the current chunk according to your instructions. Output the complete refined translation in full — every sentence, from start to finish. Do not abbreviate or output only the changed portions.",
        &["TEXT", "PREVIOUS_RESULT"],
    ),
    text(
        "refine.audit-findings",
        "---\nPrevious audit findings to address:\n{{AUDIT_FINDINGS}}\n---",
        &["AUDIT_FINDINGS"],
    ),
    // Format.
    text(
        "format.role",
        "\
You are a deterministic text post-processor for already translated text.\n\
The input is already translated. Do not translate, retranslate, paraphrase, improve style, correct meaning, expand, shorten, or alter wording except where a minimal formatting repair requires it.\n\
Allowed changes: repair broken Markdown or footnote syntax, and restore clearly corrupted spacing or line breaks.\n\
Do not add new emphasis, code, link, heading, list, quote, table, or other markup. Change existing Markdown markers only when necessary to restore valid syntax.\n\
Return the complete text. If no change is needed, return the input exactly.\n\
Do not return explanations, comments, JSON, diffs, or 'no changes'.",
        &[],
    ),
    text(
        "format.stage-frame",
        "Core Formatting Instructions:\n{{STAGE_PROMPT}}",
        &["STAGE_PROMPT"],
    ),
    text(
        "format.output-contract",
        "Output only the formatted text.",
        &[],
    ),
    text(
        "format.user-message",
        "Text to format from the current chunk:\n{{TEXT}}\n\nApply only the formatting instructions. Output only the complete formatted text.",
        &["TEXT"],
    ),
    // Audit.
    text(
        "audit.role",
        "You are a translation quality judge. Evaluate the translation against the translation context.",
        &[],
    ),
    text(
        "audit.stage-frame",
        "Specific Audit Instructions:\n{{STAGE_PROMPT}}",
        &["STAGE_PROMPT"],
    ),
    text(
        "audit.glossary",
        "Glossary to adhere to:\n{{GLOSSARY_TABLE}}",
        &["GLOSSARY_TABLE"],
    ),
    text(
        "audit.markdown-rules",
        "When Markdown is present, verify that the translation preserves markers, footnotes, \
         inline emphasis, and block structure exactly enough to remain valid Markdown.",
        &[],
    ),
    text(
        "audit.review-method",
        "Scanning protocol: go through the translation sentence by sentence, checking every \
         sentence against the source for accuracy, every glossary term for adherence, grammar \
         for correctness, and fluency throughout. Complete the full scan before building the issues list. \
         Report EVERY issue you find and EVERY occurrence separately — do not merge, suppress, or \
         limit repeated issues.",
        &[],
    ),
    text(
        "audit.response-format",
        "You MUST respond with a valid JSON object containing:\n\
         - checkedSentenceIndices: array of 1-based source sentence numbers you verified, in scan order \
           (e.g. [1, 2, 3] for a 3-sentence source) — indices only, never the sentence text itself\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects with these fields:\n\
           - type: 'glossary'|'fluency'|'accuracy'|'grammar'\n\
           - severity: 'low'|'medium'|'high'\n\
           - description: string — explanation of the issue in {{UI_LANGUAGE}}\n\
           - suggestedFix: string — how to correct it in {{UI_LANGUAGE}}\n\
           - phrase: string or null — the exact verbatim substring of the WRONG or problematic text \
             as it appears in the TARGET translation (character-for-character copy from the target text)\n\
           - sourcePhrase: string or null — the exact verbatim substring from the SOURCE text \
             that corresponds to this issue\n\
           - confidence: number or null — your confidence this is a real issue (0.0–1.0)\n\
         Write description and suggestedFix in {{UI_LANGUAGE}}. \
         Keep rating and type values as the English literals above.",
        &[],
    ),
    text(
        "audit.user-message",
        "Source: {{TEXT}}\nTarget: {{TRANSLATION}}\n\nPerform the audit now and return the JSON report.",
        &["TEXT", "TRANSLATION"],
    ),
    // Coherence.
    text(
        "coherence.role",
        "You are a translation coherence auditor. Evaluate consistency against the translation context.",
        &[],
    ),
    text(
        "coherence.review-method",
        "Your task: identify cross-segment inconsistencies between a translated segment and its surrounding context.",
        &[],
    ),
    text(
        "coherence.glossary",
        "Glossary:\n{{GLOSSARY_TABLE}}",
        &["GLOSSARY_TABLE"],
    ),
    text(
        "coherence.response-format",
        "Write description and suggestedFix values in {{UI_LANGUAGE}}.\n\
         Respond with valid JSON only:\n\
         {\"issues\": [{\"type\": \"consistency\"|\"glossary\", \
         \"severity\": \"low\"|\"medium\"|\"high\", \
         \"description\": \"string\", \
         \"suggestedFix\": \"string\", \
         \"phrase\": \"exact verbatim substring of the WRONG text as it appears in the target translation, not the source term nor the correction; first occurrence only\"}]}",
        &[],
    ),
    text(
        "coherence.neighbours",
        "[Reference translated document block - context only]\n\
         This block may include the current chunk. Use it to compare terminology and continuity across the document block.\n\
         The current chunk to audit is identified below.\n\
         {{NEIGHBOUR_CHUNKS}}\n\
         [End reference translated document block]",
        &["NEIGHBOUR_CHUNKS"],
    ),
    text(
        "coherence.user-message",
        "[Current segment]\nOriginal: {{TEXT}}\nTranslation: {{TRANSLATION}}\n[End of current segment]\n\n\
         Identify cross-segment coherence issues and return the JSON. If no issues, return {\"issues\": []}.",
        &["TEXT", "TRANSLATION"],
    ),
];

fn spec(id: &str) -> Option<&'static SystemText> {
    SYSTEM_TEXTS.iter().find(|entry| entry.id == id)
}

fn has_placeholder(template: &str, name: &str) -> bool {
    template.contains(&format!("{{{{{name}}}}}"))
}

/// The text a pipeline uses: its override when present and complete, else the default.
pub(crate) fn system_text<'a>(config: &'a PipelineConfig, id: &str) -> &'a str {
    // Ids are constants of this module; an unknown one is a programming error.
    let Some(entry) = spec(id) else {
        debug_assert!(false, "unknown system text id: {id}");
        return "";
    };
    config
        .prompt_composition
        .texts
        .get(id)
        .map(String::as_str)
        .filter(|custom| !custom.trim().is_empty())
        .filter(|custom| entry.required.iter().all(|name| has_placeholder(custom, name)))
        .unwrap_or(entry.default)
}

/// Replaces `{{NAME}}` placeholders in one pass: inserted values are never
/// scanned again, so a chunk that happens to contain `{{TEXT}}` stays as it is.
pub(crate) fn fill(template: &str, values: &[(&str, &str)]) -> String {
    let lookup: HashMap<&str, &str> = values.iter().copied().collect();
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("}}") {
            Some(end) => match lookup.get(&after[..end]) {
                Some(value) => {
                    out.push_str(value);
                    rest = &after[end + 2..];
                }
                None => {
                    out.push_str("{{");
                    rest = after;
                }
            },
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// The system text of a pipeline, with its placeholders filled.
pub(crate) fn render(config: &PipelineConfig, id: &str, values: &[(&str, &str)]) -> String {
    fill(system_text(config, id), values)
}

/// Defaults and placeholders for the editor in the prompt preview.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemTextInfo {
    pub id: &'static str,
    pub default_text: &'static str,
    pub required: Vec<&'static str>,
}

#[tauri::command]
pub fn prompt_system_texts() -> Vec<SystemTextInfo> {
    SYSTEM_TEXTS
        .iter()
        .map(|entry| SystemTextInfo {
            id: entry.id,
            default_text: entry.default,
            required: entry.required.to_vec(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::types::PromptComposition;

    #[test]
    fn fill_replaces_known_placeholders_once() {
        assert_eq!(
            fill("A {{TEXT}} B {{OTHER}}", &[("TEXT", "x {{OTHER}}")]),
            "A x {{OTHER}} B {{OTHER}}"
        );
    }

    #[test]
    fn override_without_required_placeholder_falls_back_to_default() {
        let mut config = PipelineConfig::default();
        config.prompt_composition = PromptComposition {
            texts: [("translation.user-message".to_string(), "No placeholder".to_string())]
                .into_iter()
                .collect(),
            disabled: vec![],
        };
        assert_eq!(
            system_text(&config, "translation.user-message"),
            spec("translation.user-message").map(|entry| entry.default).unwrap_or_default()
        );
        config
            .prompt_composition
            .texts
            .insert("translation.role".into(), "Custom role".into());
        assert_eq!(system_text(&config, "translation.role"), "Custom role");
    }

    #[test]
    fn every_default_contains_its_required_placeholders() {
        for entry in SYSTEM_TEXTS {
            for name in entry.required {
                assert!(has_placeholder(entry.default, name), "{} lacks {name}", entry.id);
            }
        }
    }
}
