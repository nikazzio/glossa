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
      'Correct only obvious formatting issues in the translation: broken markdown, misaligned footnotes, or inconsistent spacing. Do not add, remove, or change any bold, italic, or other emphasis markers. Do not alter meaning, wording, or content. Output only the corrected text.',
  },
};

const MODE_SEQUENCES: Record<PipelineMode, StageRole[]> = {
  standard: ['translation'],
  editorial: ['translation', 'refine', 'format'],
};

function buildStage(template: StageTemplate, existing?: PipelineStageConfig): PipelineStageConfig {
  return {
    id: template.id,
    name: template.name,
    role: template.role,
    prompt: existing?.prompt ?? template.defaultPrompt,
    model: existing?.model ?? 'gpt-4o-mini',
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
