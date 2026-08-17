import { describe, expect, it, vi, beforeEach } from 'vitest';

// La scelta del file e la lettura stanno nel backend (#407): qui si finge il
// comando, non la finestra.
const fsState = vi.hoisted(() => ({ raw: '{}' }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) =>
    command === 'read_backup' ? fsState.raw : null,
  ),
}));

vi.mock('../stores/confirmStore', () => ({
  confirm: vi.fn(async () => true),
}));

type RunFn = (query: string, params?: unknown[]) => Promise<void>;

const runMock = vi.fn<RunFn>(async () => undefined);
const selectMock = vi.mocked(select);

vi.mock('./dbService', () => ({
  select: vi.fn(async () => []),
  runInTransaction: vi.fn(async (callback: (run: RunFn) => Promise<void>) => {
    await callback(runMock);
  }),
}));

import { exportWorkspace, importWorkspace } from './backupService';
import { BACKUP_TABLES } from '../schemas/externalData';
import { confirm } from '../stores/confirmStore';
import { select } from './dbService';

const t = (key: string) => key;

function backupWith(appSettings: Array<{ key: string; value: string }>): string {
  return JSON.stringify({
    glossa_version: '0.9.0',
    schema_version: 1,
    exported_at: '2026-06-08T19:11:42.971Z',
    // Tutte le tabelle dichiarate, vuote tranne quella in prova.
    tables: {
      ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
      app_settings: appSettings,
    },
  });
}

describe('cosa porta con sé un backup', () => {
  it('comprende lo storico del lavoro e le schede delle opere, mai le immagini', () => {
    // D31: si conserva quello che non si riscarica. Le righe delle immagini
    // restano fuori: dopo un ripristino quei file non esistono, e dichiararli
    // presenti sarebbe una bugia.
    expect(BACKUP_TABLES).toContain('translation_revisions');
    expect(BACKUP_TABLES).toContain('provenance_events');
    expect(BACKUP_TABLES).toContain('sources');
    expect(BACKUP_TABLES).toContain('transcription_revisions');
    expect(BACKUP_TABLES).not.toContain('assets');
    expect(BACKUP_TABLES).not.toContain('jobs');
  });
});

describe('la misura con cui riscaricare', () => {
  it('sceglie la più grande per numero, non per stringa', async () => {
    // Come stringhe «900» batte «2000», e il ripristino riscaricherebbe a una
    // misura più piccola di quella che c'era.
    await exportWorkspace();
    const query = String(
      selectMock.mock.calls.map(([sql]) => sql).find((sql) => String(sql).includes('sizeTag')),
    );

    expect(query).toContain('CAST');
    expect(query).not.toMatch(/MAX\(a\.size_tag\)/);
  });
});

describe('riferimenti a cose che il backup non porta', () => {
  beforeEach(() => {
    runMock.mockClear();
    vi.mocked(confirm).mockClear();
  });

  it('svuota il lavoro che ha prodotto un fatto, invece di perdere il fatto', async () => {
    // I lavori non stanno nel backup: con il riferimento intatto la chiave
    // esterna rifiuta la riga e `INSERT OR IGNORE` la scarta in silenzio —
    // sparirebbe il registro che il backup serve a salvare.
    fsState.raw = JSON.stringify({
      glossa_version: '1.2.1',
      schema_version: 1,
      exported_at: '2026-07-21T12:00:00.000Z',
      tables: {
        ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
        provenance_events: [
          { id: 'pev:1', event_type: 'job.finished', entity_type: 'job', entity_id: 'download:v1', actor: 'system', job_id: 'download:v1' },
        ],
      },
    });

    await importWorkspace(t);

    const insert = runMock.mock.calls.find(([query]) =>
      String(query).includes('INSERT OR IGNORE INTO provenance_events'),
    );
    expect(insert).toBeDefined();
    const [query, params] = insert!;
    const columns = String(query).match(/\(([^)]+)\) VALUES/)![1].split(', ');
    expect((params as unknown[])[columns.indexOf('job_id')]).toBeNull();
    expect((params as unknown[])[columns.indexOf('entity_id')]).toBe('download:v1');
  });
});

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
