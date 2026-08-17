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

// Le colonne che il ripristino può scrivere le chiede al database: qui si
// finge il database, con lo schema che conta per la prova.
const liveSchema = vi.hoisted<Record<string, string[]>>(() => ({
  app_settings: ['key', 'value'],
  glossaries: ['id', 'name', 'workspace_id', 'created_at'],
  translations: ['id', 'project_id', 'approved_revision_id', 'translation_locked'],
  provenance_events: [
    'id', 'occurred_at', 'event_type', 'entity_type', 'entity_id', 'workspace_id', 'actor', 'job_id',
  ],
}));

const runMock = vi.fn<RunFn>(async () => undefined);
const selectMock = vi.mocked(select);

vi.mock('./dbService', () => ({
  select: vi.fn(async (query: string, params?: unknown[]) => {
    const table = String(query).includes('pragma_table_info') ? String(params?.[0]) : undefined;
    // Le tabelle che una prova non guarda hanno comunque una colonna: zero
    // colonne significa «tabella assente», ed è un caso a sé.
    return table ? (liveSchema[table] ?? ['id']).map((name) => ({ name })) : [];
  }),
  runInTransaction: vi.fn(async (callback: (run: RunFn) => Promise<void>) => {
    await callback(runMock);
  }),
}));

import { writeBackup, restoreBackup } from './backupService';
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
    await writeBackup();
    const query = String(
      selectMock.mock.calls.map(([sql]) => sql).find((sql) => String(sql).includes('sizeTag')),
    );

    expect(query).toContain('CAST');
    expect(query).not.toMatch(/MAX\(a\.size_tag\)/);
  });
});

describe('le colonne che il ripristino rimette', () => {
  beforeEach(() => {
    runMock.mockClear();
  });

  it('rimette anche le colonne aggiunte dopo, perché le chiede al database', async () => {
    // Prima erano scritte a mano: ogni colonna aggiunta al programma e
    // dimenticata qui spariva al ripristino in silenzio — fra le altre, il
    // workspace a cui appartiene un dizionario.
    fsState.raw = JSON.stringify({
      glossa_version: '1.4.0',
      schema_version: 1,
      exported_at: '2026-08-17T09:00:00.000Z',
      tables: {
        ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
        glossaries: [{ id: 'g1', name: 'Lessico', workspace_id: 'ws1', colonna_sparita: 'x' }],
      },
    });

    await restoreBackup(t);

    const insert = runMock.mock.calls.find(([query]) =>
      String(query).includes('INSERT OR IGNORE INTO glossaries'),
    );
    const [query, params] = insert!;
    const columns = String(query).match(/\(([^)]+)\) VALUES/)![1].split(', ');
    expect(columns).toContain('workspace_id');
    expect((params as unknown[])[columns.indexOf('workspace_id')]).toBe('ws1');
    // Una colonna che il database non ha resta fuori: finirebbe nella query.
    expect(columns).not.toContain('colonna_sparita');
  });

  it('se una tabella non c\'è si ferma prima di cancellare, invece di perderla in silenzio', async () => {
    liveSchema.glossaries = [];
    fsState.raw = JSON.stringify({
      glossa_version: '1.4.0',
      schema_version: 1,
      exported_at: '2026-08-17T09:00:00.000Z',
      tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
    });

    await expect(restoreBackup(t)).rejects.toThrow('backup_schema_unreadable');
    expect(runMock).not.toHaveBeenCalled();

    liveSchema.glossaries = ['id', 'name', 'workspace_id', 'created_at'];
  });
});

describe('i puntatori che al momento dell inserimento non possono valere', () => {
  beforeEach(() => {
    runMock.mockClear();
  });

  it('l approvazione di un frammento torna dopo le revisioni, non si perde', async () => {
    // Il frammento si inserisce prima delle revisioni: lasciare il puntatore
    // com'è **ferma il ripristino**, perché le chiavi esterne non le salta
    // nemmeno `INSERT OR IGNORE`. Svuotarlo e basta perdeva l'approvazione.
    fsState.raw = JSON.stringify({
      glossa_version: '1.4.0',
      schema_version: 1,
      exported_at: '2026-08-17T09:00:00.000Z',
      tables: {
        ...Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
        translations: [{ id: 'chunk-1', project_id: 'p1', approved_revision_id: 'chunk-1:r2' }],
      },
    });

    await restoreBackup(t);

    const insert = runMock.mock.calls.find(([query]) =>
      String(query).includes('INSERT OR IGNORE INTO translations'),
    );
    const [query, params] = insert!;
    const columns = String(query).match(/\(([^)]+)\) VALUES/)![1].split(', ');
    expect((params as unknown[])[columns.indexOf('approved_revision_id')]).toBeNull();

    const update = runMock.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE translations SET approved_revision_id'),
    );
    expect(update).toBeDefined();
    // Solo se la revisione c'è davvero: un backup da un altro computer può non
    // averla, e riscriverla comunque fermerebbe tutto.
    expect(String(update![0])).toContain('EXISTS');
    expect(update![1]).toEqual(['chunk-1:r2', 'chunk-1']);
  });
});

describe('le pagine già sul disco', () => {
  beforeEach(() => {
    runMock.mockClear();
  });

  it('sopravvivono al ripristino, ma solo quelle di un opera che esiste ancora', async () => {
    // Le righe delle pagine sono appese alle opere: sostituire le opere se le
    // portava via per cascata, e il programma smetteva di sapere di file che
    // sul disco ci sono ancora.
    fsState.raw = backupWith([]);

    await restoreBackup(t);

    const queries = runMock.mock.calls.map(([query]) => String(query));
    const copy = queries.findIndex((query) => query.includes('CREATE TEMP TABLE kept_assets'));
    const wipe = queries.findIndex((query) => query.trim() === 'DELETE FROM sources');
    const back = queries.findIndex((query) => query.includes('INSERT OR IGNORE INTO assets'));

    expect(copy).toBeGreaterThanOrEqual(0);
    // La copia va fatta **prima** della cancellazione, o non c'è più niente da copiare.
    expect(copy).toBeLessThan(wipe);
    expect(back).toBeGreaterThan(wipe);
    expect(queries[back]).toContain('source_version_id IN (SELECT id FROM source_versions)');
    expect(queries.some((query) => query.includes('DROP TABLE temp.kept_assets'))).toBe(true);
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

    await restoreBackup(t);

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

describe('il ripristino', () => {
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

    await expect(restoreBackup(t)).rejects.toThrow('invalid_backup');
    expect(confirm).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects a backup created by a newer schema before changing data', async () => {
    fsState.raw = backupWith([]).replace('"schema_version":1', '"schema_version":2');

    await expect(restoreBackup(t)).rejects.toThrow('incompatible_schema_version');
    expect(confirm).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('does not restore the schema_version app_settings row, preventing resetOutdatedBetaDatabase from wiping the DB on next startup', async () => {
    fsState.raw = backupWith([
      { key: 'schema_version', value: 'db-schema-v1' },
      { key: 'active_workspace_id', value: 'ws_orafo' },
    ]);

    await restoreBackup(t);

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

    await restoreBackup(t);

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

    await restoreBackup(t);

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
