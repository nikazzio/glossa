import type { PipelineMode, PipelineStageConfig, StageRole } from '../types';

interface StageTemplate {
  id: string;
  role: StageRole;
  name: string;
  defaultPrompt: string;
}

const STAGE_TEMPLATES: Record<StageRole, StageTemplate> = {
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
      'Correct only technical formatting defects in the already translated text: broken Markdown syntax, broken footnote syntax, clearly corrupted spacing, or clearly corrupted line breaks. Do not alter meaning, wording, tone, or content. Do not add new emphasis, code, links, headings, lists, or other markup. Change existing Markdown markers only when required to restore valid syntax. Output the complete corrected text.',
  },
};

const MODE_SEQUENCES: Record<PipelineMode, StageRole[]> = {
  standard: ['translation'],
  editorial: ['translation', 'refine', 'format'],
};

function buildStage(template: StageTemplate, existing?: PipelineStageConfig): PipelineStageConfig {
  return {
    id: existing?.id ?? template.id,
    name: template.name,
    role: template.role,
    prompt: existing?.prompt ?? template.defaultPrompt,
    model: existing?.model ?? 'gpt-5-nano',
    provider: existing?.provider ?? 'openai',
    enabled: true,
    providerOptions: existing?.providerOptions,
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
