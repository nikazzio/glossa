import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageViewer } from './PageViewer';
import * as viewerService from '../../services/iiifViewerService';

const osd = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  viewer: {
    viewport: { zoomBy: vi.fn(), goHome: vi.fn() },
    open: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    addHandler: vi.fn((name: string, handler: () => void) => osd.handlers.set(name, handler)),
    removeHandler: vi.fn((name: string) => osd.handlers.delete(name)),
  },
}));

vi.mock('openseadragon', () => ({
  default: vi.fn(() => osd.viewer),
}));

vi.mock('../../services/iiifViewerService', () => ({
  fetchViewerManifest: vi.fn(),
  fetchIiifBytes: vi.fn(),
  getLastViewedPage: vi.fn(),
  setLastViewedPage: vi.fn(),
  infoJsonUrl: (service: string) => `${service}/info.json`,
  pageThumbnailUrl: (service: string) => `${service}/full/96,/0/default.jpg`,
  wholePageUrl: (service: string) => `${service}/full/1600,/0/default.jpg`,
}));

vi.mock('./iiifTileBridge', () => ({
  createControlledIiifTileSource: vi.fn(() => ({})),
}));

vi.mock('../../hooks/useCachedImage', () => ({
  useCachedImage: () => ({ url: null, loading: false }),
}));

const pages = [1, 2, 3].map((index) => ({
  index,
  label: `P${index}`,
  imageService: `https://images.example.test/${index}`,
  width: 1000,
  height: 1400,
  canvasId: `canvas-${index}`,
}));

describe('PageViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    osd.handlers.clear();
    vi.mocked(viewerService.fetchViewerManifest).mockResolvedValue({
      pages,
      homepage: null,
      rights: null,
      attribution: null,
      presentation2: false,
    });
    vi.mocked(viewerService.fetchIiifBytes).mockResolvedValue(
      new TextEncoder().encode('{"id":"https://images.example.test/1","width":1000,"height":1400}'),
    );
    vi.mocked(viewerService.getLastViewedPage).mockResolvedValue(0);
    vi.mocked(viewerService.setLastViewedPage).mockResolvedValue(undefined);
  });

  it('ripiega sulla pagina intera quando lo zoom a tasselli non arriva', async () => {
    render(<PageViewer sourceId="source-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('tile-load-failed')).toBeDefined());

    await act(async () => {
      osd.handlers.get('tile-load-failed')?.();
      await Promise.resolve();
    });

    // Chiesta l'immagine intera, e nessun errore a schermo: la pagina si vede,
    // solo senza zoom.
    await waitFor(() =>
      expect(vi.mocked(viewerService.fetchIiifBytes)).toHaveBeenCalledWith(
        'https://images.example.test/1/full/1600,/0/default.jpg',
        null,
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByText('areas.library.viewerLoadError')).not.toBeInTheDocument();
  });

  it('dichiara la pagina guasta solo quando nemmeno l intera arriva', async () => {
    vi.mocked(viewerService.fetchIiifBytes).mockImplementation(async (url: string) => {
      if (url.endsWith('/info.json')) {
        return new TextEncoder().encode('{"id":"https://images.example.test/1","width":1000,"height":1400}');
      }
      throw new Error('la biblioteca non risponde');
    });
    render(<PageViewer sourceId="source-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('tile-load-failed')).toBeDefined());

    await act(async () => {
      osd.handlers.get('tile-load-failed')?.();
      await Promise.resolve();
    });

    expect(await screen.findByText('areas.library.viewerLoadError')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.viewerRetry' })).toBeInTheDocument();
  });

  it('un tassello perso non cancella una pagina che si vede già', async () => {
    render(<PageViewer sourceId="source-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('tile-loaded')).toBeDefined());

    act(() => osd.handlers.get('tile-loaded')?.());
    act(() => osd.handlers.get('tile-load-failed')?.());

    expect(screen.queryByText('areas.library.viewerLoadError')).not.toBeInTheDocument();
  });

  it('cambia pagina con le frecce solo quando il focus appartiene al visore', async () => {
    render(<PageViewer sourceId="source-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('areas.library.viewerPageOf · P1')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('application', { name: 'areas.library.viewerSection' }), {
      key: 'ArrowRight',
    });

    await waitFor(() => expect(screen.getByText('areas.library.viewerPageOf · P2')).toBeInTheDocument());
  });
});
