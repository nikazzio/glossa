import { describe, it, expect } from 'vitest';
import {
  getKnownModelIds,
  getMissingPricingModels,
  getResolvedModelReasoning,
  getSelectableModelIds,
  MODEL_PROVIDER_ORDER,
} from './catalog';
import type { ModelProvider } from '../types';

describe('MODEL_CATALOG', () => {
  it('has pricing for every non-ollama model in the known provider catalog', () => {
    const modelOptions = Object.fromEntries(
      MODEL_PROVIDER_ORDER.map((provider) => [provider, getKnownModelIds(provider)]),
    ) as Partial<Record<ModelProvider, string[]>>;
    const missing = getMissingPricingModels(modelOptions);
    expect(missing).toEqual([]);
  });

  it('returns all catalog models for a cloud provider', () => {
    expect(getSelectableModelIds('openai')).toEqual(getKnownModelIds('openai'));
  });

  it('returns the supplied list for ollama', () => {
    expect(getSelectableModelIds('ollama', ['llama3', 'mistral'])).toEqual(['llama3', 'mistral']);
  });

  it('returns empty for ollama when no models provided', () => {
    expect(getSelectableModelIds('ollama')).toEqual([]);
  });

  it('resolves reasoning from the catalog for known ids', () => {
    expect(getResolvedModelReasoning('deepseek', 'deepseek-v4-flash')).toBe('optional');
    expect(getResolvedModelReasoning('anthropic', 'claude-sonnet-4-20250514')).toBe('optional');
  });

  it('falls back to provider-specific inference for unknown ids', () => {
    expect(getResolvedModelReasoning('openai', 'gpt-5-unknown')).toBe('optional');
    expect(getResolvedModelReasoning('openai', 'o9-mini')).toBe('reasoning');
  });
});
