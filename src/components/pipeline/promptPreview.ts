import type { PipelineConfig, PipelineStageConfig, GlossaryEntry, StageRole } from '../../types';
import { defaultPersonaText } from '../../constants';

export type PromptPreviewKind = 'static' | 'runtime';

export interface PromptPreviewBlock {
  id:
    | 'system-opener'
    | 'structural-rules'
    | 'glossary-constraints'
    | 'markdown-rules'
    | 'blob-context'
    | 'stage-instructions'
    | 'current-chunk-id'
    | 'source-chunk-text'
    | 'previous-stage-result'
    | 'runtime-task'
    | 'output-contract'
    | 'system-post-processor';
  body: string;
  kind: PromptPreviewKind;
}

export interface PromptPreviewStage {
  id: string;
  name: string;
  role: StageRole;
  blocks: PromptPreviewBlock[];
}

function formatGlossaryTable(glossary: GlossaryEntry[]): string {
  return [
    '| Source | Target | Notes |',
    '|--------|--------|-------|',
    ...glossary.map((entry) => `| ${entry.term} | ${entry.translation} | ${entry.notes ?? ''} |`),
  ].join('\n');
}

function buildGlossaryConstraints(glossary: GlossaryEntry[]): string {
  if (!glossary.length) {
    return 'Glossary Constraints:\n- No glossary entries were provided.';
  }

  return [
    'Glossary Constraints:',
    '- Treat every glossary entry as mandatory terminology, not as a suggestion',
    '- When a source glossary term appears, use the required target term exactly unless the notes explicitly justify a variant',
    '- Preserve case, product names, abbreviations, and domain terminology consistently across the whole translation',
    '- Do not omit glossary terms, paraphrase them away, or replace them with near-synonyms',
    '- If a glossary term appears inside Markdown, links, or footnotes, still apply the glossary while preserving the surrounding syntax',
    '- Glossary:',
    formatGlossaryTable(glossary),
  ].join('\n');
}

function buildSourceAwareBlocks(config: PipelineConfig, stage: PipelineStageConfig): PromptPreviewBlock[] {
  const src = config.customSourceLanguage?.trim() || config.sourceLanguage;
  const tgt = config.customTargetLanguage?.trim() || config.targetLanguage;
  const persona = config.persona?.trim() || defaultPersonaText(src, tgt);
  const glossaryConstraints = buildGlossaryConstraints(config.glossary);

  const glossaryReminder = config.glossary.length
    ? '\n\nGlossary Reminder:\n- Apply the glossary entries specified above when they appear in the source text.'
    : '';
  const outputContract = stage.role === 'refine'
    ? 'Output only the refined translation.'
    : 'Output only the translated text.';
  const blocks: PromptPreviewBlock[] = [
    {
      id: 'system-opener',
      body: persona,
      kind: 'static',
    },
    {
      id: 'structural-rules',
      body: [
        'Preserve paragraph boundaries and line breaks unless the source is clearly malformed.',
        'Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning.',
      ].join('\n'),
      kind: 'static',
    },
    {
      id: 'glossary-constraints',
      body: glossaryConstraints,
      kind: 'static',
    },
  ];

  if (config.markdownAware) {
    blocks.push({
      id: 'markdown-rules',
      body: [
        'Preserve every Markdown marker exactly as needed (*, **, _, [], (), headings, lists, block quotes, footnotes).',
        'Do not remove, reformat, or invent Markdown structure.',
        'Translate only the human-language content while keeping Markdown syntax valid.',
      ].join('\n'),
      kind: 'static',
    });
  }

  blocks.push(
    {
      id: 'blob-context',
      body: '{{BLOB_CONTEXT}}',
      kind: 'runtime',
    },
    {
      id: 'stage-instructions',
      body: `Core Instructions:\n${stage.prompt.trim() || 'No stage instructions yet.'}${glossaryReminder}\n\n${outputContract}`,
      kind: 'static',
    },
    {
      id: 'current-chunk-id',
      body: 'Current chunk id: {{CURRENT_CHUNK_ID}}',
      kind: 'runtime',
    },
    {
      id: 'source-chunk-text',
      body: stage.role === 'refine'
        ? 'Original text for the current chunk:\n{{SOURCE_CHUNK_TEXT}}'
        : 'Text to translate from the current chunk:\n{{SOURCE_CHUNK_TEXT}}',
      kind: 'runtime',
    },
    ...(stage.role === 'refine'
      ? [{
          id: 'previous-stage-result' as const,
          body: 'Previous Iteration for the current chunk:\n{{PREVIOUS_STAGE_RESULT}}',
          kind: 'runtime' as const,
        }]
      : []),
    {
      id: 'runtime-task',
      body: stage.role === 'refine'
        ? 'Refine only the current chunk according to your instructions.'
        : 'Translate only the current chunk.',
      kind: 'runtime',
    },
    {
      id: 'output-contract',
      body: outputContract,
      kind: 'runtime',
    },
  );

  return blocks;
}

function buildFormatBlocks(stage: PipelineStageConfig): PromptPreviewBlock[] {
  return [
    {
      id: 'system-post-processor',
      body: [
        'You are a deterministic text post-processor for already translated text.',
        'The input is already translated. Do not translate, retranslate, paraphrase, improve style, correct meaning, expand, shorten, or alter wording except where a minimal formatting repair requires it.',
        'Allowed changes: repair broken Markdown or footnote syntax, and restore clearly corrupted spacing or line breaks.',
        'Do not add new emphasis, code, link, heading, list, quote, table, or other markup. Change existing Markdown markers only when necessary to restore valid syntax.',
        'Return the complete text. If no change is needed, return the input exactly.',
        'Do not return explanations, comments, JSON, diffs, or "no changes".',
      ].join('\n'),
      kind: 'static',
    },
    {
      id: 'stage-instructions',
      body: stage.prompt.trim() || 'No formatting instructions yet.',
      kind: 'static',
    },
    {
      id: 'source-chunk-text',
      body: 'Text to format from the current chunk:\n{{TEXT_TO_FORMAT}}',
      kind: 'runtime',
    },
    {
      id: 'runtime-task',
      body: 'Apply only the formatting instructions.',
      kind: 'runtime',
    },
    {
      id: 'output-contract',
      body: 'Output only the formatted text.',
      kind: 'runtime',
    },
  ];
}

export function buildPromptPreviewStages(config: PipelineConfig): PromptPreviewStage[] {
  return config.stages
    .filter((stage) => stage.enabled)
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      role: stage.role ?? 'translation',
      blocks:
        stage.role === 'format'
          ? buildFormatBlocks(stage)
          : buildSourceAwareBlocks(config, stage),
    }));
}
