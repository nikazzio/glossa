import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSection } from './DocumentSection';
import { enqueuePdfDownload } from '../../services/jobsService';
import { freeVersionDocument } from '../../services/vaultService';
import type { LibrarySourceVersion } from '../../types';
import '../../test/i18n-mock';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('../../services/libraryService', () => ({
  versionProviderKey: vi.fn().mockResolvedValue('gallica'),
}));

vi.mock('../../services/jobsService', () => ({
  enqueuePdfDownload: vi.fn().mockResolvedValue({ id: 'pdf:v1', status: 'queued' }),
  isTerminal: () => true,
}));

vi.mock('../../services/vaultService', () => ({
  freeVersionDocument: vi.fn().mockResolvedValue({ deletedFiles: 2, freedBytes: 4_000_000 }),
}));

vi.mock('../../services/documentService', () => ({
  openDocumentExternally: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn().mockResolvedValue(true) }));

vi.mock('../../stores/jobsStore', () => ({
  useJobsStore: (selector: (state: unknown) => unknown) =>
    selector({ jobs: [], applyChange: vi.fn() }),
}));

const version: LibrarySourceVersion = {
  id: 'v1',
  label: 'Gallica',
  versionKind: 'pdf',
  sourceUrl: 'https://gallica.bnf.fr/ark:/12148/bpt6k1234/f1.pdf',
  providerKey: 'gallica',
  isPrimary: true,
  expectedPages: 0,
} as LibrarySourceVersion;

describe('DocumentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mette in coda lo scaricamento quando il documento non è ancora sul computer', async () => {
    render(
      <DocumentSection
        version={version}
        document={null}
        isOpenInViewer={false}
        viewing={false}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'areas.library.documentDownload' }));

    await waitFor(() =>
      expect(enqueuePdfDownload).toHaveBeenCalledWith({
        providerKey: 'gallica',
        sourceUrl: version.sourceUrl,
        versionId: 'v1',
      }),
    );
  });

  it('dice pagine e spazio del documento presente, e non offre di riscaricarlo', () => {
    render(
      <DocumentSection
        version={version}
        document={{ bytes: 4_000_000, pages: 128, sourceUrl: null, downloadedAt: null }}
        isOpenInViewer={false}
        viewing={false}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('areas.library.pageCount')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.documentAlreadyHere' })).toBeDisabled();
  });

  it('quando le pagine non si sono potute contare lo dichiara invece di scrivere zero', () => {
    render(
      <DocumentSection
        version={version}
        document={{ bytes: 4_000_000, pages: null, sourceUrl: null, downloadedAt: null }}
        isOpenInViewer={false}
        viewing={false}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('areas.library.documentPagesUnknown')).toBeInTheDocument();
  });

  it('elimina solo il documento', async () => {
    const onChanged = vi.fn();
    render(
      <DocumentSection
        version={version}
        document={{ bytes: 4_000_000, pages: 12, sourceUrl: null, downloadedAt: null }}
        isOpenInViewer={false}
        viewing={false}
        onChanged={onChanged}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'areas.library.documentFreeAction' }));

    await waitFor(() => expect(freeVersionDocument).toHaveBeenCalledWith('gallica', 'v1'));
    expect(onChanged).toHaveBeenCalled();
  });
});
