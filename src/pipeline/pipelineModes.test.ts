import { describe, it, expect } from 'vitest';
import { buildStagesForMode } from './pipelineModes';
import type { PipelineStageConfig } from '../types';

const NO_STAGES: PipelineStageConfig[] = [];

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
    it('produces exactly one translation stage', () => {
      const stages = buildStagesForMode('standard', NO_STAGES);
      expect(stages).toHaveLength(1);
      expect(stages[0].role).toBe('translation');
    });

    it('enables the stage regardless of input', () => {
      const stages = buildStagesForMode('standard', NO_STAGES);
      expect(stages[0].enabled).toBe(true);
    });
  });

  describe('editorial mode', () => {
    it('produces three stages in order: translation → refine → format', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(stages).toHaveLength(3);
      expect(stages.map((s) => s.role)).toEqual(['translation', 'refine', 'format']);
    });

    it('enables all stages', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(stages.every((s) => s.enabled)).toBe(true);
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
      expect(stages[0].model).toBe('gemini-2.5-flash');
      expect(stages[1].model).toBe('claude-opus-4-7');
      expect(stages[2].role).toBe('format'); // no existing match → default
      expect(stages[2].model).toBe('gpt-5-nano');
    });

    it('falls back to template defaults for stages without a matching existing role', () => {
      const stages = buildStagesForMode('editorial', NO_STAGES);
      expect(stages[0].prompt).toBeTruthy();
      expect(stages[1].prompt).toBeTruthy();
      expect(stages[2].prompt).toBeTruthy();
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
      expect(editorial[0].model).toBe('claude-sonnet-4-6');
      expect(editorial[1].role).toBe('refine');
      expect(editorial[2].role).toBe('format');
    });

    it('switching editorial → standard drops refine and format, retains translation config', () => {
      const editorial = buildStagesForMode('editorial', NO_STAGES);
      editorial[0] = { ...editorial[0], model: 'deepseek-v4-pro', provider: 'deepseek' };
      const std = buildStagesForMode('standard', editorial);
      expect(std).toHaveLength(1);
      expect(std[0].model).toBe('deepseek-v4-pro');
    });
  });
});

describe('buildStagesForMode — deepl-hybrid', () => {
  it('produce 2 stage: deepl-translation + refine', () => {
    const stages = buildStagesForMode('deepl-hybrid', []);
    expect(stages).toHaveLength(2);
    expect(stages[0].role).toBe('deepl-translation');
    expect(stages[0].provider).toBe('deepl');
    expect(stages[1].role).toBe('refine');
    expect(stages[1].provider).not.toBe('deepl');
  });

  it('preserva il prompt dello stage refine esistente', () => {
    const existing: PipelineStageConfig[] = [
      { id: 'stg-refine', role: 'refine', name: 'Refine', prompt: 'custom refine', model: 'gpt-5-nano', provider: 'openai', enabled: true },
    ];
    const stages = buildStagesForMode('deepl-hybrid', existing);
    expect(stages[1].prompt).toBe('custom refine');
  });

  it('lo stage deepl non ha prompt LLM', () => {
    const stages = buildStagesForMode('deepl-hybrid', []);
    expect(stages[0].prompt).toBe('');
  });
});
