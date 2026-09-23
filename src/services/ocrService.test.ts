import { describe, expect, it, vi, beforeEach } from 'vitest';
import { startOcrForPage } from './ocrService';
import { fetchViewerManifestWithRetry } from './iiifViewerService';
import { enqueueOcrPages } from './jobsService';
import type { ViewerPage } from './iiifViewerService';
import type { TranscriptionDocument, TranscriptionSegment } from './transcriptionService';
import { useConfigStore } from '../stores/configStore';

vi.mock('./iiifViewerService', () => ({
  fetchViewerManifestWithRetry: vi.fn(),
  pageSourceUrl: (service: string, size: string) => `${service}/full/${size},/0/default.jpg`,
  buildsImagesOnDemand: () => false,
  wholePageAttempts: () => ['1250'],
}));
vi.mock('./inventoryService', () => ({ versionInventory: vi.fn(), readableLocalSize: vi.fn() }));
vi.mock('./jobsService', () => ({ enqueueOcrPages: vi.fn() }));

const manifestMock = vi.mocked(fetchViewerManifestWithRetry);
const enqueueMock = vi.mocked(enqueueOcrPages);

/** Un libro come lo legge il visore: indice da 1, come nel manifesto. */
function page(index: number, label: string): ViewerPage {
  return {
    index, label, imageService: `https://biblioteca.example/f${index}`,
    width: 2000, height: 3000, canvasId: null, thumbnail: null,
  };
}

const document: TranscriptionDocument = {
  id: 'td1', source_version_id: 'v1', workspace_id: 'ws1', title: 'Libro', status: 'active',
  ocr_provider: 'openai', ocr_model: 'gpt-5.6-terra', ocr_prompt: null,
};

function segmentAt(position: number): TranscriptionSegment {
  return {
    id: `ts${position}`, document_id: 'td1', position, label: null,
    source_page_id: null, approved_revision_id: null,
  };
}

describe('pagina inviata al modello', () => {
  beforeEach(() => {
    manifestMock.mockReset().mockResolvedValue({
      // Le prime carte senza numero stampato, poi la numerazione della
      // biblioteca che riparte da 3: la stessa forma del libro di prova.
      pages: [
        page(1, 'plat sup.'), page(2, 'contreplat sup.'), page(3, 'garde recto'),
        page(4, 'garde verso'), page(5, 'NP'), page(6, 'NP'), page(7, 'NP'),
        page(8, 'NP'), page(9, '3'), page(10, '4'),
      ],
      homepage: null, rights: null, attribution: null, presentation2: false,
    });
    enqueueMock.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof enqueueOcrPages>>);
  });

  async function sentFor(position: number) {
    await startOcrForPage({
      document,
      segment: segmentAt(position),
      workspace: { ocrDefaultPrompt: '', ocrDefaultProvider: 'openai', ocrDefaultModel: 'gpt-5.6-terra' },
      viewerRef: {
        sourceId: 's1', versionId: 'v1', versionKind: 'iiif_manifest',
        sourceUrl: 'https://biblioteca.example/manifest.json', providerKey: 'gallica',
      },
      pageLabel: String(position + 1),
      image: { edge: 2000, mode: 'optimized' },
    });
    return enqueueMock.mock.calls[0][0][0];
  }

  it('la nona pagina aperta nello Studio invia la nona pagina del libro, non l ottava', async () => {
    const sent = await sentFor(8);

    expect(sent.cacheRequest).toMatchObject({ kind: 'page', index: 9 });
    expect(sent.cacheRequest.kind === 'page' && sent.cacheRequest.remoteUrl).toContain('/f9/');
  });

  it('la copertina invia la prima pagina del libro', async () => {
    const sent = await sentFor(0);

    expect(sent.cacheRequest).toMatchObject({ kind: 'page', index: 1 });
  });

  it('il numero di pagina nel lavoro è la posizione nel libro, non quello stampato', async () => {
    const sent = await sentFor(8);

    expect(sent.pageLabel).toBe('9');
  });

  it('una pagina oltre la fine del libro non parte', async () => {
    await expect(sentFor(10)).rejects.toThrow('noDigitization');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('congela nel lavoro l indirizzo Ollama configurato', async () => {
    const previousUrl = useConfigStore.getState().ollamaBaseUrl;
    useConfigStore.setState({ ollamaBaseUrl: 'http://127.0.0.1:11435' });
    try {
      await startOcrForPage({
        document: { ...document, ocr_provider: 'ollama', ocr_model: 'llava' },
        segment: segmentAt(0),
        workspace: { ocrDefaultPrompt: '', ocrDefaultProvider: '', ocrDefaultModel: '' },
        viewerRef: {
          sourceId: 's1', versionId: 'v1', versionKind: 'iiif_manifest',
          sourceUrl: 'https://biblioteca.example/manifest.json', providerKey: 'gallica',
        },
        pageLabel: '1', image: { edge: 2000, mode: 'optimized' },
      });
      expect(enqueueMock.mock.calls[0][0][0].ollamaBaseUrl).toBe('http://127.0.0.1:11435');
    } finally {
      useConfigStore.setState({ ollamaBaseUrl: previousUrl });
    }
  });
});
