import { invoke } from '@tauri-apps/api/core';
import { cachedImage } from './cacheService';
import { execute, select } from './dbService';

/**
 * Il ponte controllato del visore: la finestra non contatta mai da sola il
 * server di una biblioteca. Ogni immagine passa dal motore — stessa cortesia,
 * stessa cache, nessun indirizzo aggiunto alla politica di sicurezza.
 *
 * **Una regola sola: prima quello che c'è sul computer.** Ogni pagina e ogni
 * miniatura si chiedono per numero di pagina, non per indirizzo; l'indirizzo
 * remoto viaggia insieme alla richiesta ed è il ripiego di quando in casa non
 * c'è niente. È il comportamento di Scriptoria, dove un libro scaricato si
 * sfoglia senza toccare la rete.
 */

export interface ViewerPage {
  index: number;
  label: string | null;
  imageService: string;
  width: number | null;
  height: number | null;
  canvasId: string | null;
  /** La miniatura già pronta dichiarata dalla biblioteca, quando c'è. */
  thumbnail: string | null;
}

export interface ViewerManifest {
  pages: ViewerPage[];
  homepage: string | null;
  rights: string | null;
  attribution: string | null;
  presentation2: boolean;
}

/**
 * Il manifesto, già letto in pagine.
 *
 * Lo prende e lo legge il motore, in un passaggio solo: il manifesto di un libro
 * di ottocento pagine pesa megabyte, e portarlo qui per rimandarlo indietro da
 * leggere era buona parte dell'attesa all'apertura su Internet Archive.
 */
export async function fetchViewerManifest(
  manifestUrl: string,
  providerKey: string | null,
): Promise<ViewerManifest> {
  return invoke<ViewerManifest>('iiif_viewer_manifest', {
    url: manifestUrl,
    providerKey,
  });
}

/**
 * Dove chiedere la miniatura di una pagina **se non ce l'abbiamo**.
 *
 * Prima quella che la biblioteca dichiara: è già pronta sul loro server. Solo se
 * non la dichiara si costruisce una misura piccola, che su alcune biblioteche
 * costa quanto la pagina intera perché la ricavano al momento.
 */
export function pageThumbnailUrl(page: ViewerPage, width: number): string {
  return page.thumbnail ?? `${page.imageService}/full/${width},/0/default.jpg`;
}

/** Indirizzo dell'`info.json` del servizio immagini di una pagina: da qui
 *  OpenSeadragon ricava da solo tasselli, livelli di zoom e dimensione reale. */
export function infoJsonUrl(imageService: string): string {
  return `${imageService}/info.json`;
}

/**
 * Larghezza della pagina intera chiesta quando i tasselli non funzionano.
 *
 * Non è la dimensione piena: quella su un manoscritto è di parecchi megabyte e
 * ci si aspetta un ripiego rapido, non un secondo scaricamento.
 */
export const WHOLE_PAGE_WIDTH_PX = 1600;

/**
 * Indirizzo della pagina **intera**, il ripiego di quando lo zoom a tasselli
 * non è servibile.
 *
 * Alcuni servizi dichiarano un `info.json` che promette tasselli e poi rifiuta
 * le regioni chieste. È la stessa scelta di Scriptoria, che prova le immagini
 * intere prima di ricucire i tasselli: una pagina che si vede vale più di uno
 * zoom che non arriva.
 */
export function wholePageUrl(imageService: string, width = WHOLE_PAGE_WIDTH_PX): string {
  return `${imageService}/full/${width},/0/default.jpg`;
}

/** La misura che significa «la più grande che c'è», come la chiama il deposito. */
export const MAX_SIZE = 'max';

/**
 * Dove chiedere alla biblioteca la pagina **alla misura di una cartella del
 * deposito**.
 *
 * Serve per i libri scaricati a metà: la pagina che manca deve arrivare della
 * stessa misura delle sue vicine, altrimenti finisce in cache sotto un nome che
 * promette una risoluzione che non ha. La dimensione piena si chiama `max`
 * dalla Image API 3.0 e `full` prima: chiederla alla maniera nuova a un
 * servizio vecchio fa rispondere 400.
 */
export function pageSourceUrl(
  imageService: string,
  sizeTag: string,
  presentation2: boolean,
): string {
  if (sizeTag === MAX_SIZE) {
    return `${imageService}/full/${presentation2 ? 'full' : 'max'}/0/default.jpg`;
  }
  const width = Number(sizeTag);
  return wholePageUrl(imageService, Number.isFinite(width) && width > 0 ? width : WHOLE_PAGE_WIDTH_PX);
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
