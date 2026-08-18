import type { ReactNode } from 'react';
import { useCachedImage } from '../../hooks/useCachedImage';

/**
 * La copertina di un'opera, presa dal motore invece che dalla rete.
 *
 * Finché non arriva — o se non arriva — resta il segnaposto: una copertina
 * mancante non è un errore da mostrare.
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
  const source = useCachedImage(url ? { kind: 'remote', url, providerKey } : null);
  if (!source) return <>{fallback}</>;
  return <img src={source} alt="" className={className} />;
}
