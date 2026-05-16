import type { PipelineConfig, PipelineStageConfig, GlossaryEntry, StageRole } from '../../types';
import { defaultPersonaText } from '../../constants';

export type PromptPreviewKind = 'static' | 'runtime';

export interface PromptPreviewBlock {
  title: string;
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
  if (!glossary.length) {
    return 'No glossary entries were provided.';
  }

  return [
    '| Source | Target | Notes |',
    '|--------|--------|-------|',
    ...glossary.map((entry) => `| ${entry.term} | ${entry.translation} | ${entry.notes ?? ''} |`),
  ].join('\n');
}

function buildSourceAwareBlocks(config: PipelineConfig, stage: PipelineStageConfig): PromptPreviewBlock[] {
  const src = config.customSourceLanguage?.trim() || config.sourceLanguage;
  const tgt = config.customTargetLanguage?.trim() || config.targetLanguage;
  const persona = config.persona?.trim() || defaultPersonaText(src, tgt);
  const glossaryTable = formatGlossaryTable(config.glossary);

  const blocks: PromptPreviewBlock[] = [
    {
      title: 'System opener',
      body: persona,
      kind: 'static',
    },
    {
      title: 'Structural preservation rules',
      body: [
        'Preserve paragraph boundaries and line breaks unless the source is clearly malformed.',
        'Do not collapse repeated spaces, tabs, list structure, or footnote placement when they carry formatting meaning.',
      ].join('\n'),
      kind: 'static',
    },
    {
      title: 'Glossary constraints',
      body: glossaryTable,
      kind: 'static',
    },
  ];

  if (config.markdownAware) {
    blocks.push({
      title: 'Markdown preservation rules',
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
      title: 'Stage instructions',
      body: stage.prompt.trim() || 'No stage instructions yet.',
      kind: 'static',
    },
    {
      title: 'Runtime input',
      body: '{{SOURCE_CHUNK_TEXT}}',
      kind: 'runtime',
    },
    {
      title: 'Optional blob context',
      body: '{{BLOB_CONTEXT}}',
      kind: 'runtime',
    },
    {
      title: 'Runtime output contract',
      body: '{{OUTPUT_CONTRACT}}',
      kind: 'runtime',
    },
  );

  return blocks;
}

function buildFormatBlocks(stage: PipelineStageConfig): PromptPreviewBlock[] {
  return [
    {
      title: 'System post-processor',
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
      title: 'Stage instructions',
      body: stage.prompt.trim() || 'No formatting instructions yet.',
      kind: 'static',
    },
    {
      title: 'Runtime input',
      body: '{{TEXT_TO_FORMAT}}',
      kind: 'runtime',
    },
    {
      title: 'Runtime output contract',
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
