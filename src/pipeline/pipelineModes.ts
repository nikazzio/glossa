import type { ModelProvider, PipelineMode, PipelineStageConfig, StageRole } from '../types';
import { DEFAULT_DEEPL_STAGE_OPTIONS } from '../constants';

interface StageTemplate {
  id: string;
  role: StageRole;
  name: string;
  defaultPrompt: string;
  defaultProvider?: ModelProvider;
}

export const STAGE_TEMPLATES: Record<StageRole, StageTemplate> = {
  'deepl-translation': {
    id: 'stg-deepl',
    role: 'deepl-translation',
    name: 'DeepL Translation',
    defaultPrompt: '',
    defaultProvider: 'deepl',
  },
  translation: {
    id: 'stg-translation',
    role: 'translation',
    name: 'Translation',
    defaultPrompt: 'Translate the text accurately.',
  },
  refine: {
    id: 'stg-refine',
    role: 'refine',
    name: 'Refine',
    defaultPrompt:
      'Review the translation against the original. Correct inaccuracies, improve fluency, and ensure the tone matches the original intent.',
  },
  format: {
    id: 'stg-format',
    role: 'format',
    name: 'Format',
    defaultPrompt:
      'Clean up the already translated text. Remove all footnote markers and inline footnote references (e.g. [^1], [1], superscript numbers) — footnotes are managed separately and must not appear in the translation. Then correct only technical formatting defects: broken Markdown syntax, clearly corrupted spacing, or clearly corrupted line breaks. Do not alter meaning, wording, tone, or content. Do not add new emphasis, code, links, headings, lists, or other markup. Change existing Markdown markers only when required to restore valid syntax. Output the complete corrected text.',
  },
};

const MODE_SEQUENCES: Record<PipelineMode, StageRole[]> = {
  standard: ['translation'],
  editorial: ['translation', 'refine', 'format'],
  'deepl-hybrid': ['deepl-translation', 'refine'],
};

function buildStage(template: StageTemplate, existing?: PipelineStageConfig): PipelineStageConfig {
  const baseOptions = existing?.providerOptions ?? {};
  const providerOptions = template.defaultProvider === 'deepl'
    ? { ...baseOptions, deepl: baseOptions.deepl ?? DEFAULT_DEEPL_STAGE_OPTIONS }
    : baseOptions;

  return {
    id: existing?.id ?? template.id,
    name: template.name,
    role: template.role,
    prompt: existing?.prompt ?? template.defaultPrompt,
    model: existing?.model ?? (template.defaultProvider === 'deepl' ? '' : 'gpt-5-nano'),
    provider: existing?.provider ?? (template.defaultProvider ?? 'openai'),
    enabled: true,
    providerOptions,
  };
}

/**
 * Build the stages array for a given mode, preserving existing stage config
 * (prompt, model, provider, options) where the role matches.
 */
export function buildStagesForMode(
  mode: PipelineMode,
  currentStages: PipelineStageConfig[],
): PipelineStageConfig[] {
  const byRole = new Map<string, PipelineStageConfig>();
  for (const s of currentStages) {
    const role = s.role ?? 'translation';
    if (!byRole.has(role)) byRole.set(role, s);
  }
  return MODE_SEQUENCES[mode].map((role) => buildStage(STAGE_TEMPLATES[role], byRole.get(role)));
}
