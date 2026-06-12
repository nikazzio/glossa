import { create } from 'zustand';
import { select, execute } from '../services/dbService';
import type { Annotation, AnnotationType } from '../types';

interface DbAnnotationRow {
  id: string;
  chunk_id: string;
  pipeline_id: string;
  type: string;
  content: string;
  anchor_text: string | null;
  sequence: number;
  created_at: string;
}

function fromRow(row: DbAnnotationRow): Annotation {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    pipelineId: row.pipeline_id,
    type: row.type as AnnotationType,
    content: row.content,
    anchorText: row.anchor_text ?? undefined,
    sequence: row.sequence,
    createdAt: row.created_at,
  };
}

interface AnnotationsState {
  annotationsByChunkId: Map<string, Annotation[]>;

  loadAnnotations: (pipelineId: string) => Promise<void>;
  addAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt'>) => Promise<void>;
  updateAnnotation: (id: string, chunkId: string, updates: Partial<Pick<Annotation, 'type' | 'content' | 'anchorText'>>) => Promise<void>;
  deleteAnnotation: (id: string, chunkId: string) => Promise<void>;
  clearAll: () => void;
}

export const useAnnotationsStore = create<AnnotationsState>((set) => ({
  annotationsByChunkId: new Map(),

  loadAnnotations: async (pipelineId) => {
    const rows = await select<DbAnnotationRow>(
      `SELECT * FROM annotations WHERE pipeline_id = $1 ORDER BY chunk_id, sequence`,
      [pipelineId],
    );
    const map = new Map<string, Annotation[]>();
    for (const row of rows) {
      const ann = fromRow(row);
      const existing = map.get(ann.chunkId) ?? [];
      existing.push(ann);
      map.set(ann.chunkId, existing);
    }
    set({ annotationsByChunkId: map });
  },

  addAnnotation: async (ann) => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await execute(
      `INSERT INTO annotations (id, chunk_id, pipeline_id, type, content, anchor_text, sequence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ann.chunkId, ann.pipelineId, ann.type, ann.content, ann.anchorText ?? null, ann.sequence, createdAt],
    );
    const full: Annotation = { ...ann, id, createdAt };
    set((state) => {
      const next = new Map(state.annotationsByChunkId);
      const existing = next.get(ann.chunkId) ?? [];
      next.set(ann.chunkId, [...existing, full]);
      return { annotationsByChunkId: next };
    });
  },

  updateAnnotation: async (id, chunkId, updates) => {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (updates.type !== undefined) { sets.push(`type = $${i++}`); params.push(updates.type); }
    if (updates.content !== undefined) { sets.push(`content = $${i++}`); params.push(updates.content); }
    if ('anchorText' in updates) { sets.push(`anchor_text = $${i++}`); params.push(updates.anchorText ?? null); }
    if (sets.length === 0) return;
    params.push(id);
    await execute(`UPDATE annotations SET ${sets.join(', ')} WHERE id = $${i}`, params);
    set((state) => {
      const next = new Map(state.annotationsByChunkId);
      const existing = next.get(chunkId) ?? [];
      next.set(chunkId, existing.map((a) => a.id === id ? { ...a, ...updates } : a));
      return { annotationsByChunkId: next };
    });
  },

  deleteAnnotation: async (id, chunkId) => {
    await execute(`DELETE FROM annotations WHERE id = $1`, [id]);
    set((state) => {
      const next = new Map(state.annotationsByChunkId);
      const existing = next.get(chunkId) ?? [];
      const filtered = existing.filter((a) => a.id !== id);
      if (filtered.length === 0) next.delete(chunkId);
      else next.set(chunkId, filtered);
      return { annotationsByChunkId: next };
    });
  },

  clearAll: () => set({ annotationsByChunkId: new Map() }),
}));
