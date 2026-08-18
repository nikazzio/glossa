import { useEffect, useState } from 'react';
import { cachedImage, type CacheRequest } from '../services/cacheService';

/**
 * I byte di un'immagine, presi dal motore e trasformati in un indirizzo
 * temporaneo che la finestra può disegnare.
 *
 * Perché non `<img src="https://…">`: la politica di sicurezza non ammette
 * immagini prese da un indirizzo remoto, e una richiesta fatta dalla finestra
 * scavalcherebbe comunque le pause verso la biblioteca.
 *
 * L'indirizzo si rilascia allo smontaggio e al cambio di richiesta: senza,
 * ogni scorrimento di una lista lascerebbe dietro di sé i byte di tutte le
 * copertine già viste.
 */
export function useCachedImage(request: CacheRequest | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const bytes = await cachedImage(JSON.parse(key) as CacheRequest);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart]));
        setUrl(objectUrl);
      } catch {
        // Una copertina che non arriva non è un errore da mostrare: al suo
        // posto resta il segnaposto, come per un'opera che non ne ha.
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}
