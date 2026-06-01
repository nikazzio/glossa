export type ParagraphChunks = string[][];

export function toParagraphChunks(chunkTexts: string[]): ParagraphChunks {
  return chunkTexts.map((text) =>
    text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
  );
}

export function countWords(paras: string[]): number {
  const text = paras.join(' ');
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// Derive a flat paragraph list and boundary indices from ParagraphChunks.
// boundaryIndices contains the indices of paragraphs that start a new chunk (all except 0).
export function toFlatModel(chunks: ParagraphChunks): { paragraphs: string[]; boundaries: Set<number> } {
  const paragraphs = chunks.flat();
  const boundaries = new Set<number>();
  let offset = 0;
  for (let i = 0; i < chunks.length - 1; i++) {
    offset += chunks[i].length;
    boundaries.add(offset);
  }
  return { paragraphs, boundaries };
}

// Reconstruct ParagraphChunks from a flat paragraph list and boundary set.
export function fromFlatModel(paragraphs: string[], boundaries: Set<number>): ParagraphChunks {
  const chunks: ParagraphChunks = [];
  let current: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0 && boundaries.has(i)) {
      chunks.push(current);
      current = [];
    }
    current.push(paragraphs[i]);
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [[]];
}
