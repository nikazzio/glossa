import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { EmbeddingModel, ModelProvider, PhraseMatch } from '../types';
import { fetchEmbeddings } from './embeddingService';
import { useUiStore } from '../stores/uiStore';

type RawPhraseMatch = {
  phrase_memory_id: string;
  source_phrase: string;
  target_phrase: string;
  distance: number;
  confidence: number | null;
};

type RawPhraseMemoryEntry = {
  id: string;
  workspace_id: string;
  source_phrase: string;
  target_phrase: string;
  confidence: number | null;
  source_language: string;
  target_language: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunk_id: string | null;
  project_id: string | null;
  created_at: string;
};

type ExtractedPhrasePair = {
  sourcePhrase: string;
  targetPhrase: string;
  confidence: number;
};

type RawExtractedPairs = {
  pairs: ExtractedPhrasePair[];
};

export interface PhraseMemoryEntry {
  id: string;
  workspaceId: string;
  sourcePhrase: string;
  targetPhrase: string;
  confidence: number;
  sourceLanguage: string;
  targetLanguage: string;
  author: string | null;
  work: string | null;
  domain: string | null;
  tags: string | null;
  notes: string | null;
  chunkId: string | null;
  projectId: string | null;
  createdAt: string;
}

export interface SearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  queryText: string;
  threshold: number;
  maxResults: number;
}

export interface BatchSearchOptions {
  workspaceId: string;
  embeddingModel: EmbeddingModel;
  chunks: Array<{ id: string; text: string }>;
  threshold: number;
  maxResults: number;
}

export interface SaveSelectedPhrasesOptions {
  workspaceId: string;
  projectId: string;
  embeddingModel: EmbeddingModel;
  extractorProvider: ModelProvider;
  extractorModel: string;
  extractorPrompt: string;
  sourceLanguage: string;
  targetLanguage: string;
  chunks: Array<{ id: string; sourceText: string; targetText: string }>;
  onProgress?: (done: number, total: number) => void;
}

export interface SavePhrasePairsOptions {
  workspaceId: string;
  projectId: string;
  chunkId: string;
  embeddingModel: EmbeddingModel;
  extractorProvider: ModelProvider;
  extractorModel: string;
  extractorPrompt: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

function toPhraseMatch(raw: RawPhraseMatch): PhraseMatch {
  return {
    phraseMemoryId: raw.phrase_memory_id,
    sourcePhrase: raw.source_phrase,
    targetPhrase: raw.target_phrase,
    distance: raw.distance,
    confidence: raw.confidence ?? 1,
  };
}

function toPhraseMemoryEntry(raw: RawPhraseMemoryEntry): PhraseMemoryEntry {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    sourcePhrase: raw.source_phrase,
    targetPhrase: raw.target_phrase,
    confidence: raw.confidence ?? 1,
    sourceLanguage: raw.source_language,
    targetLanguage: raw.target_language,
    author: raw.author,
    work: raw.work,
    domain: raw.domain,
    tags: raw.tags,
    notes: raw.notes,
    chunkId: raw.chunk_id,
    projectId: raw.project_id,
    createdAt: raw.created_at,
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function similarityToDistanceThreshold(similarityThreshold: number): number {
  const clamped = Math.max(0, Math.min(1, similarityThreshold));
  return 1 - clamped;
}

function validateExtractedPairs(
  pairs: ExtractedPhrasePair[],
  sourceText: string,
  targetText: string,
): ExtractedPhrasePair[] {
  const seen = new Set<string>();
  return pairs.flatMap((pair) => {
    const sourcePhrase = pair.sourcePhrase.trim();
    const targetPhrase = pair.targetPhrase.trim();
    if (!sourcePhrase || !targetPhrase) return [];
    if (!sourceText.includes(sourcePhrase) || !targetText.includes(targetPhrase)) return [];

    const key = `${sourcePhrase}\u001f${targetPhrase}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      sourcePhrase,
      targetPhrase,
      confidence: clampConfidence(pair.confidence),
    }];
  });
}

export async function extractPhraseMemoryPairs(options: {
  provider: ModelProvider;
  model: string;
  prompt: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<ExtractedPhrasePair[]> {
  const raw = await invoke<RawExtractedPairs>('extract_phrase_memory_pairs', {
    provider: options.provider,
    model: options.model,
    prompt: options.prompt,
    sourceText: options.sourceText,
    targetText: options.targetText,
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    ollamaBaseUrl: useUiStore.getState().ollamaBaseUrl,
  });

  return validateExtractedPairs(raw.pairs ?? [], options.sourceText, options.targetText);
}

export async function searchPhraseMemory(options: SearchOptions): Promise<PhraseMatch[]> {
  const { workspaceId, embeddingModel, queryText, threshold, maxResults } = options;
  const [queryEmbedding] = await fetchEmbeddings([queryText], embeddingModel);
  if (!queryEmbedding) return [];

  const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
    workspaceId,
    queryEmbedding,
    threshold: similarityToDistanceThreshold(threshold),
    maxResults,
    embeddingModel,
  });

  return raw.map(toPhraseMatch);
}

export async function searchPhraseMemoryBatch(
  options: BatchSearchOptions,
): Promise<Map<string, PhraseMatch[]>> {
  const { workspaceId, embeddingModel, chunks, threshold, maxResults } = options;
  if (chunks.length === 0) return new Map();

  const texts = chunks.map((c) => c.text);
  const embeddings = await fetchEmbeddings(texts, embeddingModel);

  const result = new Map<string, PhraseMatch[]>();
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding) continue;
    const raw = await invoke<RawPhraseMatch[]>('vec_search_phrase_memory', {
      workspaceId,
      queryEmbedding: embedding,
      threshold: similarityToDistanceThreshold(threshold),
      maxResults,
      embeddingModel,
    });
    result.set(chunks[i].id, raw.map(toPhraseMatch));
  }
  return result;
}

export async function listPhraseMemoryEntries(workspaceId: string): Promise<PhraseMemoryEntry[]> {
  const raw = await invoke<RawPhraseMemoryEntry[]>('vec_list_phrase_memory', { workspaceId });
  return raw.map(toPhraseMemoryEntry);
}

export async function deletePhraseMemoryEntry(
  workspaceId: string,
  phraseMemoryId: string,
): Promise<void> {
  await invoke('vec_delete_phrase_memory', { workspaceId, phraseMemoryId });
}

export async function updatePhraseMemoryEntry(options: {
  workspaceId: string;
  phraseMemoryId: string;
  embeddingModel: EmbeddingModel;
  sourcePhrase: string;
  targetPhrase: string;
}): Promise<void> {
  const sourcePhrase = options.sourcePhrase.trim();
  const targetPhrase = options.targetPhrase.trim();
  if (!sourcePhrase || !targetPhrase) {
    throw new Error('Source and target phrases are required.');
  }

  const [embedding] = await fetchEmbeddings([sourcePhrase], options.embeddingModel);
  if (!embedding) {
    throw new Error('Embedding generation failed.');
  }

  await invoke('vec_update_phrase_memory', {
    workspaceId: options.workspaceId,
    phraseMemoryId: options.phraseMemoryId,
    sourcePhrase,
    targetPhrase,
    embedding,
  });
}

export async function saveSelectedPhrases(options: SaveSelectedPhrasesOptions): Promise<number> {
  const {
    workspaceId, projectId, embeddingModel, extractorProvider, extractorModel, extractorPrompt,
    sourceLanguage, targetLanguage, chunks, onProgress,
  } = options;
  logger.debug('phrase_memory.save_selected.start', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    embeddingModel,
    extractorProvider,
    extractorModel,
    sourceLanguage,
    targetLanguage,
  });

  const total = chunks.length;
  let savedTotal = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const savedForChunk = await savePhrasePairs({
      workspaceId,
      projectId,
      chunkId: chunk.id,
      embeddingModel,
      extractorProvider,
      extractorModel,
      extractorPrompt,
      sourceText: chunk.sourceText,
      targetText: chunk.targetText,
      sourceLanguage,
      targetLanguage,
    });
    savedTotal += savedForChunk;
    logger.debug('phrase_memory.save_selected.chunk_done', {
      workspaceId,
      projectId,
      chunkId: chunk.id,
      savedForChunk,
      savedTotal,
    });
    onProgress?.(i + 1, total);
  }

  logger.info('phrase_memory.save_selected.done', {
    workspaceId,
    projectId,
    chunkCount: chunks.length,
    savedTotal,
  });
  return savedTotal;
}

export async function savePhrasePairs(options: SavePhrasePairsOptions): Promise<number> {
  const {
    workspaceId, projectId, chunkId, embeddingModel, extractorProvider, extractorModel,
    extractorPrompt, sourceText, targetText, sourceLanguage, targetLanguage,
  } = options;

  const extractedPairs = await extractPhraseMemoryPairs({
    provider: extractorProvider,
    model: extractorModel,
    prompt: extractorPrompt,
    sourceText,
    targetText,
    sourceLanguage,
    targetLanguage,
  });

  logger.debug('phrase_memory.save_pairs.extracted', {
    workspaceId,
    projectId,
    chunkId,
    extractedPairCount: extractedPairs.length,
    extractorProvider,
    extractorModel,
  });

  if (extractedPairs.length === 0) return 0;

  const sourceVectors = await fetchEmbeddings(
    extractedPairs.map((pair) => pair.sourcePhrase),
    embeddingModel,
  );

  const pairs = extractedPairs.flatMap((pair, i) => {
    const sourceEmbedding = sourceVectors[i];
    return sourceEmbedding?.length
      ? [{ ...pair, sourceEmbedding }]
      : [];
  });

  if (pairs.length === 0) {
    logger.warn('phrase_memory.save_pairs.no_valid_embeddings', {
      workspaceId,
      projectId,
      chunkId,
      candidatePairCount: extractedPairs.length,
      embeddingCount: sourceVectors.length,
    });
    return 0;
  }

  const savedCount = await invoke<number>('vec_save_locked_phrases', {
    workspaceId,
    projectId,
    chunkId,
    pairs,
    sourceLanguage,
    targetLanguage,
    embeddingModel,
  });
  logger.info('phrase_memory.save_pairs.insert_done', {
    workspaceId,
    projectId,
    chunkId,
    candidatePairCount: extractedPairs.length,
    embeddingCount: sourceVectors.length,
    savedCount,
  });
  return savedCount;
}

export async function regenerateAllEmbeddings(
  workspaceId: string,
  model: EmbeddingModel,
): Promise<number> {
  return invoke<number>('vec_regenerate_all_embeddings', { workspaceId, model });
}
