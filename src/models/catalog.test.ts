import { describe, it, expect } from 'vitest';
import {
  ensureModelInList,
  getKnownModelIds,
  getMissingPricingModels,
  getResolvedModelReasoning,
  getSelectableModelIds,
  MODEL_CATALOG,
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

  it('excludes deprecated models from the default selectable list', () => {
    const ids = getKnownModelIds('openai');
    expect(ids).not.toContain('gpt-4.1-mini');
    expect(ids).not.toContain('gpt-5');
    expect(ids).toContain('gpt-5.6-sol');
  });

  it('includes deprecated models when explicitly requested', () => {
    const ids = getKnownModelIds('openai', { includeDeprecated: true });
    expect(ids).toContain('gpt-4.1-mini');
    expect(ids).toContain('gpt-5.6-sol');
  });

  it('resolves real pricing and context window for a deprecated model', () => {
    const entry = MODEL_CATALOG.find((e) => e.provider === 'openai' && e.id === 'gpt-4.1-mini');
    expect(entry?.status).toBe('deprecated');
    expect(entry?.contextWindow).toBe(1_047_576);
    expect(entry?.pricing).toEqual({ input: 0.40, output: 1.60 });
  });

  it('ensureModelInList appends a missing current model without duplicating an existing one', () => {
    expect(ensureModelInList(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(ensureModelInList(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(ensureModelInList(['a', 'b'], '')).toEqual(['a', 'b']);
  });
});
