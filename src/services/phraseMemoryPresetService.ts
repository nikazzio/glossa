import { execute, select } from './dbService';
import type { PhraseMemoryPreset, PhraseMemoryPresetConfig } from '../types';
import type Database from '@tauri-apps/plugin-sql';

const BUILTIN_PRESETS: Array<Omit<PhraseMemoryPreset, 'createdAt'>> = [
  {
    id: 'pmp_builtin_modern',
    name: 'Moderno',
    isBuiltin: true,
    config: { splitter: 'regex', similarityThreshold: 0.85, maxResults: 5, minPhraseLength: 20 },
  },
  {
    id: 'pmp_builtin_medieval_it',
    name: 'Medievale IT',
    isBuiltin: true,
    config: { splitter: 'llm', similarityThreshold: 0.70, maxResults: 10, minPhraseLength: 10 },
  },
  {
    id: 'pmp_builtin_latin',
    name: 'Latino',
    isBuiltin: true,
    config: { splitter: 'llm', similarityThreshold: 0.65, maxResults: 10, minPhraseLength: 10 },
  },
  {
    id: 'pmp_builtin_legal',
    name: 'Legale',
    isBuiltin: true,
    config: { splitter: 'regex', similarityThreshold: 0.90, maxResults: 3, minPhraseLength: 30 },
  },
];

// `db` is passed by the caller (dbService.initDatabase) to avoid a circular import.
export async function seedBuiltinPresets(db: Database): Promise<void> {
  const now = new Date().toISOString();
  for (const preset of BUILTIN_PRESETS) {
    await db.execute(
      `INSERT OR IGNORE INTO phrase_memory_presets (id, name, is_builtin, config, created_at)
       VALUES ($1, $2, 1, $3, $4)`,
      [preset.id, preset.name, JSON.stringify(preset.config), now],
    );
  }
}

export async function listPresets(workspaceId: string): Promise<PhraseMemoryPreset[]> {
  const rows = await select<{
    id: string; name: string; is_builtin: number; config: string; created_at: string;
  }>(
    `SELECT * FROM phrase_memory_presets WHERE is_builtin = 1 OR workspace_id = $1 ORDER BY is_builtin DESC, name ASC`,
    [workspaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isBuiltin: r.is_builtin === 1,
    config: JSON.parse(r.config) as PhraseMemoryPresetConfig,
    createdAt: r.created_at,
  }));
}

export async function createCustomPreset(
  name: string,
  config: PhraseMemoryPresetConfig,
  workspaceId: string,
): Promise<PhraseMemoryPreset> {
  const id = `pmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO phrase_memory_presets (id, name, is_builtin, config, created_at, workspace_id)
     VALUES ($1, $2, 0, $3, $4, $5)`,
    [id, name, JSON.stringify(config), now, workspaceId],
  );
  return { id, name, isBuiltin: false, config, createdAt: now };
}

export async function deleteCustomPreset(id: string, workspaceId: string): Promise<void> {
  await execute(
    `DELETE FROM phrase_memory_presets WHERE id = $1 AND is_builtin = 0 AND workspace_id = $2`,
    [id, workspaceId],
  );
}

export async function updateCustomPreset(
  id: string,
  name: string,
  config: PhraseMemoryPresetConfig,
  workspaceId: string,
): Promise<void> {
  await execute(
    `UPDATE phrase_memory_presets SET name = $1, config = $2 WHERE id = $3 AND is_builtin = 0 AND workspace_id = $4`,
    [name, JSON.stringify(config), id, workspaceId],
  );
}

export async function clonePreset(sourceId: string, workspaceId: string): Promise<string> {
  const rows = await select<{ name: string; config: string }>(
    `SELECT name, config FROM phrase_memory_presets WHERE id = $1`,
    [sourceId],
  );
  if (rows.length === 0) throw new Error(`Preset not found: ${sourceId}`);
  const source = rows[0];
  const newId = `pmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO phrase_memory_presets (id, name, is_builtin, config, created_at, workspace_id)
     VALUES ($1, $2, 0, $3, $4, $5)`,
    [newId, `${source.name} (copia)`, source.config, now, workspaceId],
  );
  return newId;
}
