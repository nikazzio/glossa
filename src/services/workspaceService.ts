import { getDb } from './dbService';
import type { EmbeddingModel, Workspace } from '../types';

const generateId = () =>
  `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export async function createWorkspace(params: {
  name: string;
  description?: string;
  embeddingModel: EmbeddingModel;
}): Promise<Workspace> {
  const db = await getDb();
  const workspace: Workspace = {
    id: generateId(),
    name: params.name,
    description: params.description,
    embeddingModel: params.embeddingModel,
    createdAt: new Date().toISOString(),
  };
  await db.execute(
    `INSERT INTO workspaces (id, name, description, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [workspace.id, workspace.name, workspace.description ?? null,
     workspace.embeddingModel, workspace.createdAt],
  );
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  const rows = await db.select<Array<{
    id: string; name: string; description: string | null;
    embedding_model: string; created_at: string;
  }>>(`SELECT id, name, description, embedding_model, created_at
       FROM workspaces ORDER BY created_at ASC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    embeddingModel: r.embedding_model as EmbeddingModel,
    createdAt: r.created_at,
  }));
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    `SELECT value FROM app_settings WHERE key = 'active_workspace_id'`,
  );
  return rows[0]?.value || null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE app_settings SET value = ? WHERE key = 'active_workspace_id'`,
    [id],
  );
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  const id = await getActiveWorkspaceId();
  if (!id) return null;
  const db = await getDb();
  const rows = await db.select<Array<{
    id: string; name: string; description: string | null;
    embedding_model: string; created_at: string;
  }>>(
    `SELECT id, name, description, embedding_model, created_at
     FROM workspaces WHERE id = ?`,
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
