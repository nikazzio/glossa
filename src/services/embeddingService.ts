import { invoke } from '@tauri-apps/api/core';
import type { EmbeddingModel } from '../types';

const COST_PER_MILLION_TOKENS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

export async function fetchEmbeddings(texts: string[], model: EmbeddingModel): Promise<number[][]> {
  if (texts.length === 0) return [];
  return invoke<number[][]>('get_embeddings', { texts, model });
}

export function estimateEmbeddingCostUsd(tokenCount: number, model: EmbeddingModel): number {
  return tokenCount * (COST_PER_MILLION_TOKENS[model] / 1_000_000);
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.split(/\s+/).length * 1.3);
}
