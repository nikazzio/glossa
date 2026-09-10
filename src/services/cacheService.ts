import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';
import { createRequestScheduler, type RequestPriority } from './requestScheduler';
import { hostOf, useNetworkActivity } from './networkActivity';

/**
 * La cache di tutto quello che viene dalla rete: copertine, miniature remote e
 * risposte delle ricerche.
 *
 * Le immagini **non si chiedono più dalla finestra**. Due ragioni, entrambe
 * vere: la politica di sicurezza dell'applicazione non ammette immagini prese
 * da un indirizzo remoto — nell'app installata sono riquadri vuoti — e
 * quaranta copertine chieste dalla finestra sono quaranta richieste senza
 * pause verso una biblioteca che bandisce.
 *
 * Il motore le prende con le sue pause, le conserva e ne restituisce i byte.
 * Quello che sta qui **non è posseduto**: può sparire al prossimo giro di
 * scarto, e non è mai contato come scaricato.
 */

/** La misura che chiede la miniatura invece di un numero di pixel. */
export const THUMB_SIZE = 'thumb';

export type CacheRequest =
  | { kind: 'remote'; url: string; providerKey?: string | null }
  /**
   * Una pagina di un'opera, a una misura.
   *
   * È la forma con cui il visore chiede tutto. Il motore guarda **prima sul
   * computer** — la pagina a quella misura, la miniatura salvata, una copia più
   * grande da rimpicciolire — e va a `remoteUrl` solo se in casa non c'è niente.
   */
  | {
      kind: 'page';
      versionId: string;
      index: number;
      size: string;
      remoteUrl?: string | null;
      providerKey?: string | null;
    }
  | {
      kind: 'search';
      providerKey: string;
      query: string;
      page: number;
      filters?: Record<string, string>;
    };

export interface CacheUsage {
  bytes: number;
  files: number;
}

/** Tetto predefinito: 512 MB. */
export const DEFAULT_CACHE_MAX_BYTES = 512 * 1024 * 1024;
/** Scadenza predefinita delle ricerche, in ore. */
export const DEFAULT_SEARCH_TTL_HOURS = 24;

const MAX_BYTES_KEY = 'cache_max_bytes';
const SEARCH_TTL_KEY = 'search_cache_ttl_hours';

/** Le scelte offerte, in byte: sotto i 128 MB non serve a niente. */
export const CACHE_CAPS = [
  128 * 1024 * 1024,
  256 * 1024 * 1024,
  512 * 1024 * 1024,
  1024 * 1024 * 1024,
  2048 * 1024 * 1024,
] as const;

export const SEARCH_TTLS = [1, 6, 24, 72, 168] as const;

export interface CachedImageOptions {
  priority?: RequestPriority;
  signal?: AbortSignal;
}

// Un rapido scorrimento non deve trasformarsi in centinaia di invoke ormai
// invisibili. Sei richieste bastano a riempire le corsie native senza creare
// una seconda coda incontrollata nella webview.
//
// Quattro posti sono riservati alla pagina aperta, e non è generosità: verso
// una biblioteca severa il motore ne concede due per volta, quindi ogni
// miniatura in più in volo è una miniatura **davanti** a un tassello nella coda
// del motore, dove la priorità non arriva. Due miniature alla volta bastano a
// riempire il rail e lasciano la corsia libera per la pagina che si guarda.
const remoteImageScheduler = createRequestScheduler(6, 4);

/**
 * Le richieste identiche ancora in volo, per non farne partire due.
 *
 * Succede continuamente: il rail rimonta una riga, si torna su una pagina già
 * vista, e in sviluppo React fa partire ogni effetto due volte. Due richieste
 * gemelle **mancano entrambe** la cache — la prima non ha ancora finito di
 * scriverla — e vanno entrambe in rete. Chi arriva secondo aspetta la prima.
 */
const inFlight = new Map<string, Promise<Uint8Array>>();

export async function cachedImage(request: CacheRequest, options: CachedImageOptions = {}): Promise<Uint8Array> {
  // Il motore risponde con byte grezzi, non con un elenco di numeri: un
  // vettore che attraversa il ponte in JSON pesa tre o quattro volte i byte
  // che trasporta.
  const load = async () => new Uint8Array(await invoke<ArrayBuffer>('cached_image', { request }));
  // Le ricerche non sono immagini: non passano dalla corsia del visore.
  if (request.kind === 'search') return load();

  // Una richiesta remota può finire nel deposito o in cache senza toccare la
  // rete: si conta lo stesso, perché è comunque il tempo che l'utente aspetta.
  const priority = options.priority ?? 'normal';
  const host = request.kind === 'remote' ? request.url : (request.remoteUrl ?? '');
  useNetworkActivity.getState().queue(priority);
  let started = false;
  const watched = async () => {
    started = true;
    useNetworkActivity.getState().start(priority, hostOf(host));
    try {
      const bytes = await load();
      useNetworkActivity.getState().succeed(priority);
      return bytes;
    } catch (error) {
      useNetworkActivity
        .getState()
        .fail(priority, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
  const key = JSON.stringify(request);
  const shared = inFlight.get(key);
  if (shared) {
    useNetworkActivity.getState().drop(priority);
    try {
      // I byte sono gli stessi, ma ognuno deve poterli tenere per sé: una
      // vista che li rilascia non deve svuotare quelli di un'altra.
      return new Uint8Array(await shared);
    } catch (error) {
      // Chi l'aveva chiesta per primo se n'è andato prima che partisse: la
      // richiesta è sua, l'annullamento no. Si rifà per conto proprio.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
      return cachedImage(request, options);
    }
  }

  const running = remoteImageScheduler
    .schedule(watched, options)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, running);
  try {
    return await running;
  } catch (error) {
    // Annullata mentre era ancora in coda: il posto va restituito qui, perché
    // `watched` non è mai partita e nessuno l'ha già tolto.
    if (!started) useNetworkActivity.getState().drop(priority);
    throw error;
  }
}

/** Cosa sa il motore della rete verso le biblioteche, in questo momento. */
export interface HostActivity {
  host: string;
  inUse: number;
  seats: number;
  bulkInUse: number;
  windowUsed: number;
  windowLimit: number;
  windowSecs: number;
  cooldownSecs: number;
}

export interface NetworkProbe {
  hosts: HostActivity[];
  served: {
    fromVault: number;
    fromCache: number;
    fromNetwork: number;
    networkBytes: number;
  };
}

export async function networkProbe(): Promise<NetworkProbe> {
  return invoke<NetworkProbe>('network_probe');
}

/** Dove è stata trovata l'immagine: il deposito sul computer, la memoria di
 *  lavoro, oppure la biblioteca. */
export type ImageSource = 'vault' | 'cache' | 'network';

/**
 * Da dove è arrivata l'immagine chiesta così, subito dopo averla ricevuta.
 *
 * I byte attraversano il ponte grezzi, senza un posto dove infilare anche
 * questo: si chiede a parte. È una lettura in memoria del motore — niente disco,
 * niente rete — e la risposta riguarda la stessa richiesta, quindi non può
 * raccontare la provenienza di un'altra immagine. `null` quando il motore non se
 * lo ricorda più.
 */
export async function imageSource(request: CacheRequest): Promise<ImageSource | null> {
  const source = await invoke<string | null>('image_source', { request });
  return source === 'vault' || source === 'cache' || source === 'network' ? source : null;
}

export async function keepViewerPage(request: CacheRequest): Promise<boolean> {
  if (request.kind !== 'page' || request.size === THUMB_SIZE) return false;
  return invoke<boolean>('keep_viewer_page', { request });
}

export async function cacheUsage(): Promise<CacheUsage> {
  return invoke<CacheUsage>('cache_usage');
}

export async function clearCache(): Promise<void> {
  await invoke('clear_cache');
}

/**
 * Butta dalla memoria di lavoro tutto quello che riguarda una digitalizzazione,
 * e dice quanti byte ha liberato.
 *
 * Si chiama togliendo un'opera dalla Biblioteca, ed è l'unico momento in cui
 * buttare è giusto: tutto il resto sono scansioni di libri storici, che non
 * cambiano. Senza questo passo lo spazio non si libera come chi rimuove si
 * aspetta, e riaggiungendo la stessa opera le pagine tornerebbero da qui senza
 * che la biblioteca venga ricontattata.
 */
export async function forgetVersionCache(versionId: string): Promise<number> {
  return invoke<number>('forget_version_cache', { versionId });
}

/**
 * Applica il tetto **adesso** e restituisce quanto resta occupato: dopo averlo
 * abbassato, aspettare che entri qualcosa di nuovo non è quello che chi lo
 * abbassa si aspetta.
 */
export async function applyCacheCap(): Promise<CacheUsage> {
  return invoke<CacheUsage>('apply_cache_cap');
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/** Gli stessi estremi che applica il motore: 32 MB - 32 GB. */
const MIN_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_MAX_BYTES = 32 * 1024 * 1024 * 1024;
/** Le stesse ore che accetta il motore. */
const MIN_SEARCH_TTL_HOURS = 1;
const MAX_SEARCH_TTL_HOURS = 24 * 30;

/**
 * Solo i valori che il motore applica davvero.
 *
 * Gli estremi sono i suoi, non quelli dell'elenco: un valore fuori elenco ma
 * valido resta quello che è — mostrarne un altro direbbe una cosa falsa nella
 * direzione opposta — mentre un valore che il motore scarterebbe non va mostrato
 * come se fosse in vigore.
 */
export async function getCacheMaxBytes(): Promise<number> {
  const stored = Number(await readSetting(MAX_BYTES_KEY));
  return Number.isFinite(stored) && stored >= MIN_CACHE_MAX_BYTES && stored <= MAX_CACHE_MAX_BYTES
    ? stored
    : DEFAULT_CACHE_MAX_BYTES;
}

export async function setCacheMaxBytes(bytes: number): Promise<void> {
  await writeSetting(MAX_BYTES_KEY, String(bytes));
}

export async function getSearchTtlHours(): Promise<number> {
  const stored = Number(await readSetting(SEARCH_TTL_KEY));
  return Number.isFinite(stored) && stored >= MIN_SEARCH_TTL_HOURS && stored <= MAX_SEARCH_TTL_HOURS
    ? stored
    : DEFAULT_SEARCH_TTL_HOURS;
}

export async function setSearchTtlHours(hours: number): Promise<void> {
  await writeSetting(SEARCH_TTL_KEY, String(hours));
  // La scadenza scelta vale dalla prossima ricerca, non dal prossimo avvio: il
  // motore la tiene a memoria insieme al tetto, e va avvisato che non vale più.
  await invoke('forget_cache_settings');
}
