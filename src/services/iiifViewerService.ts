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
  /** Misure già pronte incluse direttamente nell'indice del libro. */
  readySizes?: Array<[width: number, height: number]>;
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
  versionId: string | null = null,
): Promise<ViewerManifest> {
  return invoke<ViewerManifest>('iiif_viewer_manifest', {
    url: manifestUrl,
    providerKey,
    versionId,
  });
}

/**
 * Larghezza della pagina intera chiesta quando i tasselli non funzionano.
 *
 * Non è la dimensione piena: quella su un manoscritto è di parecchi megabyte e
 * ci si aspetta un ripiego rapido, non un secondo scaricamento.
 */
export const WHOLE_PAGE_WIDTH_PX = 1600;

/**
 * Dove chiedere la miniatura di una pagina **se non ce l'abbiamo**.
 *
 * Prima quella che la biblioteca dichiara: è già pronta sul loro server. Se non
 * la dichiara si chiede il dimezzamento più vicino alla misura voluta, non la
 * misura esatta: una misura tonda la costruiscono al momento, e per una
 * miniatura costa quanto costruire la pagina intera.
 */
export function pageThumbnailUrl(page: ViewerPage, width: number): string {
  if (page.thumbnail) return page.thumbnail;
  return `${page.imageService}/full/${preferredPageWidth(page, width)},/0/default.jpg`;
}

/**
 * Prima usa una misura pronta già contenuta nell'indice del libro. Leggere una
 * scheda separata prima di mostrare la pagina aggiungerebbe attesa proprio sul
 * percorso più importante. Se l'indice non porta l'elenco, resta il
 * dimezzamento misurato sul campo; senza dimensioni, la misura fissa.
 */
export function preferredPageWidth(page: ViewerPage, target = WHOLE_PAGE_WIDTH_PX): number {
  const sizes = (page.readySizes ?? [])
    .filter(([width, height]) => width > 0 && height > 0)
    .map(([width, height]) => ({ width, longEdge: Math.max(width, height) }))
    .sort((left, right) => left.longEdge - right.longEdge);
  const ready = sizes.find((size) => size.longEdge >= target) ?? sizes.at(-1);
  return ready?.width ?? readablePageWidth(page, target);
}

/**
 * La larghezza da chiedere per vedere questa pagina.
 *
 * **Non** un numero fisso: un dimezzamento successivo della pagina originale.
 * Le biblioteche tengono pronti proprio i dimezzamenti; qualunque altra misura
 * la costruiscono al momento. Misurato sul campo: 2,3 secondi per una misura
 * già pronta contro 26,6 per una generata sul momento.
 *
 * Si prende **il più piccolo che non scenda sotto** la misura voluta: scendere
 * sotto risparmierebbe qualche byte e lascerebbe l'immagine sgranata nello
 * spazio che deve riempire.
 *
 * Senza le dimensioni dichiarate dal manifesto non c'è niente da dimezzare, e
 * si chiede la misura voluta.
 */
export function readablePageWidth(page: ViewerPage, target = WHOLE_PAGE_WIDTH_PX): number {
  const width = page.width ?? 0;
  const height = page.height ?? 0;
  const longEdge = Math.max(width, height);
  if (width <= 0 || longEdge <= 0) return target;
  // Una pagina già più piccola di quella voluta si chiede com'è: ingrandirla
  // non aggiunge niente e costa una costruzione.
  if (longEdge <= target) return width;

  let divisor = 1;
  while (longEdge / (divisor * 2) >= target) divisor *= 2;
  return Math.max(1, Math.round(width / divisor));
}

/** Indirizzo dell'`info.json` del servizio immagini di una pagina: da qui
 *  OpenSeadragon ricava da solo tasselli, livelli di zoom e dimensione reale. */
export function infoJsonUrl(imageService: string): string {
  return `${imageService}/info.json`;
}


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
 * Biblioteche che ricavano l'immagine al momento in cui la si chiede, invece di
 * servirne una già pronta.
 *
 * Cambia due comportamenti del visore: l'indice va ritentato, e si avvisa chi
 * guarda che l'attesa è normale.
 *
 * Misurato il 4 settembre 2026 su Internet Archive, su un libro di 308 pagine.
 * L'indice fallisce alla prima richiesta dopo 60 secondi e arriva alla seconda
 * in 1,3 s. Le pagine invece falliscono **per singola coppia pagina+misura**:
 * la stessa richiesta ripetuta identica fallisce ancora (due volte su due),
 * mentre la stessa pagina a un'altra misura arriva in circa 3 secondi. Vale in
 * tutte le direzioni: la pagina 21 fallisce a 1312 e arriva a piena
 * risoluzione, la 42 fallisce a piena risoluzione e arriva chiedendo la sua
 * larghezza in numero. Non è la misura a essere sbagliata: è un loro
 * derivato guasto, e cambiare forma della richiesta lo aggira.
 */
const LIBRARIES_THAT_BUILD_ON_DEMAND: ReadonlySet<string> = new Set(['archive_org']);

export function buildsImagesOnDemand(providerKey: string | null): boolean {
  return providerKey !== null && LIBRARIES_THAT_BUILD_ON_DEMAND.has(providerKey);
}

/**
 * Le forme in cui chiedere la stessa pagina intera, in ordine, da provare una
 * dopo l'altra finché una risponde.
 *
 * Serve a due guasti diversi che si curano allo stesso modo:
 *
 * 1. i derivati guasti di chi ricava su richiesta (vedi sopra): cambiare forma
 *    aggira il singolo derivato che non arriva;
 * 2. la versione dell'Image API, che **non** si deduce da quella del
 *    manifesto: un manifesto Presentation 3 può indicare un servizio immagini
 *    Image API 2, dove `max` non esiste e la richiesta torna 400. La larghezza
 *    in numero è valida in entrambe le versioni, quindi chiude anche quel caso.
 *
 * Altrove si tenta una volta sola: un secondo tentativo lì raddoppierebbe
 * l'attesa di un guasto vero senza aggirare niente.
 *
 * La misura del deposito, quando c'è, non ammette ripieghi: una pagina che
 * arrivasse a un'altra misura finirebbe in cache sotto un nome che promette una
 * risoluzione che non ha.
 */
export function wholePageAttempts(
  page: ViewerPage,
  localSize: string | null,
  onDemand: boolean,
): string[] {
  if (localSize) return [localSize];
  const halved = String(preferredPageWidth(page));
  if (!onDemand) return [halved];
  const nativeWidth = page.width && page.width > 0 ? String(page.width) : null;
  return [MAX_SIZE, halved, nativeWidth]
    .filter((form): form is string => form !== null)
    .filter((form, index, all) => all.indexOf(form) === index);
}

/**
 * L'indice del libro, con **un solo nuovo tentativo** dove la biblioteca lo
 * costruisce al momento.
 *
 * Il primo tentativo fa partire la costruzione e scade prima che finisca; il
 * secondo trova il lavoro già fatto. Misurato: 60 secondi di attesa e un errore,
 * poi 1,3 secondi e l'indice. Altrove non si ritenta: raddoppierebbe l'attesa
 * di un indirizzo davvero rotto senza nessun guadagno.
 */
export async function fetchViewerManifestWithRetry(
  manifestUrl: string,
  providerKey: string | null,
  versionId: string | null = null,
): Promise<ViewerManifest> {
  try {
    return await fetchViewerManifest(manifestUrl, providerKey, versionId);
  } catch (error: unknown) {
    if (!buildsImagesOnDemand(providerKey)) throw error;
    return fetchViewerManifest(manifestUrl, providerKey, versionId);
  }
}

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
