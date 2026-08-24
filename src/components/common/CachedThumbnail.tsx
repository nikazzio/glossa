import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useCachedImage } from '../../hooks/useCachedImage';

/**
 * La copertina di un'opera, presa dal motore invece che dalla rete.
 *
 * Finché non arriva — o se non arriva — resta il segnaposto: una copertina
 * mancante non è un errore da mostrare.
 *
 * Mentre sta arrivando, una rotellina piccola in basso a destra. Le richieste
 * passano dalle pause verso la biblioteca, quindi qualche secondo di attesa è
 * normale e va detto; ma il segnaposto resta quello che si vede, e la rotellina
 * gli sta accanto invece di coprirlo.
 */
export function CachedThumbnail({
  url,
  providerKey,
  className,
  fallback,
}: {
  url: string | null;
  providerKey?: string | null;
  className: string;
  fallback: ReactNode;
}) {
  const { url: source, loading } = useCachedImage(url ? { kind: 'remote', url, providerKey } : null);
  if (source) return <img src={source} alt="" className={className} />;
  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {fallback}
      {loading && (
        <Loader2
          size={10}
          aria-hidden="true"
          className="absolute bottom-0.5 right-0.5 animate-spin text-editorial-muted/70"
        />
      )}
    </span>
  );
}
