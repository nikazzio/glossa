import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageViewer } from './PageViewer';
import * as viewerService from '../../services/iiifViewerService';
import * as cacheService from '../../services/cacheService';

const osd = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  viewer: {
    viewport: {
      zoomBy: vi.fn(),
      goHome: vi.fn(),
      zoomTo: vi.fn(),
      panTo: vi.fn(),
      getZoom: vi.fn(() => 1),
      getCenter: vi.fn(() => ({ x: 0.5, y: 0.5 })),
      imageToViewportZoom: vi.fn(() => 1),
      applyConstraints: vi.fn(),
    },
    open: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    addHandler: vi.fn((name: string, handler: () => void) => osd.handlers.set(name, handler)),
    addOnceHandler: vi.fn(),
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
  pageSourceUrl: (service: string, size: string) => `${service}/full/${size},/0/default.jpg`,
  WHOLE_PAGE_WIDTH_PX: 1600,
  MAX_SIZE: 'max',
}));

vi.mock('../../services/inventoryService', () => ({
  versionInventory: vi.fn(async () => null),
}));

vi.mock('../../services/cacheService', () => ({
  cachedImage: vi.fn(async () => new Uint8Array([1, 2, 3])),
  THUMB_SIZE: 'thumb',
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
  thumbnail: null,
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
    vi.mocked(cacheService.cachedImage).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(viewerService.getLastViewedPage).mockResolvedValue(0);
    vi.mocked(viewerService.setLastViewedPage).mockResolvedValue(undefined);
  });

  it('apre la pagina con una sola richiesta, senza chiedere lo zoom a pezzi', async () => {
    render(<PageViewer sourceId="source-1" versionId="sver-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');

    // Una richiesta sola, per numero di pagina: il motore guarda prima sul
    // computer, e l'indirizzo remoto è solo il ripiego.
    await waitFor(() =>
      expect(vi.mocked(cacheService.cachedImage)).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'page',
          versionId: 'sver-1',
          index: 1,
          remoteUrl: 'https://images.example.test/1/full/1600,/0/default.jpg',
        }),
        expect.objectContaining({ priority: 'high' }),
      ),
    );
    // Lo zoom a pezzi costa una quindicina di richieste: non si chiede finché
    // nessuno sta ingrandendo.
    expect(vi.mocked(viewerService.fetchIiifBytes)).not.toHaveBeenCalled();
  });

  it('passa allo zoom a pezzi solo quando si ingrandisce oltre l immagine intera', async () => {
    render(<PageViewer sourceId="source-1" versionId="sver-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('zoom')).toBeDefined());

    // Prima si vede qualcosa, poi si ingrandisce oltre i pixel dell'immagine.
    act(() => osd.handlers.get('tile-loaded')?.());
    osd.viewer.viewport.getZoom.mockReturnValue(4);
    await act(async () => {
      osd.handlers.get('zoom')?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(vi.mocked(viewerService.fetchIiifBytes)).toHaveBeenCalledWith(
        'https://images.example.test/1/info.json',
        null,
        expect.any(AbortSignal),
      ),
    );
  });

  it('dichiara la pagina guasta quando non arriva niente', async () => {
    vi.mocked(cacheService.cachedImage).mockRejectedValue(new Error('la biblioteca non risponde'));
    render(<PageViewer sourceId="source-1" versionId="sver-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');

    expect(await screen.findByText('areas.library.viewerLoadError')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.viewerRetry' })).toBeInTheDocument();
  });

  it('un pezzo perso non cancella una pagina che si vede già', async () => {
    render(<PageViewer sourceId="source-1" versionId="sver-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('tile-loaded')).toBeDefined());

    act(() => osd.handlers.get('tile-loaded')?.());
    act(() => osd.handlers.get('tile-load-failed')?.());

    expect(screen.queryByText('areas.library.viewerLoadError')).not.toBeInTheDocument();
  });

  it('cambia pagina con le frecce solo quando il focus appartiene al visore', async () => {
    render(<PageViewer sourceId="source-1" versionId="sver-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('areas.library.viewerPageOf · P1')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('application', { name: 'areas.library.viewerSection' }), {
      key: 'ArrowRight',
    });

    await waitFor(() => expect(screen.getByText('areas.library.viewerPageOf · P2')).toBeInTheDocument());
  });
});
