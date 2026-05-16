import type {
  DiscoveredProviderModel,
  ModelProvider,
  PipelineStageConfig,
  StageRole,
} from '../types';

export type { ModelReasoningClass, ModelStatus } from '../types';
import type { ModelReasoningClass, ModelStatus } from '../types';
export type ModelUseCase = StageRole | 'judge' | 'coherence';
export type ModelUseCaseFit = 'preferred' | 'discouraged' | 'neutral';

export const MODEL_PROVIDER_ORDER: ModelProvider[] = [
  'gemini',
  'openai',
  'anthropic',
  'deepseek',
  'ollama',
];

export interface ModelEntry {
  id: string;
  provider: ModelProvider;
  status: ModelStatus;
  reasoning: ModelReasoningClass;
  contextWindow: number; // tokens
  pricing?: { input: number; output: number }; // USD per 1M tokens; undefined = free/local
  preferredFor: ModelUseCase[];
  discouragedFor?: ModelUseCase[];
}

// Last reviewed: 2026-05
// Source: official provider model/pricing pages.
// This catalog is the single frontend source of truth for product-known models.
export const MODEL_CATALOG: ModelEntry[] = [
  // Gemini
  { id: 'gemini-2.5-flash-lite', provider: 'gemini', status: 'stable', reasoning: 'optional', contextWindow: 1_048_576, pricing: { input: 0.10, output: 0.40 }, preferredFor: ['translation', 'format'] },
  { id: 'gemini-2.5-flash',      provider: 'gemini', status: 'stable', reasoning: 'optional', contextWindow: 1_048_576, pricing: { input: 0.30, output: 2.50 }, preferredFor: ['translation', 'refine', 'judge'] },
  { id: 'gemini-2.5-pro',        provider: 'gemini', status: 'stable', reasoning: 'reasoning', contextWindow: 1_048_576, pricing: { input: 1.25, output: 10.00 }, preferredFor: ['refine', 'judge', 'coherence'], discouragedFor: ['format'] },
  // OpenAI — GPT-4.1 line (non-reasoning, large context)
  { id: 'gpt-4.1-mini', provider: 'openai', status: 'stable', reasoning: 'non_reasoning', contextWindow: 1_047_576, pricing: { input: 0.40,  output: 1.60  }, preferredFor: ['translation', 'format'] },
  { id: 'gpt-4.1',      provider: 'openai', status: 'stable', reasoning: 'non_reasoning', contextWindow: 1_047_576, pricing: { input: 2.00,  output: 8.00  }, preferredFor: ['translation', 'refine', 'judge'] },
  { id: 'o4-mini',      provider: 'openai', status: 'stable', reasoning: 'reasoning',     contextWindow: 200_000,   pricing: { input: 1.10,  output: 4.40  }, preferredFor: ['refine', 'judge', 'coherence'], discouragedFor: ['format'] },
  // OpenAI — GPT-5 line (optional reasoning, 2025-08)
  { id: 'gpt-5-nano',   provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 128_000,   pricing: { input: 0.05,  output: 0.40  }, preferredFor: ['translation', 'format'] },
  { id: 'gpt-5-mini',   provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 400_000,   pricing: { input: 0.25,  output: 2.00  }, preferredFor: ['translation', 'refine'] },
  { id: 'gpt-5',        provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 400_000,   pricing: { input: 1.25,  output: 10.00 }, preferredFor: ['translation', 'refine', 'judge'] },
  // OpenAI — GPT-5.4 line (optional reasoning, 2026-03)
  { id: 'gpt-5.4-nano', provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 400_000,   pricing: { input: 0.20,  output: 1.25  }, preferredFor: ['translation', 'format'] },
  { id: 'gpt-5.4-mini', provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 400_000,   pricing: { input: 0.75,  output: 4.50  }, preferredFor: ['translation', 'refine', 'judge'] },
  { id: 'gpt-5.4',      provider: 'openai', status: 'stable', reasoning: 'optional',      contextWindow: 1_000_000, pricing: { input: 2.50,  output: 15.00 }, preferredFor: ['judge', 'coherence', 'refine'], discouragedFor: ['format'] },
  // Anthropic
  { id: 'claude-3-5-haiku-latest', provider: 'anthropic', status: 'stable', reasoning: 'non_reasoning', contextWindow: 200_000, pricing: { input: 0.80, output: 4.00 }, preferredFor: ['translation', 'format'] },
  { id: 'claude-sonnet-4-0',      provider: 'anthropic', status: 'stable', reasoning: 'reasoning', contextWindow: 200_000, pricing: { input: 3.00, output: 15.00 }, preferredFor: ['translation', 'refine', 'judge', 'coherence'] },
  { id: 'claude-opus-4-0',        provider: 'anthropic', status: 'stable', reasoning: 'reasoning', contextWindow: 200_000, pricing: { input: 15.00, output: 75.00 }, preferredFor: ['refine', 'judge', 'coherence'], discouragedFor: ['format'] },
  // DeepSeek (v4 line — 1M context, optional reasoning effort)
  // deepseek-chat / deepseek-reasoner retired 2026-07-24
  { id: 'deepseek-v4-flash', provider: 'deepseek', status: 'stable', reasoning: 'optional', contextWindow: 1_000_000, pricing: { input: 0.14, output: 0.28 }, preferredFor: ['translation', 'format'] },
  { id: 'deepseek-v4-pro',   provider: 'deepseek', status: 'stable', reasoning: 'optional', contextWindow: 1_000_000, pricing: { input: 1.74, output: 3.48 }, preferredFor: ['refine', 'judge', 'coherence'], discouragedFor: ['format'] },
];

export function getModelEntry(provider: ModelProvider, modelId: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((e) => e.provider === provider && e.id === modelId);
}

export function getProviderCatalogEntries(provider: ModelProvider): ModelEntry[] {
  return MODEL_CATALOG.filter((entry) => entry.provider === provider);
}

export function getKnownModelIds(provider: ModelProvider): string[] {
  return getProviderCatalogEntries(provider).map((entry) => entry.id);
}

export function isShowableModel(provider: ModelProvider, modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (provider === 'openai') {
    if (id.includes('embedding') || id.includes('moderation') || id.includes('transcribe')) return false;
    if (id.startsWith('tts-') || id.startsWith('whisper-') || id.startsWith('sora')) return false;
    if (id.startsWith('dall-e') || id.startsWith('dall_e')) return false;
    if (id.startsWith('babbage-') || id.startsWith('davinci-') || id.startsWith('curie-') || id.startsWith('ada-')) return false;
    if (id.startsWith('text-') || id.startsWith('code-')) return false;
    if (!id.startsWith('gpt-') && !/^o\d/.test(id) && !id.startsWith('chatgpt-')) return false;
    if (/\d{4}-\d{2}(-\d{2})?$/.test(id)) return false;
    if (id.endsWith('-preview') || id.endsWith('-instruct')) return false;
    if (id === 'gpt-4' || id === 'gpt-4-32k' || id === 'gpt-4-turbo' || id.startsWith('gpt-3')) return false;
    return true;
  }

  if (provider === 'anthropic') {
    if (!id.startsWith('claude-')) return false;
    if (/\d{8}$/.test(id)) return false;
    return true;
  }

  if (provider === 'gemini') {
    const clean = id.replace(/^models\//, '');
    if (!clean.startsWith('gemini-')) return false;
    if (clean.startsWith('gemini-1.0')) return false;
    return true;
  }

  return true;
}

export function getModelStatus(provider: ModelProvider, modelId: string): ModelStatus | undefined {
  return getModelEntry(provider, modelId)?.status;
}

export function getModelReasoning(provider: ModelProvider, modelId: string): ModelReasoningClass | undefined {
  return getModelEntry(provider, modelId)?.reasoning;
}

export function getDiscoveredModelEntry(
  models: DiscoveredProviderModel[] | undefined,
  modelId: string,
): DiscoveredProviderModel | undefined {
  return models?.find((entry) => entry.id === modelId);
}

export function getResolvedModelReasoning(
  provider: ModelProvider,
  modelId: string,
  discoveredModels?: DiscoveredProviderModel[],
): ModelReasoningClass | undefined {
  return (
    getModelReasoning(provider, modelId)
    ?? getDiscoveredModelEntry(discoveredModels, modelId)?.reasoning
    ?? inferReasoningFromModelId(provider, modelId)
  );
}

export function getModelUseCaseFit(
  provider: ModelProvider,
  modelId: string,
  useCase: ModelUseCase,
): ModelUseCaseFit | undefined {
  const entry = getModelEntry(provider, modelId);
  if (!entry) return undefined;
  if (entry.preferredFor.includes(useCase)) return 'preferred';
  if (entry.discouragedFor?.includes(useCase)) return 'discouraged';
  return 'neutral';
}

export function getSelectableModelIds(
  provider: ModelProvider,
  options?: {
    enabledModelIds?: string[];
    availableModelIds?: string[];
  },
): string[] {
  const availableModelIds = options?.availableModelIds
    ?? (provider === 'ollama' ? [] : getKnownModelIds(provider));
  if (availableModelIds.length === 0) return [];

  const enabledModelIds = options?.enabledModelIds;
  if (enabledModelIds === undefined) return availableModelIds;

  const enabled = new Set(enabledModelIds);
  return availableModelIds.filter((modelId) => enabled.has(modelId));
}

export function inferReasoningFromModelId(
  provider: ModelProvider,
  modelId: string,
): ModelReasoningClass | undefined {
  const normalized = modelId.toLowerCase();
  if (provider === 'openai') {
    if (normalized.startsWith('o')) return 'reasoning';
    if (normalized.startsWith('gpt-5')) return 'optional';
    if (normalized.startsWith('gpt-4.1') || normalized.startsWith('gpt-4o')) return 'non_reasoning';
  }
  if (provider === 'anthropic') {
    if (normalized.includes('haiku')) return 'non_reasoning';
    if (normalized.includes('sonnet') || normalized.includes('opus')) return 'reasoning';
  }
  if (provider === 'gemini') {
    if (normalized.includes('flash-lite') || normalized.includes('2.0-flash-lite')) return 'non_reasoning';
    if (normalized.includes('flash') || normalized.includes('pro')) return 'optional';
  }
  if (provider === 'deepseek') {
    if (normalized.includes('reasoner')) return 'reasoning';
    if (normalized.includes('chat')) return 'non_reasoning';
    if (normalized.includes('v4-flash') || normalized.includes('v4-pro')) return 'optional';
  }
  return undefined;
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

/** Returns model IDs that are product-known but lack a pricing entry (excluding ollama). */
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
