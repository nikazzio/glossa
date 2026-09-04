import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CachedThumbnail } from '../components/common/CachedThumbnail';
import { clearRetainedImageUrls } from './useCachedImage';

const cachedImage = vi.fn();
vi.mock('../services/cacheService', () => ({
  cachedImage: (...args: unknown[]) => cachedImage(...args),
}));

describe('la copertina presa dal motore', () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    cachedImage.mockReset();
    created.length = 0;
    revoked.length = 0;
    let next = 0;
    // `vi.spyOn` e non un'assegnazione diretta: `restoreAllMocks` non
    // ripristina le assegnazioni, e l'override sopravvivrebbe agli altri test.
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:copertina-${(next += 1)}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    clearRetainedImageUrls();
    vi.restoreAllMocks();
  });

  it('non chiede niente alla rete: i byte arrivano dal motore', async () => {
    cachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]));

    render(
      <CachedThumbnail url="https://gallica.bnf.fr/copertina.jpg" providerKey="gallica" className="c" fallback={<span>niente</span>} />,
    );

    await waitFor(() => expect(screen.getByRole('presentation', { hidden: true })).toBeTruthy());
    expect(cachedImage).toHaveBeenCalledWith(
      {
        kind: 'remote',
        url: 'https://gallica.bnf.fr/copertina.jpg',
        providerKey: 'gallica',
      },
      expect.objectContaining({ priority: 'normal', signal: expect.any(AbortSignal) }),
    );
    // L'indirizzo disegnato è temporaneo e locale, mai quello della biblioteca.
    expect(screen.getByRole('presentation', { hidden: true }).getAttribute('src')).toBe(created[0]);
  });

  it('riusa l\'indirizzo temporaneo tornando al catalogo', async () => {
    cachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const view = render(
      <CachedThumbnail url="https://gallica.bnf.fr/copertina.jpg" className="c" fallback={<span>niente</span>} />,
    );
    await waitFor(() => expect(created).toHaveLength(1));

    view.unmount();
    render(
      <CachedThumbnail url="https://gallica.bnf.fr/copertina.jpg" className="c" fallback={<span>niente</span>} />,
    );

    await waitFor(() => expect(screen.getByRole('presentation', { hidden: true })).toBeTruthy());
    expect(cachedImage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('presentation', { hidden: true }).getAttribute('src')).toBe(created[0]);
    expect(revoked).toEqual([]);
  });

  it('annulla una richiesta non più visibile quando il componente sparisce', async () => {
    cachedImage.mockReturnValue(new Promise<Uint8Array>(() => {}));
    const view = render(
      <CachedThumbnail url="https://gallica.bnf.fr/lenta.jpg" className="c" fallback={<span>niente</span>} />,
    );
    await waitFor(() => expect(cachedImage).toHaveBeenCalled());
    const options = cachedImage.mock.calls[0][1] as { signal: AbortSignal };

    view.unmount();

    expect(options.signal.aborted).toBe(true);
  });

  it('mostra il segnaposto quando la copertina non arriva', async () => {
    cachedImage.mockRejectedValue(new Error('la biblioteca non risponde'));

    render(<CachedThumbnail url="https://gallica.bnf.fr/rotta.jpg" className="c" fallback={<span>niente</span>} />);

    await waitFor(() => expect(screen.getByText('niente')).toBeTruthy());
  });

  it('mentre la copertina arriva gira una rotellina accanto al segnaposto', async () => {
    let resolve: (bytes: Uint8Array) => void = () => {};
    cachedImage.mockReturnValue(new Promise<Uint8Array>((done) => { resolve = done; }));

    const { container } = render(
      <CachedThumbnail url="https://gallica.bnf.fr/lenta.jpg" className="c" fallback={<span>niente</span>} />,
    );

    // Il segnaposto resta quello che si vede: la rotellina gli sta accanto.
    expect(screen.getByText('niente')).toBeTruthy();
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeTruthy());

    resolve(new Uint8Array([1, 2, 3]));
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
  });

  it('senza copertina non chiede niente', () => {
    render(<CachedThumbnail url={null} className="c" fallback={<span>niente</span>} />);

    expect(cachedImage).not.toHaveBeenCalled();
    expect(screen.getByText('niente')).toBeTruthy();
  });
});
