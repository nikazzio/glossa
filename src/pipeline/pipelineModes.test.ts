import { describe, it, expect } from 'vitest';
import { buildStagesForMode } from './pipelineModes';
import type { PipelineStageConfig } from '../types';

const NO_STAGES: PipelineStageConfig[] = [];
const ALL_ROLES = ['translation', 'deepl-translation', 'refine', 'format'];

function byRole(stages: PipelineStageConfig[], role: string): PipelineStageConfig {
  const found = stages.find((s) => s.role === role);
  if (!found) throw new Error(`missing stage ${role}`);
  return found;
}

function enabledRoles(stages: PipelineStageConfig[]): string[] {
  return stages.filter((s) => s.enabled).map((s) => s.role ?? 'translation');
}

function stage(overrides: Partial<PipelineStageConfig>): PipelineStageConfig {
  return {
    id: 'stg-test',
    role: 'translation',
    name: 'Test',
    prompt: 'Translate.',
    model: 'gpt-5.4-nano',
    provider: 'openai',
    enabled: true,
    ...overrides,
  };
}

describe('buildStagesForMode', () => {
  describe('standard mode', () => {
    it('keeps every stage and enables only translation', () => {
      const stages = buildStagesForMode('standard', NO_STAGES);
      expect(stages.map((s) => s.role)).toEqual(ALL_ROLES);
      expect(enabledRoles(stages)).toEqual(['translation']);
    });

    it('enables the stage regardless of input', () => {
      const stages = buildStagesForMode('standard', NO_STAGES);
      expect(stages[0].enabled).toBe(true);
    });
  });

  describe('editorial mode', () => {
    it('enables translation → refine → format in order', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(enabledRoles(stages)).toEqual(['translation', 'refine', 'format']);
    });

    it('keeps the DeepL stage disabled', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(byRole(stages, 'deepl-translation').enabled).toBe(false);
    });
  });

  describe('config preservation', () => {
    it('preserves prompt, model, and provider from matching existing stage', () => {
      const existing = [stage({ role: 'translation', prompt: 'Custom prompt', model: 'claude-sonnet-4-6', provider: 'anthropic' })];
      const [result] = buildStagesForMode('standard', existing);
      expect(result.prompt).toBe('Custom prompt');
      expect(result.model).toBe('claude-sonnet-4-6');
      expect(result.provider).toBe('anthropic');
    });

    it('preserves providerOptions from matching existing stage', () => {
      const opts = { openai: { reasoningEffort: 'low' as const } };
      const existing = [stage({ role: 'translation', providerOptions: opts })];
      const [result] = buildStagesForMode('standard', existing);
      expect(result.providerOptions).toEqual(opts);
    });

    it('editorial mode preserves config for each matched role independently', () => {
      const existing = [
        stage({ role: 'translation', model: 'gemini-2.5-flash', provider: 'gemini' }),
        stage({ role: 'refine', model: 'claude-opus-4-7', provider: 'anthropic' }),
      ];
      const stages = buildStagesForMode('editorial', existing);
      expect(byRole(stages, 'translation').model).toBe('gemini-2.5-flash');
      expect(byRole(stages, 'refine').model).toBe('claude-opus-4-7');
      expect(byRole(stages, 'format').model).toBe('gpt-5.4-nano'); // no existing match → default
    });

    it('falls back to template defaults for stages without a matching existing role', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(byRole(stages, 'translation').prompt).toBeTruthy();
      expect(byRole(stages, 'refine').prompt).toBeTruthy();
      expect(byRole(stages, 'format').prompt).toBeTruthy();
    });

    it('always sets enabled=true regardless of the existing stage enabled flag', () => {
      const existing = [stage({ role: 'translation', enabled: false })];
      const [result] = buildStagesForMode('standard', existing);
      expect(result.enabled).toBe(true);
    });

    it('uses only the first matching stage when multiple share the same role', () => {
      const existing = [
        stage({ role: 'translation', prompt: 'First' }),
        stage({ role: 'translation', prompt: 'Second' }),
      ];
      const [result] = buildStagesForMode('standard', existing);
      expect(result.prompt).toBe('First');
    });
  });

  describe('mode switching', () => {
    it('switching standard → editorial retains translation config and adds default refine + format', () => {
      const std = buildStagesForMode('standard', [stage({ role: 'translation', model: 'claude-sonnet-4-6', provider: 'anthropic' })]);
      const editorial = buildStagesForMode('editorial', std);
      expect(byRole(editorial, 'translation').model).toBe('claude-sonnet-4-6');
      expect(enabledRoles(editorial)).toEqual(['translation', 'refine', 'format']);
    });

    it('switching editorial → standard disables refine and format but keeps their config', () => {
      const editorial = buildStagesForMode('editorial', NO_STAGES).map((s) =>
        s.role === 'translation' ? { ...s, model: 'deepseek-v4-pro', provider: 'deepseek' as const }
          : s.role === 'refine' ? { ...s, prompt: 'custom refine' } : s);
      const std = buildStagesForMode('standard', editorial);
      expect(enabledRoles(std)).toEqual(['translation']);
      expect(byRole(std, 'translation').model).toBe('deepseek-v4-pro');
      expect(byRole(std, 'refine').prompt).toBe('custom refine');
    });
  });
});

describe('buildStagesForMode — deepl-hybrid', () => {
  it('abilita deepl-translation + refine', () => {
    const stages = buildStagesForMode('deepl-hybrid', []);
    expect(enabledRoles(stages)).toEqual(['deepl-translation', 'refine']);
    expect(byRole(stages, 'deepl-translation').provider).toBe('deepl');
    expect(byRole(stages, 'refine').provider).not.toBe('deepl');
  });

  it('preserva il prompt dello stage refine esistente', () => {
    const existing: PipelineStageConfig[] = [
      { id: 'stg-refine', role: 'refine', name: 'Refine', prompt: 'custom refine', model: 'gpt-5-nano', provider: 'openai', enabled: true },
    ];
    const stages = buildStagesForMode('deepl-hybrid', existing);
    expect(byRole(stages, 'refine').prompt).toBe('custom refine');
  });

  it('lo stage deepl non ha prompt LLM', () => {
    const stages = buildStagesForMode('deepl-hybrid', []);
    expect(byRole(stages, 'deepl-translation').prompt).toBe('');
  });
});
