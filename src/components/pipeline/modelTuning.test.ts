import { describe, expect, it } from 'vitest';
import { getModelTuning, withoutReasoningEffort, withReasoningEffort, withTemperature } from './modelTuning';

describe('modelTuning', () => {
  it('maps Gemini thinking budgets to reasoning levels and back', () => {
    expect(withReasoningEffort('gemini', undefined, 'low')).toEqual({ gemini: { thinkingBudget: 1024 } });
    expect(withReasoningEffort('gemini', undefined, 'high')).toEqual({ gemini: { thinkingBudget: -1 } });
    expect(getModelTuning('gemini', 'any-model', { gemini: { thinkingBudget: 8192 } }).reasoningEffort).toBe('medium');
    expect(getModelTuning('gemini', 'any-model', { gemini: { thinkingBudget: -1 } }).reasoningEffort).toBe('high');
  });

  it('stores the reasoning level for OpenAI without touching other options', () => {
    const next = withReasoningEffort('openai', { openai: { temperature: 0.4 } }, 'high');
    expect(next).toEqual({ openai: { temperature: 0.4, reasoningEffort: 'high' } });
  });

  it('clears the reasoning level when the model changes', () => {
    expect(withoutReasoningEffort('deepseek', { deepseek: { reasoningEffort: 'low' } })).toEqual({
      deepseek: { reasoningEffort: undefined },
    });
  });

  it('writes temperature under the provider and caps Anthropic at 1', () => {
    expect(withTemperature('anthropic', undefined, 0.7)).toEqual({ anthropic: { temperature: 0.7 } });
    expect(getModelTuning('anthropic', 'any-model', undefined).temperatureMax).toBe(1);
    expect(getModelTuning('openai', 'any-model', undefined).temperatureMax).toBe(2);
  });

  it('has no temperature or reasoning controls for Ollama', () => {
    const tuning = getModelTuning('ollama', 'llama3', undefined);
    expect(tuning.supportsTemperature).toBe(false);
    expect(tuning.showReasoning).toBe(false);
  });
});
