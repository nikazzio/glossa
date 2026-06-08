import type { TranslationChunk } from '../../types';

export type ChunkOutcome = 'completed' | 'failed' | 'cancelled' | 'skipped';
export type BatchRunMode = 'resume' | 'rerun-unlocked';
export type FinalChunkStatus = 'completed' | 'preview';

export function escapeChunkId(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatReferenceChunk(chunkId: string, text: string): string {
  return `<chunk id="${escapeChunkId(chunkId)}">\n${text}\n</chunk>`;
}

export function buildBlobContext(
  chunks: TranslationChunk[],
  chunkId: string,
  selector: (c: TranslationChunk) => string | undefined,
): string | undefined {
  const current = chunks.find((c) => c.id === chunkId);
  if (!current?.blobReferenceChunkIds?.length) return undefined;
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const referenceChunks = current.blobReferenceChunkIds
    .map((id) => byId.get(id))
    .filter((chunk): chunk is TranslationChunk => !!chunk && !!selector(chunk));
  if (referenceChunks.length === 0) return undefined;
  return referenceChunks
    .map((chunk) => formatReferenceChunk(chunk.id, selector(chunk)!))
    .join('\n\n');
}
