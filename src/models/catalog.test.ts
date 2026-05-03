import { describe, it, expect } from 'vitest';
import { getMissingPricingModels } from './catalog';
import { MODEL_OPTIONS } from '../constants';

describe('MODEL_CATALOG', () => {
  it('has pricing for every non-ollama model in MODEL_OPTIONS', () => {
    const missing = getMissingPricingModels(MODEL_OPTIONS);
    expect(missing).toEqual([]);
  });
});
