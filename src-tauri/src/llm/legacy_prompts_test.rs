//! Copia della composizione dei prompt prima della scomposizione in pezzi
//! (ottobre 2026): serve solo alle prove di equivalenza, che verificano che i
//! testi inviati non siano cambiati di un carattere.
#![allow(dead_code)]

use crate::llm::types::{CoherenceChunkInput, PipelineConfig, PromptBlock, StageConfig, StructuredPrompt};

fn format_glossary_table(glossary: &[crate::llm::types::GlossaryEntry]) -> String {
    super::prompts::format_glossary_table_for_tests(glossary)
}

fn format_few_shot_block(examples: &[crate::llm::types::FewShotExample]) -> String {
    super::prompts::format_few_shot_block_for_tests(examples)
}

fn work_brief_block(config: &PipelineConfig) -> String {
    config
        .work_brief
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|brief| format!("\n\nTranslation context:\n{brief}"))
        .unwrap_or_default()
}

pub(crate) fn build_stage_prompts(
    text: &str,
    stage: &StageConfig,
    config: &PipelineConfig,
    previous_result: Option<&str>,
    audit_context: Option<&str>,
) -> StructuredPrompt {
    if stage.role.as_deref() == Some("format") {
        return build_format_stage_prompts(text, stage);
    }

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

    let opener = "You are an expert translator and linguist. Follow the translation context and the instructions for the current stage.";

    let few_shot_block = format_few_shot_block(&config.few_shot_examples);
    let work_context = work_brief_block(config);

    // Block 1 (cacheable): static project-level context — role, work brief, constraints, glossary,
    // few-shot examples. Identical for every chunk in the run, so caches across the whole
    // document. Few-shot examples are folded into this same block (not a separate one) so
    // they consume no extra Anthropic cache breakpoint.
    let static_block = format!(
        "{opener}{work_context}\n\n\
         Structural Preservation Rules:\n\
         - Preserve paragraph boundaries and line breaks unless the source is clearly malformed\n\
         - Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning\n\n\
         {glossary_rules}{markdown_rules}{few_shot_block}",
    );

    let mut system = vec![PromptBlock {
        text: static_block,
        cacheable: true,
    }];

    // Blob context (cacheable) comes BEFORE stage instructions so all stable content
    // forms a contiguous prefix: [static + blob]. This lets every provider cache the
    // longest common prefix — Anthropic via a single breakpoint here, OpenAI/DeepSeek/
    // Gemini via automatic prefix caching — giving cache hits across all stages within
    // the same blob, not only within a single stage.
    if let Some(blob) = config.blob_context.as_deref().filter(|s| !s.is_empty()) {
        system.push(PromptBlock {
            text: format!(
                "[Reference document block - context only]\n\
                 This block may include the current chunk. Use it for terminology, continuity, names, pronouns, formatting, and narrative context.\n\
                 Do not translate this block as a whole. Translate only the current chunk identified in the user message.\n\
                 {blob}\n\
                 [End reference document block]"
            ),
            cacheable: true,
        });
    }

    // Stage-specific instructions come last: they vary per stage but are smaller than
    // the static+blob prefix, so non-caching them costs less than before.
    let glossary_reminder = "";
    let output_contract = if stage.role.as_deref() == Some("refine") {
        "Output the complete refined translation in full. Do not summarize, abbreviate, or output only the changed portions — rewrite the entire chunk from start to finish."
    } else {
        "Output only the translated text."
    };
    system.push(PromptBlock {
        text: format!(
            "Core Instructions:\n{}{}\n\n{}",
            stage.prompt, glossary_reminder, output_contract
        ),
        cacheable: false,
    });

    let current_chunk_line = config
        .blob_current_chunk_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|id| format!("Current chunk id: {id}\n\n"))
        .unwrap_or_default();

    let user = if stage.role.as_deref() == Some("refine") {
        let base = format!(
            "{current_chunk_line}Original text for the current chunk:\n{text}\n\n\
             Previous Iteration for the current chunk:\n{}\n\n\
             Refine only the current chunk according to your instructions. Output the complete refined translation in full — every sentence, from start to finish. Do not abbreviate or output only the changed portions.",
            previous_result.unwrap_or_default()
        );
        if let Some(ctx) = audit_context.filter(|s| !s.trim().is_empty()) {
            format!("{base}\n\n---\nPrevious audit findings to address:\n{ctx}\n---")
        } else {
            base
        }
    } else {
        format!(
            "{current_chunk_line}Text to translate from the current chunk:\n{text}\n\n\
             Translate only the current chunk. Output only its translation."
        )
    };

    StructuredPrompt::new(system, user)
}

fn build_format_stage_prompts(text: &str, stage: &StageConfig) -> StructuredPrompt {
    let system = vec![
        PromptBlock {
            text: "\
You are a deterministic text post-processor for already translated text.\n\
The input is already translated. Do not translate, retranslate, paraphrase, improve style, correct meaning, expand, shorten, or alter wording except where a minimal formatting repair requires it.\n\
Allowed changes: repair broken Markdown or footnote syntax, and restore clearly corrupted spacing or line breaks.\n\
Do not add new emphasis, code, link, heading, list, quote, table, or other markup. Change existing Markdown markers only when necessary to restore valid syntax.\n\
Return the complete text. If no change is needed, return the input exactly.\n\
Do not return explanations, comments, JSON, diffs, or 'no changes'."
                .to_string(),
            cacheable: true,
        },
        PromptBlock {
            text: format!("Core Formatting Instructions:\n{}\n\nOutput only the formatted text.", stage.prompt),
            cacheable: false,
        },
    ];

    let user = format!(
        "Text to format from the current chunk:\n{text}\n\n\
         Apply only the formatting instructions. Output only the complete formatted text."
    );

    StructuredPrompt::new(system, user)
}

pub(crate) fn build_judge_prompts(
    source_text: &str,
    translation: &str,
    config: &PipelineConfig,
) -> StructuredPrompt {
    let glossary_table = format_glossary_table(&config.glossary);
    let opener =
        "You are a translation quality judge. Evaluate the translation against the translation context.";
    let work_context = work_brief_block(config);
    let ui_lang = config
        .ui_language
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("English");

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
    // The source text and translation are in the user turn so this block is constant for the
    // whole project run, enabling near-100% cache hit rate across all chunk judge calls.
    let system_block = format!(
        "{opener}{work_context}\n\n\
         Specific Audit Instructions:\n{instructions}\n\n\
         {glossary_section}\
         {markdown_rules}\
         Scanning protocol: go through the translation sentence by sentence, checking every \
         sentence against the source for accuracy, every glossary term for adherence, grammar \
         for correctness, and fluency throughout. Complete the full scan before building the issues list. \
         Report EVERY issue you find and EVERY occurrence separately — do not merge, suppress, or \
         limit repeated issues.\n\n\
         You MUST respond with a valid JSON object containing:\n\
         - checkedSentenceIndices: array of 1-based source sentence numbers you verified, in scan order \
           (e.g. [1, 2, 3] for a 3-sentence source) — indices only, never the sentence text itself\n\
         - rating: one of 'critical', 'poor', 'fair', 'good', 'excellent' \
           (semantic translation quality: critical=unusable, poor=weak, fair=usable with revision, \
           good=solid, excellent=publication-ready)\n\
         - issues: array of objects with these fields:\n\
           - type: 'glossary'|'fluency'|'accuracy'|'grammar'\n\
           - severity: 'low'|'medium'|'high'\n\
           - description: string — explanation of the issue in {ui_lang}\n\
           - suggestedFix: string — how to correct it in {ui_lang}\n\
           - phrase: string or null — the exact verbatim substring of the WRONG or problematic text \
             as it appears in the TARGET translation (character-for-character copy from the target text)\n\
           - sourcePhrase: string or null — the exact verbatim substring from the SOURCE text \
             that corresponds to this issue\n\
           - confidence: number or null — your confidence this is a real issue (0.0–1.0)\n\
         Write description and suggestedFix in {ui_lang}. \
         Keep rating and type values as the English literals above.",
        instructions = config.judge_prompt,
    );

    let user = format!("Source: {source_text}\nTarget: {translation}\n\nPerform the audit now and return the JSON report.");

    StructuredPrompt {
        system: vec![PromptBlock {
            text: system_block,
            cacheable: true,
        }],
        user,
        images: Vec::new(),
    }
}

pub(crate) fn build_coherence_prompts(
    input: &CoherenceChunkInput,
    config: &PipelineConfig,
) -> StructuredPrompt {
    let glossary_table = format_glossary_table(&config.glossary);
    let opener =
        "You are a translation coherence auditor. Evaluate consistency against the translation context.";
    let work_context = work_brief_block(config);
    let ui_lang = config
        .ui_language
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("English");

    let default_instructions = "Evaluate ONLY:\n\
         1. Terminology consistency — key terms translated differently than in adjacent segments\n\
         2. Narrative continuity — abrupt breaks in flow at segment boundaries\n\
         3. Glossary adherence — glossary terms used inconsistently with context\n\
         Do NOT re-evaluate standalone translation quality.\n\
         Be exhaustive: scan ALL dimensions completely before responding. Do not stop after finding \
         the first issue of each type. Only return an empty issues array if you are fully confident \
         — after deliberate review of every dimension — that no problems exist.";

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
    // Constant for the whole project run.
    let system_block = format!(
        "{opener}{work_context}\n\
         Your task: identify cross-segment inconsistencies between a translated segment and its surrounding context.\n\
         {instructions}\n\
         {glossary_section}\
         Write description and suggestedFix values in {ui_lang}.\n\
         Respond with valid JSON only:\n\
         {{\"issues\": [{{\"type\": \"consistency\"|\"glossary\", \
         \"severity\": \"low\"|\"medium\"|\"high\", \
         \"description\": \"string\", \
         \"suggestedFix\": \"string\", \
         \"phrase\": \"exact verbatim substring of the WRONG text as it appears in the target translation, not the source term nor the correction; first occurrence only\"}}]}}",
    );

    // Block 2 (cacheable): reference document block. Identical for every chunk in the same
    // blob, so it's a second cache breakpoint — placed in system, not the user turn, so
    // providers actually cache it instead of rebilling it at full price on every chunk.
    let context_block = input
        .blob_context
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|ctx| format!(
            "[Reference translated document block - context only]\n\
             This block may include the current chunk. Use it to compare terminology and continuity across the document block.\n\
             The current chunk to audit is identified below.\n\
             {ctx}\n\
             [End reference translated document block]"
        ));

    let current_chunk_line = input
        .current_chunk_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|id| format!("Current chunk id: {id}\n\n"))
        .unwrap_or_default();

    let user = format!(
        "{current_chunk_line}[Current segment]\nOriginal: {original}\nTranslation: {translation}\n\
         [End of current segment]\n\n\
         Identify cross-segment coherence issues and return the JSON. If no issues, return {{\"issues\": []}}.",
        original = input.original,
        translation = input.translation,
    );

    let mut system = vec![PromptBlock {
        text: system_block,
        cacheable: true,
    }];
    if let Some(ctx) = context_block {
        system.push(PromptBlock {
            text: ctx,
            cacheable: true,
        });
    }

    StructuredPrompt::new(system, user)
}

mod equivalence {
    use crate::llm::prompts;
    use crate::llm::types::{
        CoherenceChunkInput, FewShotExample, GlossaryEntry, PipelineConfig, StageConfig,
        StructuredPrompt,
    };

    fn same(new: StructuredPrompt, old: StructuredPrompt) {
        assert_eq!(new.system.len(), old.system.len());
        for (a, b) in new.system.iter().zip(old.system.iter()) {
            assert_eq!(a.text, b.text);
            assert_eq!(a.cacheable, b.cacheable);
        }
        assert_eq!(new.user, old.user);
    }

    fn configs() -> Vec<PipelineConfig> {
        let bare = PipelineConfig::default();
        let full = PipelineConfig {
            work_brief: Some("Venetian, 17th century, into Italian.".into()),
            glossary: vec![GlossaryEntry {
                term: "arma".into(),
                translation: "arms".into(),
                notes: Some("heraldic".into()),
            }],
            few_shot_examples: vec![FewShotExample {
                source_text: "uno".into(),
                target_text: "one".into(),
                label: None,
            }],
            markdown_aware: Some(true),
            coherence_prompt: Some("Check names only.".into()),
            ui_language: Some("Italian".into()),
            blob_context: Some("<chunk id=\"c1\">x</chunk>".into()),
            blob_current_chunk_id: Some("c1".into()),
            judge_prompt: "Be strict.".into(),
            ..PipelineConfig::default()
        };
        vec![bare, full]
    }

    fn stage(role: &str) -> StageConfig {
        StageConfig {
            id: "s".into(),
            name: "S".into(),
            role: Some(role.into()),
            prompt: "Do it.".into(),
            model: "m".into(),
            provider: "openai".into(),
            enabled: true,
            provider_options: None,
            custom_provider_id: None,
        }
    }

    #[test]
    fn composed_prompts_are_byte_identical_to_the_previous_builders() {
        for config in configs() {
            for role in ["translation", "refine", "format"] {
                let s = stage(role);
                for (prev, audit) in [(None, None), (Some("prev"), Some("fix X"))] {
                    same(
                        prompts::build_stage_prompts("Hello", &s, &config, prev, audit),
                        super::build_stage_prompts("Hello", &s, &config, prev, audit),
                    );
                }
            }
            same(
                prompts::build_judge_prompts("src", "tgt", &config),
                super::build_judge_prompts("src", "tgt", &config),
            );
            for blob in [None, Some("<b>".to_string())] {
                let input = CoherenceChunkInput {
                    original: "o".into(),
                    translation: "t".into(),
                    blob_context: blob,
                    current_chunk_id: Some("c1".into()),
                };
                same(
                    prompts::build_coherence_prompts(&input, &config),
                    super::build_coherence_prompts(&input, &config),
                );
            }
        }
    }
}
