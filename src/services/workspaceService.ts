import { execute, getSetting, runInTransaction, select, setSetting } from './dbService';
import {
  DEFAULT_MEMORY_EXTRACTOR_MODEL,
  DEFAULT_MEMORY_EXTRACTOR_PROMPT,
  DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
} from '../constants';
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
  // Backfill projects that existed before workspace support (workspace_id IS NULL).
  // Only the first workspace creation picks them up; subsequent ones find no orphans.
  await execute(
    'UPDATE projects SET workspace_id = $1 WHERE workspace_id IS NULL',
    [workspace.id],
  );
  return workspace;
}

/**
 * I workspace. Gli **archiviati** restano fuori: sono quelli messi da parte, e
 * ricomparire da soli nel selettore vanificherebbe il gesto (#213).
 */
export async function listWorkspaces(includeArchived = false): Promise<Workspace[]> {
  const rows = await select<{
    id: string; name: string; description: string | null;
    icon_key: string | null;
    embedding_model: string;
    memory_extractor_provider: string | null;
    memory_extractor_model: string | null;
    memory_extractor_prompt: string | null;
    created_at: string;
    archived_at: string | null;
  }>(`SELECT id, name, icon_key, description, embedding_model,
             memory_extractor_provider, memory_extractor_model, memory_extractor_prompt,
             created_at, archived_at
      FROM workspaces
      WHERE archived_at IS NULL OR $1 = 1
      ORDER BY created_at ASC`, [includeArchived ? 1 : 0]);
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
    archivedAt: r.archived_at ?? undefined,
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

export async function deleteWorkspace(id: string): Promise<void> {
  const [projects, glossaries] = await Promise.all([
    select<{ count: number }>('SELECT COUNT(*) AS count FROM projects WHERE workspace_id = $1', [id]),
    select<{ count: number }>('SELECT COUNT(*) AS count FROM glossaries WHERE workspace_id = $1', [id]),
  ]);
  if ((projects[0]?.count ?? 0) > 0) throw new Error('workspace_has_projects');
  if ((glossaries[0]?.count ?? 0) > 0) throw new Error('workspace_has_glossaries');

  await runInTransaction(async (run) => {
    await run('DELETE FROM phrase_memory WHERE workspace_id = $1', [id]);
    await run('DELETE FROM workspaces WHERE id = $1', [id]);
  });
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const value = await getSetting('active_workspace_id');
  return value || null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  await setSetting('active_workspace_id', id);
}
