import { select } from './dbService';

/**
 * Una traduzione nel catalogo: il progetto con il suo workspace, le lingue e
 * a che punto sono i frammenti della pipeline che si apre (la prima creata).
 */
export interface TranslationCatalogEntry {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  sourceLanguage: string;
  targetLanguage: string;
  updatedAt: string;
  chunkCount: number;
  translatedChunks: number;
  verifiedChunks: number;
}

interface CatalogRow {
  id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  source_language: string;
  target_language: string;
  updated_at: string;
  chunk_count: number | null;
  translated_chunks: number | null;
  verified_chunks: number | null;
}

/** Tutte le traduzioni di tutti i workspace. I frammenti si contano sulla
 *  prima pipeline del progetto, la stessa che l'editor apre. */
export async function listTranslationCatalog(): Promise<TranslationCatalogEntry[]> {
  const rows = await select<CatalogRow>(
    `SELECT
       p.id, p.name, p.workspace_id, w.name AS workspace_name,
       p.source_language, p.target_language, p.updated_at,
       COUNT(t.id) AS chunk_count,
       SUM(CASE WHEN t.chunk_status = 'completed' THEN 1 ELSE 0 END) AS translated_chunks,
       SUM(CASE WHEN t.translation_locked = 1 THEN 1 ELSE 0 END) AS verified_chunks
     FROM projects p
     JOIN workspaces w ON w.id = p.workspace_id
     LEFT JOIN translations t ON t.pipeline_id = (
       SELECT pi.id FROM pipelines pi WHERE pi.project_id = p.id ORDER BY pi.created_at ASC LIMIT 1
     )
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    updatedAt: row.updated_at,
    chunkCount: row.chunk_count ?? 0,
    translatedChunks: row.translated_chunks ?? 0,
    verifiedChunks: row.verified_chunks ?? 0,
  }));
}
