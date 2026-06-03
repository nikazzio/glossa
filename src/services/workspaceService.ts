import { execute, getSetting, select, setSetting } from './dbService';
import type { EmbeddingModel, Workspace } from '../types';

const generateId = () =>
  `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export async function createWorkspace(params: {
  name: string;
  description?: string;
  embeddingModel: EmbeddingModel;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: generateId(),
    name: params.name,
    description: params.description,
    embeddingModel: params.embeddingModel,
    createdAt: new Date().toISOString(),
  };
  await execute(
    `INSERT INTO workspaces (id, name, description, embedding_model, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [workspace.id, workspace.name, workspace.description ?? null,
     workspace.embeddingModel, workspace.createdAt],
  );
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await select<{
    id: string; name: string; description: string | null;
    embedding_model: string; created_at: string;
  }>(`SELECT id, name, description, embedding_model, created_at
      FROM workspaces ORDER BY created_at ASC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel,
    createdAt: r.created_at,
  }));
}

export async function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, 'name' | 'description' | 'embeddingModel'>>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${index++}`);
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${index++}`);
    params.push(updates.description || null);
  }
  if (updates.embeddingModel !== undefined) {
    sets.push(`embedding_model = $${index++}`);
    params.push(updates.embeddingModel);
  }
  if (sets.length === 0) return;

  params.push(id);
  await execute(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = $${index}`, params);
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const value = await getSetting('active_workspace_id');
  return value || null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  await setSetting('active_workspace_id', id);
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const id = await getActiveWorkspaceId();
  if (!id) return null;
  const rows = await select<{
    id: string; name: string; description: string | null;
    embedding_model: string; created_at: string;
  }>(
    `SELECT id, name, description, embedding_model, created_at
     FROM workspaces WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel,
    createdAt: r.created_at,
  };
}
