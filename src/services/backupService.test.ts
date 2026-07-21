import { describe, expect, it, vi, beforeEach } from 'vitest';

const dialogState = vi.hoisted(() => ({ openPath: '/tmp/backup.glossa-backup' }));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => dialogState.openPath),
  save: vi.fn(async () => '/tmp/backup.glossa-backup'),
}));

const fsState = vi.hoisted(() => ({ raw: '{}' }));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async () => fsState.raw),
  writeTextFile: vi.fn(async () => undefined),
}));

vi.mock('../stores/confirmStore', () => ({
  confirm: vi.fn(async () => true),
}));

type RunFn = (query: string, params?: unknown[]) => Promise<void>;

const runMock = vi.fn<RunFn>(async () => undefined);

vi.mock('./dbService', () => ({
  select: vi.fn(async () => []),
  runInTransaction: vi.fn(async (callback: (run: RunFn) => Promise<void>) => {
    await callback(runMock);
  }),
}));

import { importWorkspace } from './backupService';
import { confirm } from '../stores/confirmStore';

const t = (key: string) => key;

function backupWith(appSettings: Array<{ key: string; value: string }>): string {
  return JSON.stringify({
    glossa_version: '0.9.0',
    schema_version: 1,
    exported_at: '2026-06-08T19:11:42.971Z',
    tables: {
      workspaces: [],
      glossaries: [],
      projects: [],
      app_settings: appSettings,
      prompt_templates: [],
      pipelines: [],
      project_glossaries: [],
      glossary_entries: [],
      translations: [],
      phrase_memory: [],
      source_phrase_embeddings: [],
    },
  });
}

describe('importWorkspace', () => {
  beforeEach(() => {
    runMock.mockClear();
    vi.mocked(confirm).mockClear();
    fsState.raw = backupWith([]);
  });

  it('rejects an incomplete backup before opening the replacement confirmation or changing data', async () => {
    fsState.raw = JSON.stringify({
      glossa_version: '1.2.1',
      schema_version: 1,
      exported_at: '2026-07-21T12:00:00.000Z',
      tables: { workspaces: [] },
    });

    await expect(importWorkspace(t)).rejects.toThrow('invalid_backup');
    expect(confirm).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects a backup created by a newer schema before changing data', async () => {
    fsState.raw = backupWith([]).replace('"schema_version":1', '"schema_version":2');

    await expect(importWorkspace(t)).rejects.toThrow('incompatible_schema_version');
    expect(confirm).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('does not restore the schema_version app_settings row, preventing resetOutdatedBetaDatabase from wiping the DB on next startup', async () => {
    fsState.raw = backupWith([
      { key: 'schema_version', value: 'db-schema-v1' },
      { key: 'active_workspace_id', value: 'ws_orafo' },
    ]);

    await importWorkspace(t);

    const insertedSchemaVersionRow = runMock.mock.calls.find(
      ([query, params]) => query.includes('INTO app_settings') && params?.includes('schema_version'),
    );
    expect(insertedSchemaVersionRow).toBeUndefined();
  });

  it('still restores other app_settings rows like active_workspace_id', async () => {
    fsState.raw = backupWith([
      { key: 'schema_version', value: 'db-schema-v1' },
      { key: 'active_workspace_id', value: 'ws_orafo' },
    ]);

    await importWorkspace(t);

    const insertedActiveWorkspaceRow = runMock.mock.calls.find(
      ([query, params]) => query.includes('INTO app_settings') && params?.includes('active_workspace_id'),
    );
    expect(insertedActiveWorkspaceRow).toBeDefined();
  });

  it('never deletes the schema_version row, so the running DB keeps its current migration marker across an import', async () => {
    // Regression: DELETE FROM app_settings (no WHERE) removed the marker
    // entirely, and since the INSERT step skips restoring it, the row
    // disappeared for good — read back as "no version" on the next boot,
    // which looks exactly like an outdated schema and re-triggers the
    // confirmation prompt forever, even though the data just imported fine.
    fsState.raw = backupWith([
      { key: 'schema_version', value: 'db-schema-v1' },
      { key: 'active_workspace_id', value: 'ws_orafo' },
    ]);

    await importWorkspace(t);

    const unconditionalDelete = runMock.mock.calls.find(
      ([query]) => query.trim() === 'DELETE FROM app_settings',
    );
    expect(unconditionalDelete).toBeUndefined();

    const scopedDelete = runMock.mock.calls.find(
      ([query, params]) => query === 'DELETE FROM app_settings WHERE key != $1' && params?.[0] === 'schema_version',
    );
    expect(scopedDelete).toBeDefined();
  });
});
