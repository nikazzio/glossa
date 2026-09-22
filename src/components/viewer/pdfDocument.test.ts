import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedDocument } from './pdfDocument';
import { renderDocumentPage } from './pdfDocument';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

describe('disegno pagine PDF', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serializza la stessa pagina e libera le risorse dopo ogni disegno', async () => {
    const releases: Array<() => void> = [];
    let activeRenders = 0;
    let maxActiveRenders = 0;
    const cleanup = vi.fn();
    const page = {
      getViewport: () => ({ width: 100, height: 200 }),
      render: vi.fn(() => ({
        promise: new Promise<void>((resolve) => {
          activeRenders += 1;
          maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
          releases.push(() => {
            activeRenders -= 1;
            resolve();
          });
        }),
      })),
      cleanup,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}),
      toBlob: (resolve: BlobCallback) => resolve(new Blob(['pagina'])),
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
      tagName === 'canvas'
        ? canvas as unknown as HTMLCanvasElement
        : originalCreateElement(tagName));
    const loaded = {
      pages: 1,
      handle: { getPage: vi.fn().mockResolvedValue(page) },
      renderQueues: new Map<number, Promise<void>>(),
      destroy: vi.fn(),
    } as unknown as LoadedDocument;

    const first = renderDocumentPage(loaded, 0);
    const second = renderDocumentPage(loaded, 0);
    await vi.waitFor(() => expect(releases).toHaveLength(1));

    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(cleanup).toHaveBeenCalledTimes(1);

    releases[1]();
    await Promise.all([first, second]);
    await vi.waitFor(() => expect(loaded.renderQueues.size).toBe(0));

    expect(maxActiveRenders).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
