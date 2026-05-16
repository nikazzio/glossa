import { describe, it, expect } from 'vitest';
import { getKnownModelIds, getMissingPricingModels, getSelectableModelIds, MODEL_PROVIDER_ORDER } from './catalog';
import type { ModelProvider } from '../types';

describe('MODEL_CATALOG', () => {
  it('has pricing for every non-ollama model in the known provider catalog', () => {
    const modelOptions = Object.fromEntries(
      MODEL_PROVIDER_ORDER.map((provider) => [provider, getKnownModelIds(provider)]),
    ) as Partial<Record<ModelProvider, string[]>>;
    const missing = getMissingPricingModels(modelOptions);
    expect(missing).toEqual([]);
  });

  it('falls back to all available models when a provider has no saved curation yet', () => {
    expect(getSelectableModelIds('openai')).toEqual(getKnownModelIds('openai'));
  });

  it('returns only user-enabled models when a provider has an explicit curated list', () => {
    expect(
      getSelectableModelIds('openai', {
        enabledModelIds: ['o4-mini'],
        availableModelIds: getKnownModelIds('openai'),
      }),
    ).toEqual(['o4-mini']);
  });

  it('allows an explicit empty curated list to hide a provider from pickers', () => {
    expect(
      getSelectableModelIds('openai', {
        enabledModelIds: [],
        availableModelIds: getKnownModelIds('openai'),
      }),
    ).toEqual([]);
  });
});
