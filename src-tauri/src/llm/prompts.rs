use crate::llm::types::{CoherenceChunkInput, PipelineConfig, ProviderRuntimeConfig, StageConfig};

pub(crate) const REFINE_STAGE_SYSTEM_PROMPT: &str = "\
You are an expert prompt engineer specializing in multi-stage AI translation pipelines.\n\
Your task: rewrite the user's translation-stage prompt to be clearer, more professional, \
and more effective for modern LLMs.\n\
Rules:\n\
- Preserve the original intent exactly — do not change what the stage is supposed to do\n\
- Use direct, imperative language\n\
- Be specific about register, tone, and quality expectations where relevant\n\
- Remove filler words and vague instructions\n\
- Output ONLY the rewritten prompt text — no preamble, no explanation, no quotes";

pub(crate) const REFINE_AUDIT_SYSTEM_PROMPT: &str = "\
You are an expert prompt engineer specializing in AI translation quality assessment.\n\
Your task: rewrite the user's audit/judge prompt to be more precise, structured, and \
effective for systematic quality evaluation.\n\
Rules:\n\
- Preserve the original evaluation intent — do not add criteria the user did not imply\n\
- Make evaluation criteria explicit and measurable\n\
- Reference relevant quality dimensions: accuracy, fluency, register, glossary adherence, grammar\n\
- Use professional translation-industry QA terminology where appropriate\n\
- Output ONLY the rewritten prompt text — no preamble, no explanation, no quotes";

/// Returns a slice of `text` starting from the `(word_count - n)`-th word,
/// i.e. the trailing `n` words. Returns the full string if it has ≤ n words.
pub(crate) fn last_n_words(text: &str, n: usize) -> &str {
    if n == 0 {
        return "";
    }
    let mut word_count = 0;
    let mut in_word = false;
    for (i, c) in text.char_indices().rev() {
        if c.is_whitespace() {
            if in_word {
                word_count += 1;
                if word_count >= n {
                    return text[i + c.len_utf8()..].trim_start();
                }
                in_word = false;
            }
        } else {
            in_word = true;
        }
    }
    text.trim_start()
}

pub(crate) fn build_stage_prompts(
    text: &str,
    stage: &StageConfig,
    config: &PipelineConfig,
    previous_result: &Option<String>,
    previous_translation: &Option<String>,
) -> (String, String) {
    let glossary_str: String = config
        .glossary
        .iter()
        .map(|g| {
            format!(
                "- source: {}\n  target: {}\n  notes: {}",
                g.term,
                g.translation,
                g.notes.as_deref().unwrap_or("-")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let markdown_rules = if config.markdown_aware.unwrap_or(false) {
        "\n\nMarkdown Preservation Rules:\n\
         - Preserve every Markdown marker exactly as needed (*, **, _, [], (), headings, lists, block quotes, footnotes)\n\
         - Do not remove, reformat, or invent Markdown structure\n\
         - Translate only the human-language content while keeping Markdown syntax valid"
    } else {
        ""
    };

    let glossary_rules = if glossary_str.is_empty() {
        "Glossary Constraints:\n- No glossary entries were provided.".to_string()
    } else {
        format!(
            "Glossary Constraints:\n\
             - Treat every glossary entry as mandatory terminology, not as a suggestion\n\
             - When a source glossary term appears, use the required target term exactly unless the notes explicitly justify a variant\n\
             - Preserve case, product names, abbreviations, and domain terminology consistently across the whole translation\n\
             - Do not omit glossary terms, paraphrase them away, or replace them with near-synonyms\n\
             - If a glossary term appears inside Markdown, links, or footnotes, still apply the glossary while preserving the surrounding syntax\n\
             - Glossary entries:\n{}",
            glossary_str,
        )
    };

    let default_opener = format!(
        "You are an expert translator and linguist specialized in {} to {} translation.",
        config.source_language, config.target_language,
    );
    let opener = config
        .persona
        .as_deref()
        .filter(|p| !p.trim().is_empty())
        .unwrap_or(&default_opener);

    let system_prompt = format!(
        "{}\n\n\
         Core Instructions:\n{}\n\n\
         Structural Preservation Rules:\n\
         - Preserve paragraph boundaries and line breaks unless the source is clearly malformed\n\
         - Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning\n\n\
         {}{}",
        opener,
        stage.prompt,
        glossary_rules,
        markdown_rules,
    );

    let context_block = match previous_translation {
        Some(prev) if !prev.is_empty() => {
            let tail = last_n_words(prev, 300);
            format!(
                "[Context from previous segment — do not translate, use only for stylistic and terminological coherence]\n\
                 {tail}\n\
                 [End of context]\n\n"
            )
        }
        _ => String::new(),
    };

    let user_prompt = match previous_result {
        Some(prev) if !prev.is_empty() => format!(
            "{context_block}Original: {text}\n\nPrevious Iteration: {prev}\n\n\
             Refine the above translation according to your instructions. Provide ONLY the final text."
        ),
        _ => format!("{context_block}Text to translate: {text}\n\nProvide ONLY the translated text."),
    };

    (system_prompt, user_prompt)
}

pub(crate) fn build_judge_prompts(
    original_text: &str,
    translation: &str,
    config: &PipelineConfig,
) -> (String, String) {
    let glossary_json = serde_json::to_string(&config.glossary).unwrap_or_default();

    let system_prompt = format!(
        "As a translation quality judge, evaluate the following translation.\n\
         Source ({src}): {original_text}\n\
         Target ({tgt}): {translation}\n\n\
         Specific Audit Instructions:\n{instructions}\n\n\
         Glossary to adhere to: {glossary_json}\n\n\
         {markdown_rules}\n\
         You MUST respond with a valid JSON object containing:\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects {{ type: 'glossary'|'fluency'|'accuracy'|'grammar', \
           severity: 'low'|'medium'|'high', description: string, suggestedFix: string }}\n\
         Write all description and suggestedFix values in {tgt}. \
         Keep the rating value as one of the English literals above.",
        src = config.source_language,
        tgt = config.target_language,
        instructions = config.judge_prompt,
        markdown_rules = if config.markdown_aware.unwrap_or(false) {
            "When Markdown is present, verify that the translation preserves markers, footnotes, inline emphasis, and block structure exactly enough to remain valid Markdown."
        } else {
            ""
        },
    );

    let user_prompt = "Perform the audit now and return the JSON report.".to_string();

    (system_prompt, user_prompt)
}

pub(crate) fn build_coherence_prompts(
    input: &CoherenceChunkInput,
    config: &PipelineConfig,
) -> (String, String) {
    let glossary_json = serde_json::to_string(&config.glossary).unwrap_or_default();

    let default_instructions = "Evaluate ONLY:\n\
         1. Terminology consistency — key terms translated differently than in adjacent segments\n\
         2. Narrative continuity — abrupt breaks in flow at segment boundaries\n\
         3. Glossary adherence — glossary terms used inconsistently with context\n\
         Do NOT re-evaluate standalone translation quality.";

    let instructions = config
        .coherence_prompt
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(default_instructions);

    let system_prompt = format!(
        "You are a translation coherence auditor for {src}→{tgt} translations.\n\
         Your task: identify cross-segment inconsistencies between a translated segment and its surrounding context.\n\
         {instructions}\n\
         Glossary: {glossary}\n\n\
         Write all description and suggestedFix values in {tgt}.\n\
         Respond with valid JSON only:\n\
         {{\"issues\": [{{\"type\": \"consistency\"|\"glossary\", \
         \"severity\": \"low\"|\"medium\"|\"high\", \
         \"description\": \"string\", \"suggestedFix\": \"string\"}}]}}",
        src = config.source_language,
        tgt = config.target_language,
        glossary = glossary_json,
    );

    let prev_block = input
        .prev_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| {
            format!("[Previous segment — context only]\n{ctx}\n[End of previous context]\n\n")
        })
        .unwrap_or_default();

    let next_block = input
        .next_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| format!("\n[Next segment — context only]\n{ctx}\n[End of next context]"))
        .unwrap_or_default();

    let user_prompt = format!(
        "{prev_block}[Current segment]\nOriginal: {original}\nTranslation: {translation}\n[End of current segment]{next_block}\n\n\
         Identify cross-segment coherence issues and return the JSON. If no issues, return {{\"issues\": []}}.",
        original = input.original,
        translation = input.translation,
    );

    (system_prompt, user_prompt)
}

/// Strips markdown code fences and any preamble text that LLMs sometimes wrap around JSON output.
pub(crate) fn sanitize_llm_json_output(raw: &str) -> &str {
    let trimmed = raw.trim();
    match (trimmed.find('{'), trimmed.rfind('}')) {
        (Some(start), Some(end)) if end >= start => &trimmed[start..=end],
        _ => trimmed,
    }
}

pub(crate) fn parse_judge_rating(parsed: &serde_json::Value) -> String {
    if let Some(raw) = parsed["rating"].as_str() {
        match raw.trim().to_lowercase().as_str() {
            "critical" | "critico" | "critica" => return "critical".to_string(),
            "poor" | "scarso" => return "poor".to_string(),
            "fair" | "sufficiente" | "accettabile" | "discreto" => return "fair".to_string(),
            "good" | "buono" => return "good".to_string(),
            "excellent" | "ottimo" => return "excellent".to_string(),
            _ => {}
        }
    }

    "fair".to_string()
}

pub(crate) fn minimal_pipeline_config(
    review_provider_options: Option<ProviderRuntimeConfig>,
) -> PipelineConfig {
    PipelineConfig {
        source_language: String::new(),
        target_language: String::new(),
        stages: vec![],
        judge_prompt: String::new(),
        judge_model: String::new(),
        judge_provider: String::new(),
        glossary: vec![],
        use_chunking: None,
        markdown_aware: None,
        coherence_prompt: None,
        review_provider_options,
        persona: None,
    }
}
