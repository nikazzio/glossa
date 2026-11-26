import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
  setSourceFieldOverride: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('./dbService', () => ({
  execute: mocks.execute,
  select: mocks.select,
  runInTransaction: mocks.runInTransaction,
}));
vi.mock('./libraryService', () => ({ setSourceFieldOverride: mocks.setSourceFieldOverride }));

const {
  importPdfAsNewWork,
  importPdfIntoWork,
  importSourceManifest,
  isImportUrl,
  LOCAL_IMPORT_PROVIDER,
} = await import('./pdfImportService');

const recorded: [string, unknown[] | undefined][] = [];

const manifest = {
  providerKey: 'gallica',
  pages: 3,
  preview: {
    manifestUrl: 'https://gallica.bnf.fr/iiif/ark:/12148/x/manifest.json',
    title: 'Opera della biblioteca',
    creator: 'Autore della biblioteca',
    date: '1550',
    description: null,
    thumbnailUrl: null,
    language: 'fra',
    volume: null,
    subjects: [],
    itemCount: null,
    materialType: null,
    contributors: [],
    publisher: null,
    rights: [],
    physicalDescription: null,
    holdingInstitution: null,
    pageUrl: 'https://gallica.bnf.fr/ark:/12148/x',
  },
};

const fields = { title: '', creator: '', date: '', language: null, pageUrl: '' };

function invokeAnswers(answers: Record<string, unknown>) {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command in answers) {
      const answer = answers[command];
      if (answer instanceof Error) throw answer;
      return answer;
    }
    throw new Error(`comando inatteso: ${command}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recorded.length = 0;
  mocks.select.mockResolvedValue([]);
  mocks.runInTransaction.mockImplementation(
    async (callback: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<void>) => {
      await callback(async (query, params) => {
        recorded.push([query, params]);
      });
    },
  );
});

describe('importazione di un PDF come opera nuova', () => {
  it('senza manifesto usa la cartella delle importazioni, il nome del file come titolo di base e salva il titolo scritto come correzione', async () => {
    invokeAnswers({ import_pdf_document: { pages: 3, bytes: 10 }, enqueue_pdf_extraction: { id: 'extract:x' } });

    const sourceId = await importPdfAsNewWork({
      pdfPath: '/scaricati/Diarii XIX.pdf',
      manifestPath: null,
      manifest: null,
      fields: { ...fields, title: 'I diarii, tomo XIX' },
      workspaceId: null,
      extractNow: true,
    });

    const importCall = mocks.invoke.mock.calls.find(([command]) => command === 'import_pdf_document');
    expect(importCall?.[1]).toMatchObject({ providerKey: LOCAL_IMPORT_PROVIDER, path: '/scaricati/Diarii XIX.pdf' });
    const [sourceInsert, versionInsert] = recorded;
    expect(sourceInsert[1]?.[1]).toBe('Diarii XIX');
    expect(versionInsert[1]?.[3]).toBe('pdf');
    expect(String(versionInsert[1]?.[4])).toMatch(/^glossa-import:/);
    expect(versionInsert[1]?.[6]).toBe(1);
    expect(mocks.setSourceFieldOverride).toHaveBeenCalledWith(sourceId, 'title', 'I diarii, tomo XIX');
    expect(mocks.invoke).toHaveBeenCalledWith('enqueue_pdf_extraction', expect.anything());
  });

  it('con il manifesto prende biblioteca e titolo di base dal manifesto e non estrae se la scelta è spenta', async () => {
    invokeAnswers({ import_pdf_document: { pages: 3, bytes: 10 } });

    await importPdfAsNewWork({
      pdfPath: '/scaricati/opera.pdf',
      manifestPath: '/scaricati/manifest.json',
      manifest,
      fields: { ...fields, title: manifest.preview.title, creator: manifest.preview.creator },
      workspaceId: 'ws-1',
      extractNow: false,
    });

    expect(mocks.invoke).toHaveBeenCalledWith('import_pdf_document', expect.objectContaining({
      providerKey: 'gallica',
      manifestPath: '/scaricati/manifest.json',
    }));
    expect(recorded[0][1]?.[1]).toBe('Opera della biblioteca');
    const metadata = JSON.parse(String(recorded[1][1]?.[5])) as { creator: string; pageUrl: string };
    expect(metadata.creator).toBe('Autore della biblioteca');
    expect(metadata.pageUrl).toBe('https://gallica.bnf.fr/ark:/12148/x');
    expect(recorded).toHaveLength(3);
    expect(mocks.invoke).not.toHaveBeenCalledWith('enqueue_pdf_extraction', expect.anything());
  });

  it('un file non valido non crea nessuna opera', async () => {
    invokeAnswers({ import_pdf_document: new Error('pdf_invalid') });

    await expect(importPdfAsNewWork({
      pdfPath: '/scaricati/foto.jpg',
      manifestPath: null,
      manifest: null,
      fields: { ...fields, title: 'Foto' },
      workspaceId: null,
      extractNow: true,
    })).rejects.toThrow('pdf_invalid');

    expect(mocks.runInTransaction).not.toHaveBeenCalled();
  });
});

describe('importazione in un\'opera esistente', () => {
  it('riempie la riga PDF dichiarata dalla biblioteca senza crearne una nuova', async () => {
    mocks.select.mockResolvedValue([
      { id: 'sver-img', metadata: '{"providerKey":"wellcome"}', is_primary: 1, version_kind: 'iiif_manifest' },
      { id: 'sver-pdf', metadata: null, is_primary: 0, version_kind: 'pdf' },
    ]);
    invokeAnswers({ import_pdf_document: { pages: 3, bytes: 10 } });

    const versionId = await importPdfIntoWork('source-1', '/scaricati/opera.pdf');

    expect(versionId).toBe('sver-pdf');
    expect(mocks.invoke).toHaveBeenCalledWith('import_pdf_document', expect.objectContaining({
      versionId: 'sver-pdf',
      providerKey: 'wellcome',
    }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('crea la riga PDF quando l\'opera non ne ha una', async () => {
    mocks.select.mockResolvedValue([
      { id: 'sver-img', metadata: '{"providerKey":"wellcome"}', is_primary: 1, version_kind: 'iiif_manifest' },
    ]);
    invokeAnswers({ import_pdf_document: { pages: 3, bytes: 10 } });

    await importPdfIntoWork('source-1', '/scaricati/opera.pdf');

    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO source_versions'), expect.arrayContaining(['pdf']));
  });
});

describe('manifesto caricato dopo', () => {
  it('riempie i dati della biblioteca senza toccare le correzioni', async () => {
    mocks.select.mockResolvedValue([{ id: 'sver-pdf', metadata: '{"providerKey":"local_import"}', is_primary: 1 }]);
    invokeAnswers({ import_source_manifest: manifest });

    await importSourceManifest('source-1', '/scaricati/manifest.json');

    expect(recorded.some(([query]) => query.includes('UPDATE sources'))).toBe(true);
    expect(recorded.some(([query]) => query.includes('source_field_overrides'))).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('indirizzi delle copie importate', () => {
  it('riconosce solo lo schema delle importazioni', () => {
    expect(isImportUrl('glossa-import:sver-1')).toBe(true);
    expect(isImportUrl('https://example.org/manifest.json')).toBe(false);
    expect(isImportUrl(null)).toBe(false);
  });
});
