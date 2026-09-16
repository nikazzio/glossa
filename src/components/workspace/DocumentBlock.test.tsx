import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentBlock } from './DocumentBlock';
import { enqueuePdfDownload } from '../../services/jobsService';
import { registerDeclaredDocument } from '../../services/libraryService';
import { freeVersionDocument } from '../../services/vaultService';
import { versionInventory } from '../../services/inventoryService';
import type { LibrarySourceVersion } from '../../types';
import '../../test/i18n-mock';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('../../services/libraryService', () => ({
  registerDeclaredDocument: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../hooks/useManifestFacts', () => ({
  readManifestFacts: (...args: unknown[]) => mockFacts(...args),
}));

vi.mock('../../services/jobsService', () => ({
  enqueuePdfDownload: vi.fn().mockResolvedValue({ id: 'pdf:v-pdf', status: 'queued' }),
  isTerminal: () => true,
}));

vi.mock('../../services/vaultService', () => ({
  freeVersionDocument: vi.fn().mockResolvedValue({ deletedFiles: 2, freedBytes: 4_000_000 }),
}));

vi.mock('../../services/documentService', () => ({
  openDocumentExternally: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/inventoryService', () => ({
  versionInventory: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn().mockResolvedValue(true) }));

vi.mock('../../stores/jobsStore', () => ({
  useJobsStore: (selector: (state: unknown) => unknown) =>
    selector({ jobs: [], applyChange: vi.fn() }),
}));

const mockFacts = vi.fn();

/** Quello che il motore risponde quando il manifesto non si è potuto leggere. */
const UNVERIFIED = {
  openable: null,
  pages: null,
  samplePixels: null,
  document: null,
  renderings: [],
};

const READ_WITHOUT_PDF = { ...UNVERIFIED, openable: true, pages: 120 };

const imagesVersion = {
  id: 'v-img',
  label: 'Gallica',
  versionKind: 'iiif_manifest',
  sourceUrl: 'https://gallica.bnf.fr/iiif/ark:/12148/bpt6k1234/manifest.json',
  providerKey: 'gallica',
  isPrimary: true,
  expectedPages: 120,
} as LibrarySourceVersion;

const documentVersion = {
  ...imagesVersion,
  id: 'v-pdf',
  versionKind: 'pdf',
  sourceUrl: 'https://example.test/opera.pdf',
  isPrimary: false,
} as LibrarySourceVersion;

function renderBlock(props: Partial<Parameters<typeof DocumentBlock>[0]> = {}) {
  return render(
    <DocumentBlock
      sourceId="s1"
      imagesVersion={imagesVersion}
      documentVersion={null}
      onChanged={vi.fn()}
      {...props}
    />,
  );
}

describe('DocumentBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFacts.mockResolvedValue(UNVERIFIED);
    vi.mocked(versionInventory).mockResolvedValue(null);
  });

  it('dichiara che il PDF non è disponibile invece di tacere', async () => {
    mockFacts.mockResolvedValue(READ_WITHOUT_PDF);

    renderBlock();

    expect(await screen.findByText(/areas\.library\.documentUnavailable/)).toBeInTheDocument();
  });

  it('un manifesto non letto resta «non verificato», non «non disponibile»', async () => {
    mockFacts.mockResolvedValue(UNVERIFIED);

    renderBlock();

    expect(await screen.findByText(/areas\.library\.documentUnverified/)).toBeInTheDocument();
  });

  it('quando la biblioteca lo dichiara, la copia entra in Biblioteca', async () => {
    mockFacts.mockResolvedValue({
      ...READ_WITHOUT_PDF,
      document: { url: 'https://example.test/opera.pdf', format: 'application/pdf', label: 'PDF' },
    });
    const onChanged = vi.fn();

    renderBlock({ onChanged });

    await waitFor(() =>
      expect(registerDeclaredDocument).toHaveBeenCalledWith('s1', {
        url: 'https://example.test/opera.pdf',
        label: 'PDF',
        providerKey: 'gallica',
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('senza indirizzo della digitalizzazione non interroga nessuno', async () => {
    renderBlock({ imagesVersion: null });

    expect(await screen.findByText(/areas\.library\.documentNoManifest/)).toBeInTheDocument();
    expect(mockFacts).not.toHaveBeenCalled();
  });

  it('copia registrata e non scaricata: il comando scarica il file', async () => {
    renderBlock({ documentVersion });

    await userEvent.click(
      await screen.findByRole('button', { name: 'areas.library.documentDownload' }),
    );

    await waitFor(() =>
      expect(enqueuePdfDownload).toHaveBeenCalledWith({
        providerKey: 'gallica',
        sourceUrl: 'https://example.test/opera.pdf',
        versionId: 'v-pdf',
      }),
    );
    // La verifica non si rifà: la copia c'è già.
    expect(mockFacts).not.toHaveBeenCalled();
  });

  it('copia scaricata: dice pagine e spazio, e il comando la elimina', async () => {
    vi.mocked(versionInventory).mockResolvedValue({
      versionId: 'v-pdf',
      providerKey: 'gallica',
      sizes: [],
      principal: null,
      hasManifest: false,
      document: { bytes: 4_000_000, pages: 128, sourceUrl: null, downloadedAt: null },
    });
    const onChanged = vi.fn();

    renderBlock({ documentVersion, onChanged });

    expect(await screen.findByText('areas.library.pageCount')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'areas.library.documentFreeAction' }),
    );

    await waitFor(() => expect(freeVersionDocument).toHaveBeenCalledWith('gallica', 'v-pdf'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('il PDF scaricato si può mandare nel visore al posto delle immagini', async () => {
    vi.mocked(versionInventory).mockResolvedValue({
      versionId: 'v-pdf',
      providerKey: 'gallica',
      sizes: [],
      principal: null,
      hasManifest: false,
      document: { bytes: 4_000_000, pages: 12, sourceUrl: null, downloadedAt: null },
    });
    const onShowVersion = vi.fn();

    renderBlock({ documentVersion, onShowVersion, shownVersionId: 'v-img' });

    await userEvent.click(
      await screen.findByRole('button', { name: 'areas.library.documentShow' }),
    );

    expect(onShowVersion).toHaveBeenCalledWith('v-pdf');
  });
});
