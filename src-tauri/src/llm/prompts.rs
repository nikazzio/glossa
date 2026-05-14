use crate::llm::types::{CoherenceChunkInput, PipelineConfig, PromptBlock, ProviderRuntimeConfig, StageConfig, StructuredPrompt};

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

fn format_glossary_table(glossary: &[crate::llm::types::GlossaryEntry]) -> String {
    if glossary.is_empty() {
        return String::new();
    }
    let mut table = "| Source | Target | Notes |\n|--------|--------|-------|\n".to_string();
    for entry in glossary {
        table.push_str(&format!(
            "| {} | {} | {} |\n",
            entry.term,
            entry.translation,
            entry.notes.as_deref().unwrap_or(""),
        ));
    }
    table
}

fn effective_source<'a>(config: &'a PipelineConfig) -> &'a str {
    config
        .custom_source_language
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&config.source_language)
}

fn effective_target<'a>(config: &'a PipelineConfig) -> &'a str {
    config
        .custom_target_language
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&config.target_language)
}

pub(crate) fn build_stage_prompts(
    text: &str,
    stage: &StageConfig,
    config: &PipelineConfig,
    previous_result: &Option<String>,
) -> StructuredPrompt {
    let glossary_table = format_glossary_table(&config.glossary);

    let markdown_rules = if config.markdown_aware.unwrap_or(false) {
        "\n\nMarkdown Preservation Rules:\n\
         - Preserve every Markdown marker exactly as needed (*, **, _, [], (), headings, lists, block quotes, footnotes)\n\
         - Do not remove, reformat, or invent Markdown structure\n\
         - Translate only the human-language content while keeping Markdown syntax valid"
    } else {
        ""
    };

    let glossary_rules = if glossary_table.is_empty() {
        "Glossary Constraints:\n- No glossary entries were provided.".to_string()
    } else {
        format!(
            "Glossary Constraints:\n\
             - Treat every glossary entry as mandatory terminology, not as a suggestion\n\
             - When a source glossary term appears, use the required target term exactly unless the notes explicitly justify a variant\n\
             - Preserve case, product names, abbreviations, and domain terminology consistently across the whole translation\n\
             - Do not omit glossary terms, paraphrase them away, or replace them with near-synonyms\n\
             - If a glossary term appears inside Markdown, links, or footnotes, still apply the glossary while preserving the surrounding syntax\n\
             - Glossary:\n{}",
            glossary_table,
        )
    };

    let src = effective_source(config);
    let tgt = effective_target(config);

    let default_opener = format!(
        "You are an expert translator and linguist specialized in {src} to {tgt} translation.",
    );
    let opener = config
        .persona
        .as_deref()
        .filter(|p| !p.trim().is_empty())
        .unwrap_or(&default_opener);

    // Block 1 (cacheable): static project-level context — persona, constraints, glossary.
    // Identical for every chunk in the run, so caches across the whole document.
    let static_block = format!(
        "{opener}\n\n\
         Structural Preservation Rules:\n\
         - Preserve paragraph boundaries and line breaks unless the source is clearly malformed\n\
         - Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning\n\n\
         {glossary_rules}{markdown_rules}",
    );

    // Block 2: stage-specific instructions. Constant within a stage run but varies
    // across stages, so we don't mark it cacheable (its position shifts with stage.prompt length).
    let stage_block = format!("Core Instructions:\n{}", stage.prompt);

    let mut system = vec![
        PromptBlock { text: static_block, cacheable: true },
        PromptBlock { text: stage_block, cacheable: false },
    ];

    // Block 3 (cacheable): blob context — full text of all chunks in the same blob.
    // Constant for every chunk call within a blob, enabling cache reuse across the blob.
    if let Some(blob) = config.blob_context.as_deref().filter(|s| !s.is_empty()) {
        system.push(PromptBlock {
            text: format!(
                "[Reference document context — do not translate, use for terminology and narrative coherence]\n\
                 {blob}\n\
                 [End of reference context]"
            ),
            cacheable: true,
        });
    }

    let user = match previous_result {
        Some(prev) if !prev.is_empty() => format!(
            "Original: {text}\n\nPrevious Iteration: {prev}\n\n\
             Refine the above translation according to your instructions. Provide ONLY the final text."
        ),
        _ => format!("Text to translate: {text}\n\nProvide ONLY the translated text."),
    };

    StructuredPrompt { system, user }
}

pub(crate) fn build_judge_prompts(
    original_text: &str,
    translation: &str,
    config: &PipelineConfig,
) -> StructuredPrompt {
    let glossary_table = format_glossary_table(&config.glossary);
    let src = effective_source(config);
    let tgt = effective_target(config);
    let ui_lang = config
        .ui_language
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(tgt);

    let glossary_section = if glossary_table.is_empty() {
        String::new()
    } else {
        format!("Glossary to adhere to:\n{glossary_table}\n\n")
    };

    let markdown_rules = if config.markdown_aware.unwrap_or(false) {
        "When Markdown is present, verify that the translation preserves markers, footnotes, \
         inline emphasis, and block structure exactly enough to remain valid Markdown.\n\n"
    } else {
        ""
    };

    // Block 1 (cacheable): static judge context — role, instructions, glossary, format spec.
    // original_text and translation are in the user turn so this block is constant for the
    // whole project run, enabling near-100% cache hit rate across all chunk judge calls.
    let system_block = format!(
        "You are a translation quality judge for {src}→{tgt} translations.\n\n\
         Specific Audit Instructions:\n{instructions}\n\n\
         {glossary_section}\
         {markdown_rules}\
         You MUST respond with a valid JSON object containing:\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects {{ type: 'glossary'|'fluency'|'accuracy'|'grammar', \
           severity: 'low'|'medium'|'high', description: string, suggestedFix: string }}\n\
         Write all description and suggestedFix values in {ui_lang}. \
         Keep the rating value as one of the English literals above.",
        instructions = config.judge_prompt,
    );

    let user = format!(
        "Source ({src}): {original_text}\n\
         Target ({tgt}): {translation}\n\n\
         Perform the audit now and return the JSON report."
    );

    StructuredPrompt {
        system: vec![PromptBlock { text: system_block, cacheable: true }],
        user,
    }
}

pub(crate) fn build_coherence_prompts(
    input: &CoherenceChunkInput,
    config: &PipelineConfig,
) -> StructuredPrompt {
    let glossary_table = format_glossary_table(&config.glossary);
    let src = effective_source(config);
    let tgt = effective_target(config);
    let ui_lang = config
        .ui_language
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(tgt);

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

    let glossary_section = if glossary_table.is_empty() {
        String::new()
    } else {
        format!("Glossary:\n{glossary_table}\n\n")
    };

    // Block 1 (cacheable): static coherence context — role, instructions, glossary, format spec.
    // Constant for the whole project run; blob_context (translated neighbors) stays in user turn
    // since it changes per chunk and cannot be cached.
    let system_block = format!(
        "You are a translation coherence auditor for {src}→{tgt} translations.\n\
         Your task: identify cross-segment inconsistencies between a translated segment and its surrounding context.\n\
         {instructions}\n\
         {glossary_section}\
         Write all description and suggestedFix values in {ui_lang}.\n\
         Respond with valid JSON only:\n\
         {{\"issues\": [{{\"type\": \"consistency\"|\"glossary\", \
         \"severity\": \"low\"|\"medium\"|\"high\", \
         \"description\": \"string\", \"suggestedFix\": \"string\"}}]}}",
    );

    let context_block = input
        .blob_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| format!(
            "[Surrounding translated segments from the same document block — context only]\n{ctx}\n\
             [End of surrounding context]\n\n"
        ))
        .unwrap_or_default();

    let user = format!(
        "{context_block}[Current segment]\nOriginal: {original}\nTranslation: {translation}\n\
         [End of current segment]\n\n\
         Identify cross-segment coherence issues and return the JSON. If no issues, return {{\"issues\": []}}.",
        original = input.original,
        translation = input.translation,
    );

    StructuredPrompt {
        system: vec![PromptBlock { text: system_block, cacheable: true }],
        user,
    }
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
        ui_language: None,
        custom_source_language: None,
        custom_target_language: None,
        blob_context: None,
    }
}
