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
});
