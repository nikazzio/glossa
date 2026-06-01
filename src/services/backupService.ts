import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { select, runInTransaction } from './dbService';
import { confirm } from '../stores/confirmStore';

const SCHEMA_VERSION = 1;
const GLOSSA_VERSION = '0.9.0';

// Ordered for FK safety: parents before children for INSERT,
// children before parents for DELETE.
const INSERT_ORDER = [
  'glossaries',
  'projects',
  'app_settings',
  'prompt_templates',
  'pipelines',
  'project_glossaries',
  'glossary_entries',
  'translations',
] as const;

const DELETE_ORDER = [
  'translations',
  'glossary_entries',
  'project_glossaries',
  'pipelines',
  'projects',
  'glossaries',
  'prompt_templates',
  'app_settings',
] as const;

type BackupTable = typeof INSERT_ORDER[number];

interface BackupPayload {
  glossa_version: string;
  schema_version: number;
  exported_at: string;
  tables: Record<BackupTable, Record<string, unknown>[]>;
}

export async function exportWorkspace(): Promise<void> {
  const now = new Date().toISOString();
  const dateSlug = now.slice(0, 10);

  const path = await save({
    title: 'Esporta backup workspace',
    defaultPath: `glossa-backup-${dateSlug}.glossa-backup`,
    filters: [{ name: 'Glossa Backup', extensions: ['glossa-backup'] }],
  });
  if (!path) return;

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of INSERT_ORDER) {
    tables[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  const payload: BackupPayload = {
    glossa_version: GLOSSA_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: now,
    tables: tables as BackupPayload['tables'],
  };

  await writeTextFile(path, JSON.stringify(payload, null, 2));
}

export async function importWorkspace(t: (key: string) => string): Promise<boolean> {
  const path = await open({
    title: 'Importa backup workspace',
    filters: [
      { name: 'Glossa Backup', extensions: ['glossa-backup', 'json'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ],
    multiple: false,
  });
  if (!path) return false;

  const raw = await readTextFile(path as string);
  const payload = validateBackup(JSON.parse(raw));

  const ok = await confirm({
    title: t('settings.backupImportConfirmTitle'),
    message: t('settings.backupImportConfirmMessage'),
    confirmLabel: t('settings.backupImportConfirm'),
    danger: true,
  });
  if (!ok) return false;

  await runInTransaction(async (run) => {
    for (const table of DELETE_ORDER) {
      await run(`DELETE FROM ${table}`);
    }
    for (const table of INSERT_ORDER) {
      const rows = payload.tables[table] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await run(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          Object.values(row),
        );
      }
    }
  });

  return true;
}

function validateBackup(json: unknown): BackupPayload {
  if (typeof json !== 'object' || json === null) {
    throw new Error('invalid_backup');
  }
  const p = json as Record<string, unknown>;
  if (typeof p.schema_version !== 'number') {
    throw new Error('invalid_backup');
  }
  if (p.schema_version > SCHEMA_VERSION) {
    throw new Error('incompatible_schema_version');
  }
  if (typeof p.tables !== 'object' || p.tables === null) {
    throw new Error('invalid_backup');
  }
  return p as unknown as BackupPayload;
}
