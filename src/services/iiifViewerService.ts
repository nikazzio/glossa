import { invoke } from '@tauri-apps/api/core';
import { cachedImage } from './cacheService';
import { execute, select } from './dbService';

/**
 * Il ponte controllato del visore: la finestra non contatta mai da sola il
 * server di una biblioteca. Ogni indirizzo (manifesto, `info.json`, tassello)
 * passa dallo stesso ponte già in uso per copertine e miniature
 * (`cachedImage`, `kind: "remote"`) — stessa cortesia, stessa cache, nessun
 * indirizzo aggiunto alla politica di sicurezza della finestra.
 *
 * Il parsing del manifesto resta nel motore (`iiif_viewer_pages`): è la
 * stessa lettura IIIF 2/3 che usa lo scaricamento, non una seconda da tenere
 * allineata a mano.
 */

export interface ViewerPage {
  index: number;
  label: string | null;
  imageService: string;
  width: number | null;
  height: number | null;
  canvasId: string | null;
}

export interface ViewerManifest {
  pages: ViewerPage[];
  homepage: string | null;
  rights: string | null;
  attribution: string | null;
  presentation2: boolean;
}

/** Scarica (o rilegge dalla cache) il manifesto e lo normalizza in pagine. */
export async function fetchViewerManifest(
  manifestUrl: string,
  providerKey: string | null,
): Promise<ViewerManifest> {
  const bytes = await cachedImage(
    { kind: 'remote', url: manifestUrl, providerKey },
    { priority: 'high' },
  );
  return invoke<ViewerManifest>('iiif_viewer_pages', { bytes: Array.from(bytes) });
}

/** Indirizzo di una miniatura secondo la Image API: identico per 2.x e 3.0,
 *  finché si chiede solo la larghezza e non la dimensione piena nativa. */
export function pageThumbnailUrl(imageService: string, width: number): string {
  return `${imageService}/full/${width},/0/default.jpg`;
}

/** Indirizzo dell'`info.json` del servizio immagini di una pagina: da qui
 *  OpenSeadragon ricava da solo tasselli, livelli di zoom e dimensione reale. */
export function infoJsonUrl(imageService: string): string {
  return `${imageService}/info.json`;
}

/** I byte di un indirizzo IIIF (info.json o tassello), sempre dal ponte
 *  controllato — mai una richiesta diretta della finestra. */
export async function fetchIiifBytes(
  url: string,
  providerKey: string | null,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return cachedImage({ kind: 'remote', url, providerKey }, { priority: 'high', signal });
}

const LAST_PAGE_KEY_PREFIX = 'library_last_page:';

/** L'ultima pagina aperta di un'opera: riaprendola, il visore torna lì invece
 *  che a pagina uno. Stesso schema chiave/valore già in uso per le impostazioni
 *  della cache — niente tabella dedicata per un solo numero per opera. */
export async function getLastViewedPage(sourceId: string): Promise<number | null> {
  const rows = await select<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [`${LAST_PAGE_KEY_PREFIX}${sourceId}`],
  );
  const stored = Number(rows[0]?.value);
  return Number.isInteger(stored) && stored >= 0 ? stored : null;
}

export async function setLastViewedPage(sourceId: string, index: number): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [`${LAST_PAGE_KEY_PREFIX}${sourceId}`, String(index)],
  );
}
