import { execute, getSetting, runInTransaction, select, setSetting } from './dbService';
import {
  DEFAULT_MEMORY_EXTRACTOR_MODEL,
  DEFAULT_MEMORY_EXTRACTOR_PROMPT,
  DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
} from '../constants';
import { logger } from '../utils/logger';
import { recordFact } from './provenanceService';
import type { EmbeddingModel, ModelProvider, Workspace } from '../types';
import { DEFAULT_WORKSPACE_ICON, isWorkspaceIconKey, type WorkspaceIconKey } from '../workspaceIdentity';

const generateId = () =>
  `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export async function createWorkspace(params: {
  name: string;
  description?: string;
  embeddingModel: EmbeddingModel;
  iconKey?: WorkspaceIconKey;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: generateId(),
    name: params.name,
    iconKey: isWorkspaceIconKey(params.iconKey) ? params.iconKey : DEFAULT_WORKSPACE_ICON,
    description: params.description,
    embeddingModel: params.embeddingModel,
    memoryExtractorProvider: DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
    memoryExtractorModel: DEFAULT_MEMORY_EXTRACTOR_MODEL,
    memoryExtractorPrompt: DEFAULT_MEMORY_EXTRACTOR_PROMPT,
    createdAt: new Date().toISOString(),
  };
  await execute(
    `INSERT INTO workspaces (
       id, name, icon_key, description, embedding_model,
       memory_extractor_provider, memory_extractor_model, memory_extractor_prompt,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [workspace.id, workspace.name, workspace.iconKey, workspace.description ?? null,
     workspace.embeddingModel, workspace.memoryExtractorProvider,
     workspace.memoryExtractorModel, workspace.memoryExtractorPrompt,
     workspace.createdAt],
  );
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await select<{
    id: string; name: string; description: string | null;
    icon_key: string | null;
    embedding_model: string;
    memory_extractor_provider: string | null;
    memory_extractor_model: string | null;
    memory_extractor_prompt: string | null;
    created_at: string;
  }>(`SELECT id, name, icon_key, description, embedding_model,
             memory_extractor_provider, memory_extractor_model, memory_extractor_prompt,
             created_at
      FROM workspaces ORDER BY created_at ASC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    iconKey: isWorkspaceIconKey(r.icon_key) ? r.icon_key : DEFAULT_WORKSPACE_ICON,
    description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel,
    memoryExtractorProvider: (r.memory_extractor_provider || DEFAULT_MEMORY_EXTRACTOR_PROVIDER) as ModelProvider,
    memoryExtractorModel: r.memory_extractor_model || DEFAULT_MEMORY_EXTRACTOR_MODEL,
    memoryExtractorPrompt: r.memory_extractor_prompt || DEFAULT_MEMORY_EXTRACTOR_PROMPT,
    createdAt: r.created_at,
  }));
}

export async function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace,
    'name' | 'description' | 'embeddingModel' |
    'iconKey' |
    'memoryExtractorProvider' | 'memoryExtractorModel' | 'memoryExtractorPrompt'
  >>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${index++}`);
    params.push(updates.name);
  }
  if (updates.iconKey !== undefined) {
    sets.push(`icon_key = $${index++}`);
    params.push(isWorkspaceIconKey(updates.iconKey) ? updates.iconKey : DEFAULT_WORKSPACE_ICON);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${index++}`);
    params.push(updates.description || null);
  }
  if (updates.embeddingModel !== undefined) {
    sets.push(`embedding_model = $${index++}`);
    params.push(updates.embeddingModel);
  }
  if (updates.memoryExtractorProvider !== undefined) {
    sets.push(`memory_extractor_provider = $${index++}`);
    params.push(updates.memoryExtractorProvider);
  }
  if (updates.memoryExtractorModel !== undefined) {
    sets.push(`memory_extractor_model = $${index++}`);
    params.push(updates.memoryExtractorModel);
  }
  if (updates.memoryExtractorPrompt !== undefined) {
    sets.push(`memory_extractor_prompt = $${index++}`);
    params.push(updates.memoryExtractorPrompt);
  }
  if (sets.length === 0) return;

  params.push(id);
  await execute(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = $${index}`, params);
}

/** Cosa c'è dentro un workspace, prima di decidere che farne (#213). */
export interface WorkspaceContents {
  projects: number;
  glossaries: number;
  phrases: number;
  transcriptions: number;
  /** Opere collegate: non si eliminano mai, si scollegano soltanto. */
  linkedSources: number;
}

export async function workspaceContents(id: string): Promise<WorkspaceContents> {
  const count = async (table: string) => {
    const rows = await select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE workspace_id = $1`,
      [id],
    );
    return rows[0]?.count ?? 0;
  };
  const [projects, glossaries, phrases, transcriptions, linkedSources] = await Promise.all([
    count('projects'),
    count('glossaries'),
    count('phrase_memory'),
    count('transcription_documents'),
    count('workspace_sources'),
  ]);
  return { projects, glossaries, phrases, transcriptions, linkedSources };
}

/**
 * Cosa fare del contenuto quando il workspace se ne va (#213).
 *
 * Una scelta sola per tutto, non una per oggetto: su un workspace con venti
 * documenti la seconda strada diventa un interrogatorio.
 */
export type WorkspaceDisposal =
  | { kind: 'moveTo'; workspaceId: string }
  | { kind: 'deleteEverything' };

/**
 * Elimina un workspace insieme a ciò che si è deciso di farne.
 *
 * **Le opere della Biblioteca non si toccano mai**: il collegamento cade con il
 * workspace — se le porta via il database — e l'opera resta dov'è, perché può
 * essere di più workspace insieme e perché i suoi file valgono gigabyte.
 */
export async function deleteWorkspace(id: string, disposal: WorkspaceDisposal): Promise<void> {
  if (disposal.kind === 'moveTo' && disposal.workspaceId === id) {
    throw new Error('workspace_move_to_itself');
  }
  const owned = ['projects', 'glossaries', 'phrase_memory', 'transcription_documents'];

  await runInTransaction(async (run) => {
    if (disposal.kind === 'moveTo') {
      for (const table of owned) {
        await run(`UPDATE ${table} SET workspace_id = $1 WHERE workspace_id = $2`, [
          disposal.workspaceId,
          id,
        ]);
      }
    } else {
      // In quest'ordine: quello che dipende da un progetto se ne va con lui, ma
      // la memoria di frasi punta anche ai progetti, e cancellarla dopo
      // lascerebbe la cancellazione a metà.
      await run('DELETE FROM phrase_memory WHERE workspace_id = $1', [id]);
      await run('DELETE FROM transcription_documents WHERE workspace_id = $1', [id]);
      await run('DELETE FROM projects WHERE workspace_id = $1', [id]);
      await run('DELETE FROM glossaries WHERE workspace_id = $1', [id]);
    }
    await run('DELETE FROM workspaces WHERE id = $1', [id]);
  });
  logger.info('workspace.deleted', { workspaceId: id, disposal: disposal.kind });
}

/** Un documento che può cambiare workspace: una traduzione o una trascrizione. */
export type MovableDocument = 'project' | 'transcription_document';

const MOVE_EVENT = 'workspace.moved';

const TABLE_OF: Record<MovableDocument, string> = {
  project: 'projects',
  transcription_document: 'transcription_documents',
};

/**
 * Sposta un documento in un altro workspace (#213).
 *
 * **Lo spostamento è esso stesso un fatto**, e i fatti di prima restano dov'erano:
 * il lavoro svolto ieri è stato svolto in quel workspace, e riscrivere il
 * passato farebbe cambiare da soli i conti già chiusi. Da adesso in poi il
 * documento vede le risorse del workspace nuovo.
 */
export async function moveDocumentToWorkspace(
  kind: MovableDocument,
  documentId: string,
  targetWorkspaceId: string,
): Promise<void> {
  const rows = await select<{ workspace_id: string | null }>(
    `SELECT workspace_id FROM ${TABLE_OF[kind]} WHERE id = $1`,
    [documentId],
  );
  if (rows.length === 0) throw new Error('document_not_found');
  const from = rows[0].workspace_id;
  if (from === targetWorkspaceId) return;

  // Lo spostamento e il suo fatto stanno o cadono insieme: se il fatto non si
  // scrivesse, resterebbe un documento spostato di cui la storia non sa niente.
  await runInTransaction(async (run) => {
    await run(`UPDATE ${TABLE_OF[kind]} SET workspace_id = $1 WHERE id = $2`, [
      targetWorkspaceId,
      documentId,
    ]);
    await recordFact(
      {
        eventType: MOVE_EVENT,
        entityType: kind === 'project' ? 'project' : 'transcription_document',
        entityId: documentId,
        // Due spostamenti diversi sono due fatti; rifare lo stesso non ne aggiunge.
        keyRef: targetWorkspaceId,
        actor: 'user',
        workspaceId: targetWorkspaceId,
        config: { from, to: targetWorkspaceId },
      },
      run,
    );
  });
  logger.info('workspace.document.moved', { kind, documentId, from, to: targetWorkspaceId });
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const value = await getSetting('active_workspace_id');
  return value || null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  await setSetting('active_workspace_id', id);
}
