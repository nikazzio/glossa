import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useCachedImage } from '../../hooks/useCachedImage';
import { THUMB_SIZE, type CacheRequest } from '../../services/cacheService';

/** Le pagine di un manifesto si contano da uno: la copertina è la prima. */
const FIRST_PAGE = 1;

/**
 * La copertina di un'opera, presa dal motore invece che dalla rete.
 *
 * Con `versionId` la si cerca **prima sul computer**: di un libro scaricato la
 * copertina è la miniatura della sua prima pagina, e chiederla alla biblioteca
 * sarebbe andare a prendere fuori una cosa che è in casa. `url` resta il ripiego
 * di quando in casa non c'è niente.
 *
 * Finché non arriva — o se non arriva — resta il segnaposto: una copertina
 * mancante non è un errore da mostrare. Mentre sta arrivando, una rotellina
 * piccola in basso a destra, accanto al segnaposto invece che sopra.
 */
export function CachedThumbnail({
  url,
  versionId,
  providerKey,
  className,
  fallback,
}: {
  url: string | null;
  versionId?: string | null;
  providerKey?: string | null;
  className: string;
  fallback: ReactNode;
}) {
  const request: CacheRequest | null = versionId
    ? { kind: 'page', versionId, index: FIRST_PAGE, size: THUMB_SIZE, remoteUrl: url, providerKey }
    : url
      ? { kind: 'remote', url, providerKey }
      : null;
  const { url: source, loading } = useCachedImage(request);
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
