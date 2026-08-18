import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CachedThumbnail } from '../components/common/CachedThumbnail';

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
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:copertina-${(next += 1)}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('non chiede niente alla rete: i byte arrivano dal motore', async () => {
    cachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]));

    render(
      <CachedThumbnail url="https://gallica.bnf.fr/copertina.jpg" providerKey="gallica" className="c" fallback={<span>niente</span>} />,
    );

    await waitFor(() => expect(screen.getByRole('presentation', { hidden: true })).toBeTruthy());
    expect(cachedImage).toHaveBeenCalledWith({
      kind: 'remote',
      url: 'https://gallica.bnf.fr/copertina.jpg',
      providerKey: 'gallica',
    });
    // L'indirizzo disegnato è temporaneo e locale, mai quello della biblioteca.
    expect(screen.getByRole('presentation', { hidden: true }).getAttribute('src')).toBe(created[0]);
  });

  it('rilascia l\'indirizzo temporaneo quando la copertina sparisce', async () => {
    cachedImage.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const view = render(
      <CachedThumbnail url="https://gallica.bnf.fr/copertina.jpg" className="c" fallback={<span>niente</span>} />,
    );
    await waitFor(() => expect(created).toHaveLength(1));

    view.unmount();

    // Senza questo, scorrere una lista lascerebbe dietro i byte di ogni
    // copertina già vista.
    await waitFor(() => expect(revoked).toEqual([created[0]]));
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
