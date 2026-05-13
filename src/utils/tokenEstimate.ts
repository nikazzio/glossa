import { MODEL_CATALOG } from '../models/catalog';

/** Safety margin: warn if chunk exceeds this fraction of context window */
export const CONTEXT_OVERFLOW_THRESHOLD = 0.8;

export interface ContextOverflowWarning {
  estimatedTokens: number;
  contextWindow: number;
  modelId: string;
  provider: string;
}

/** Estimate token count for a string using char-based heuristics.
 *  ~2 chars/token for CJK, ~4 chars/token for western text.
 *  Named distinctly from costEstimate.ts::estimateTokens (word-based). */
export function estimateCharTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if ((cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xffef)) cjkCount++;
  }
  const westernCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 2 + westernCount / 4);
}

/** Get context window for a model. Falls back to numCtx for Ollama, undefined for unknown. */
export function getContextWindow(provider: string, modelId: string, numCtx?: number | null): number | undefined {
  if (provider === 'ollama') return numCtx ?? 8192;
  const entry = MODEL_CATALOG.find((e) => e.provider === provider && e.id === modelId);
  return entry?.contextWindow;
}

/** Returns a warning for the most restrictive model that exceeds 80% of its context window,
 *  or null if all models have sufficient context. Chunk and prompt are estimated separately
 *  to avoid creating large intermediate strings. */
export function checkContextOverflow(
  longestChunkText: string,
  maxPromptText: string,
  activeModels: Array<{ provider: string; model: string; numCtx?: number | null }>,
): ContextOverflowWarning | null {
  const estimated = estimateCharTokens(longestChunkText) + estimateCharTokens(maxPromptText);
  let worst: ContextOverflowWarning | null = null;
  for (const m of activeModels) {
    const contextWindow = getContextWindow(m.provider, m.model, m.numCtx);
    if (contextWindow && estimated > contextWindow * CONTEXT_OVERFLOW_THRESHOLD) {
      if (!worst || contextWindow < worst.contextWindow) {
        worst = { estimatedTokens: estimated, contextWindow, modelId: m.model, provider: m.provider };
      }
    }
  }
  return worst;
}
