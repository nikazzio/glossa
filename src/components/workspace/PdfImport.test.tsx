import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPdfDialog } from './PdfImport';
import {
  importPdfAsNewWork,
  inspectPdfFile,
  pickManifestFile,
  pickPdfFile,
  readManifestFile,
} from '../../services/pdfImportService';
import '../../test/i18n-mock';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../hooks/useLanguageCatalog', () => ({ useLanguageCatalog: () => null }));
vi.mock('../../services/pdfImportService', () => ({
  fileStem: (path: string) => path.split('/').pop()?.replace(/\.pdf$/i, '') ?? path,
  importPdfAsNewWork: vi.fn().mockResolvedValue('source-1'),
  importSourceManifest: vi.fn(),
  inspectPdfFile: vi.fn(),
  pickManifestFile: vi.fn(),
  pickPdfFile: vi.fn(),
  readManifestFile: vi.fn(),
}));

function renderDialog(onImported = vi.fn()) {
  render(<ImportPdfDialog open onOpenChange={vi.fn()} workspaceId={null} onImported={onImported} />);
  return onImported;
}

const confirmButton = () => screen.getByRole('button', { name: 'areas.library.importPdfConfirm' });

describe('finestra di importazione di un PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pickPdfFile).mockResolvedValue('/scaricati/Diarii XIX.pdf');
    vi.mocked(inspectPdfFile).mockResolvedValue({ pages: 308, bytes: 32_000_000 });
  });

  it('senza PDF scelto non si può importare', () => {
    renderDialog();
    expect(confirmButton()).toBeDisabled();
  });

  it('scelto il PDF propone il nome del file come titolo e importa estraendo subito le pagine', async () => {
    const onImported = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'areas.library.importPdfPick' }));

    expect(await screen.findByDisplayValue('Diarii XIX')).toBeInTheDocument();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await userEvent.click(confirmButton());

    await waitFor(() => expect(importPdfAsNewWork).toHaveBeenCalledWith(expect.objectContaining({
      pdfPath: '/scaricati/Diarii XIX.pdf',
      manifest: null,
      extractNow: true,
    })));
    expect(onImported).toHaveBeenCalledWith('source-1');
  });

  it('un file che non è un PDF leggibile lo dice e lascia spento il comando', async () => {
    vi.mocked(inspectPdfFile).mockRejectedValue(new Error('pdf_invalid'));
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'areas.library.importPdfPick' }));

    expect(await screen.findByText('areas.library.importPdfInvalid')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('il manifesto riempie i campi e li segna come venuti dal manifesto', async () => {
    vi.mocked(pickManifestFile).mockResolvedValue('/scaricati/manifest.json');
    vi.mocked(readManifestFile).mockResolvedValue({
      providerKey: 'gallica',
      pages: 308,
      preview: {
        manifestUrl: 'https://gallica.bnf.fr/iiif/ark:/12148/x/manifest.json',
        title: 'Opera della biblioteca',
        creator: 'Sanuto, Marino',
        date: '1887',
        description: null,
        thumbnailUrl: null,
        language: null,
        volume: null,
        subjects: [],
        itemCount: null,
        materialType: null,
        contributors: [],
        publisher: null,
        rights: [],
        physicalDescription: null,
        holdingInstitution: null,
        pageUrl: null,
      },
    });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'areas.library.importManifestPick' }));

    expect(await screen.findByDisplayValue('Opera della biblioteca')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sanuto, Marino')).toBeInTheDocument();
    expect(screen.getAllByLabelText('areas.library.importFromManifest').length).toBeGreaterThan(0);
  });
});
