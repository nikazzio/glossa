import { useEffect, useState } from 'react';
import { cachedImage, type CacheRequest, type CachedImageOptions } from '../services/cacheService';

const MAX_RETAINED_IMAGES = 128;

interface RetainedImage {
  url: string;
  users: number;
  touchedAt: number;
}

/**
 * Indirizzi locali gia' decodificati. Il motore conserva i byte; questo piccolo
 * livello evita che tornare dal visore al catalogo faccia comunque sparire e
 * ricreare tutte le copertine. Le voci in uso non vengono mai revocate.
 */
const retainedImages = new Map<string, RetainedImage>();

/**
 * Butta gli indirizzi non più in uso finché si rientra nel tetto, dai meno
 * recenti. Gira sia quando arriva un'immagine nuova sia quando una viene
 * lasciata: lasciando un catalogo intero senza aprirne un altro, il tetto
 * restava superato a tempo indeterminato.
 */
function evictUnused(): void {
  if (retainedImages.size <= MAX_RETAINED_IMAGES) return;
  const disposable = [...retainedImages.entries()]
    .filter(([, image]) => image.users === 0)
    .sort((left, right) => left[1].touchedAt - right[1].touchedAt);
  while (retainedImages.size > MAX_RETAINED_IMAGES && disposable.length > 0) {
    const [oldKey, image] = disposable.shift()!;
    retainedImages.delete(oldKey);
    URL.revokeObjectURL(image.url);
  }
}

function retain(key: string, bytes: Uint8Array): string {
  const known = retainedImages.get(key);
  if (known) {
    known.users += 1;
    known.touchedAt = Date.now();
    return known.url;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  retainedImages.set(key, { url, users: 1, touchedAt: Date.now() });
  evictUnused();
  return url;
}

function release(key: string): void {
  const known = retainedImages.get(key);
  if (!known) return;
  known.users = Math.max(0, known.users - 1);
  known.touchedAt = Date.now();
  if (known.users === 0) evictUnused();
}

/** Svuota solo gli indirizzi della finestra; i byte nel motore restano. */
export function clearRetainedImageUrls(): void {
  for (const image of retainedImages.values()) URL.revokeObjectURL(image.url);
  retainedImages.clear();
}

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
 *
 * `loading` esiste perché l'attesa **si vede**: rete e decodifica possono
 * richiedere tempo e chi guarda deve capire che l'immagine sta arrivando, non
 * che non c'è.
 */
export function useCachedImage(
  request: CacheRequest | null,
  options: Pick<CachedImageOptions, 'priority'> = {},
): {
  url: string | null;
  loading: boolean;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = request ? JSON.stringify(request) : null;
  const { priority = 'normal' } = options;

  useEffect(() => {
    if (!key) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let retained = false;
    let cancelled = false;
    const controller = new AbortController();
    // La richiesta è cambiata: l'indirizzo di prima sta per essere rilasciato,
    // e lasciarlo disegnato mostrerebbe il riquadro dell'immagine rotta al
    // posto del segnaposto finché la nuova non arriva.
    setUrl(null);
    setLoading(true);

    const load = async () => {
      try {
        const remembered = retainedImages.get(key);
        if (remembered) {
          remembered.users += 1;
          remembered.touchedAt = Date.now();
          retained = true;
          setUrl(remembered.url);
          return;
        }
        const bytes = await cachedImage(JSON.parse(key) as CacheRequest, {
          priority,
          signal: controller.signal,
        });
        if (cancelled) return;
        const objectUrl = retain(key, bytes);
        retained = true;
        setUrl(objectUrl);
      } catch {
        // Una copertina che non arriva non è un errore da mostrare: al suo
        // posto resta il segnaposto, come per un'opera che non ne ha.
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
      controller.abort();
      if (retained) release(key);
    };
  }, [key, priority]);

  return { url, loading };
}
