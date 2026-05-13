import { MODEL_CATALOG } from '../models/catalog';

const CJK_REGEX = /[\u3000-\u9fff\ua000-\uffef]/g;

/** Estimate token count for a string using char-based heuristics.
 *  ~2 chars/token for CJK, ~4 chars/token for western text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = (text.match(CJK_REGEX) ?? []).length;
  const westernCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 2 + westernCount / 4);
}

/** Safety margin: warn if chunk exceeds this fraction of context window */
export const CONTEXT_OVERFLOW_THRESHOLD = 0.8;

export interface ContextOverflowWarning {
  estimatedTokens: number;
  contextWindow: number;
  modelId: string;
  provider: string;
}

/** Get context window for a model. Falls back to numCtx for Ollama, undefined for unknown. */
export function getContextWindow(provider: string, modelId: string, numCtx?: number | null): number | undefined {
  if (provider === 'ollama') return numCtx ?? 8192;
  const entry = MODEL_CATALOG.find((e) => e.provider === provider && e.id === modelId);
  return entry?.contextWindow;
}

/** Returns a warning if the estimated tokens exceed 80% of any pipeline model's context window.
 *  Returns null if all models have sufficient context. */
export function checkContextOverflow(
  longestChunkText: string,
  systemPromptText: string,
  activeModels: Array<{ provider: string; model: string; numCtx?: number | null }>,
): ContextOverflowWarning | null {
  const estimated = estimateTokens(longestChunkText + '\n' + systemPromptText);
  for (const m of activeModels) {
    const contextWindow = getContextWindow(m.provider, m.model, m.numCtx);
    if (contextWindow && estimated > contextWindow * CONTEXT_OVERFLOW_THRESHOLD) {
      return { estimatedTokens: estimated, contextWindow, modelId: m.model, provider: m.provider };
    }
  }
  return null;
}
