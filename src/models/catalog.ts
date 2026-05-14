import type { ModelProvider, PipelineStageConfig } from '../types';

export type ModelStatus = 'stable' | 'preview' | 'deprecated';

export interface ModelEntry {
  id: string;
  provider: ModelProvider;
  status: ModelStatus;
  contextWindow: number; // tokens
  pricing?: { input: number; output: number }; // USD per 1M tokens; undefined = free/local
}

// Last reviewed: 2026-05
// Source: official provider pricing pages
export const MODEL_CATALOG: ModelEntry[] = [
  // Gemini
  { id: 'gemini-3-flash-preview',        provider: 'gemini',    status: 'preview', contextWindow: 1_048_576, pricing: { input: 0.075, output: 0.30  } },
  { id: 'gemini-3.1-pro-preview',        provider: 'gemini',    status: 'preview', contextWindow: 1_048_576, pricing: { input: 1.25,  output: 5.00  } },
  { id: 'gemini-2.5-flash-lite-preview', provider: 'gemini',    status: 'preview', contextWindow: 1_048_576, pricing: { input: 0.10,  output: 0.40  } },
  // OpenAI
  { id: 'gpt-4o',                        provider: 'openai',    status: 'stable',  contextWindow: 128_000,   pricing: { input: 2.50,  output: 10.00 } },
  { id: 'gpt-4o-mini',                   provider: 'openai',    status: 'stable',  contextWindow: 128_000,   pricing: { input: 0.15,  output: 0.60  } },
  { id: 'o1-preview',                    provider: 'openai',    status: 'preview', contextWindow: 128_000,   pricing: { input: 15.00, output: 60.00 } },
  // Anthropic
  { id: 'claude-3-5-sonnet-latest',      provider: 'anthropic', status: 'stable',  contextWindow: 200_000,   pricing: { input: 3.00,  output: 15.00 } },
  { id: 'claude-3-haiku-latest',         provider: 'anthropic', status: 'stable',  contextWindow: 200_000,   pricing: { input: 0.25,  output: 1.25  } },
  // DeepSeek
  { id: 'deepseek-chat',                 provider: 'deepseek',  status: 'stable',  contextWindow: 64_000,    pricing: { input: 0.27,  output: 1.10  } },
  { id: 'deepseek-reasoner',             provider: 'deepseek',  status: 'stable',  contextWindow: 64_000,    pricing: { input: 0.55,  output: 2.19  } },
];

export function getModelEntry(provider: ModelProvider, modelId: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((e) => e.provider === provider && e.id === modelId);
}

export function getModelStatus(provider: ModelProvider, modelId: string): ModelStatus | undefined {
  return getModelEntry(provider, modelId)?.status;
}

const OLLAMA_BLOB_FALLBACK = 4_096;
const BLOB_CONTEXT_RATIO = 0.5;
const BLOB_CONTEXT_MAX = 32_000;
const TOKENS_PER_WORD = 1.3;
const PROMPT_OVERHEAD_TOKENS = 1_000;
const SAFE_MARGIN = 0.8;

/**
 * Derives the blob token budget from the first enabled stage's model.
 * Returns the budget and the model ID used as the basis.
 * Caps at BLOB_CONTEXT_MAX to keep prompts practical even on 1M-token models.
 */
export function calculateBlobBudget(stages: PipelineStageConfig[]): { budget: number; modelId: string } {
  const firstEnabled = stages.find((s) => s.enabled);
  if (!firstEnabled) return { budget: OLLAMA_BLOB_FALLBACK, modelId: '' };
  if (firstEnabled.provider === 'ollama') {
    const numCtx = firstEnabled.providerOptions?.ollama?.numCtx;
    const budget = numCtx
      ? Math.min(Math.floor(numCtx * BLOB_CONTEXT_RATIO), BLOB_CONTEXT_MAX)
      : OLLAMA_BLOB_FALLBACK;
    return { budget, modelId: firstEnabled.model };
  }
  const entry = getModelEntry(firstEnabled.provider, firstEnabled.model);
  if (!entry) return { budget: OLLAMA_BLOB_FALLBACK, modelId: firstEnabled.model };
  return {
    budget: Math.min(Math.floor(entry.contextWindow * BLOB_CONTEXT_RATIO), BLOB_CONTEXT_MAX),
    modelId: firstEnabled.model,
  };
}

/** Returns the context window for a model, or a conservative Ollama fallback. */
export function getContextWindow(provider: ModelProvider, model: string): number {
  if (provider === 'ollama') return OLLAMA_BLOB_FALLBACK * 2;
  return getModelEntry(provider, model)?.contextWindow ?? OLLAMA_BLOB_FALLBACK * 2;
}

/**
 * Maximum safe chunk size in words, given the model and blob budget.
 * null = Ollama (context window unknown).
 * Formula: each translation call sends ~system_prompt + chunk + blob_context + expected_output
 * ≈ PROMPT_OVERHEAD + 2×chunk_tokens + blob_budget ≤ context_window.
 */
export function calculateSafeMaxChunkWords(
  provider: ModelProvider,
  model: string,
  blobBudget: number,
): number | null {
  if (provider === 'ollama') return null;
  const contextWindow = getContextWindow(provider, model);
  const safeTokens = Math.max(0, (contextWindow - PROMPT_OVERHEAD_TOKENS - blobBudget) / 2 * SAFE_MARGIN);
  return Math.round(safeTokens / TOKENS_PER_WORD);
}

/** Estimated number of chunks that fit in one blob context block at a given words-per-chunk. */
export function estimateChunksPerBlob(wordsPerChunk: number, blobBudget: number): number {
  if (wordsPerChunk <= 0) return 0;
  return Math.max(1, Math.floor(blobBudget / (wordsPerChunk * TOKENS_PER_WORD)));
}

/** Returns model IDs that are in MODEL_OPTIONS but lack a pricing entry (excluding ollama). */
export function getMissingPricingModels(
  modelOptions: Partial<Record<ModelProvider, string[]>>,
): string[] {
  const missing: string[] = [];
  for (const [provider, models] of Object.entries(modelOptions)) {
    if (provider === 'ollama') continue;
    for (const modelId of models ?? []) {
      const entry = getModelEntry(provider as ModelProvider, modelId);
      if (!entry || !entry.pricing) {
        missing.push(`${provider}/${modelId}`);
      }
    }
  }
  return missing;
}
