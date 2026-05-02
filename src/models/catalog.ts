import type { ModelProvider } from '../types';

export type ModelStatus = 'stable' | 'preview' | 'deprecated';

export interface ModelEntry {
  id: string;
  provider: ModelProvider;
  status: ModelStatus;
  pricing?: { input: number; output: number }; // USD per 1M tokens; undefined = free/local
}

// Last reviewed: 2026-05
// Source: official provider pricing pages
export const MODEL_CATALOG: ModelEntry[] = [
  // Gemini
  { id: 'gemini-3-flash-preview',        provider: 'gemini',    status: 'preview', pricing: { input: 0.075, output: 0.30  } },
  { id: 'gemini-3.1-pro-preview',        provider: 'gemini',    status: 'preview', pricing: { input: 1.25,  output: 5.00  } },
  { id: 'gemini-2.5-flash-lite-preview', provider: 'gemini',    status: 'preview', pricing: { input: 0.10,  output: 0.40  } },
  // OpenAI
  { id: 'gpt-4o',                        provider: 'openai',    status: 'stable',  pricing: { input: 2.50,  output: 10.00 } },
  { id: 'gpt-4o-mini',                   provider: 'openai',    status: 'stable',  pricing: { input: 0.15,  output: 0.60  } },
  { id: 'o1-preview',                    provider: 'openai',    status: 'preview', pricing: { input: 15.00, output: 60.00 } },
  // Anthropic
  { id: 'claude-3-5-sonnet-latest',      provider: 'anthropic', status: 'stable',  pricing: { input: 3.00,  output: 15.00 } },
  { id: 'claude-3-haiku-latest',         provider: 'anthropic', status: 'stable',  pricing: { input: 0.25,  output: 1.25  } },
  // DeepSeek
  { id: 'deepseek-chat',                 provider: 'deepseek',  status: 'stable',  pricing: { input: 0.27,  output: 1.10  } },
  { id: 'deepseek-reasoner',             provider: 'deepseek',  status: 'stable',  pricing: { input: 0.55,  output: 2.19  } },
];

export function getModelEntry(provider: string, modelId: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((e) => e.provider === provider && e.id === modelId);
}

export function getModelStatus(provider: string, modelId: string): ModelStatus | undefined {
  return getModelEntry(provider, modelId)?.status;
}

/** Returns model IDs that are in MODEL_OPTIONS but lack a pricing entry (excluding ollama). */
export function getMissingPricingModels(modelOptions: Record<string, string[]>): string[] {
  const missing: string[] = [];
  for (const [provider, models] of Object.entries(modelOptions)) {
    if (provider === 'ollama') continue;
    for (const modelId of models) {
      const entry = getModelEntry(provider, modelId);
      if (!entry || !entry.pricing) {
        missing.push(`${provider}/${modelId}`);
      }
    }
  }
  return missing;
}
