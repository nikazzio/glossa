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
       VALUES (?, ?, 1, ?, ?)`,
      [preset.id, preset.name, JSON.stringify(preset.config), now],
    );
  }
}

export async function listPresets(): Promise<PhraseMemoryPreset[]> {
  const { getDb } = await import('./dbService');
  const db = await getDb();
  const rows = await db.select<Array<{
    id: string; name: string; is_builtin: number; config: string; created_at: string;
  }>>(`SELECT * FROM phrase_memory_presets ORDER BY is_builtin DESC, name ASC`);
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
): Promise<PhraseMemoryPreset> {
  const { getDb } = await import('./dbService');
  const db = await getDb();
  const id = `pmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO phrase_memory_presets (id, name, is_builtin, config, created_at)
     VALUES (?, ?, 0, ?, ?)`,
    [id, name, JSON.stringify(config), now],
  );
  return { id, name, isBuiltin: false, config, createdAt: now };
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const { getDb } = await import('./dbService');
  const db = await getDb();
  await db.execute(
    `DELETE FROM phrase_memory_presets WHERE id = ? AND is_builtin = 0`,
    [id],
  );
}
