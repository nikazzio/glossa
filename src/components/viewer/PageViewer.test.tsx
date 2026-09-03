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

  it('mostra un errore riprovabile quando fallisce il caricamento dei tasselli', async () => {
    render(<PageViewer sourceId="source-1" manifestUrl="https://example.test/manifest" providerKey={null} />);
    await screen.findByText('areas.library.viewerPageOf · P1');
    await waitFor(() => expect(osd.handlers.get('tile-load-failed')).toBeDefined());

    act(() => osd.handlers.get('tile-load-failed')?.());

    expect(await screen.findByText('areas.library.viewerLoadError')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.viewerRetry' })).toBeInTheDocument();
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
