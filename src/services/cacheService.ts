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

export type CacheRequest =
  | { kind: 'remote'; url: string; providerKey?: string | null }
  | { kind: 'page'; versionId: string; index: number; size: string }
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
// una seconda coda incontrollata nella webview; due posti restano ai tasselli
// della pagina aperta, che altrimenti aspetterebbero dietro alle miniature.
const remoteImageScheduler = createRequestScheduler(6, 2);

export async function cachedImage(request: CacheRequest, options: CachedImageOptions = {}): Promise<Uint8Array> {
  // Il motore risponde con i byte grezzi: l'annotazione dice quello che il
  // ponte dichiara, non quello che arriva davvero.
  const load = async () => {
    const bytes = await invoke<number[]>('cached_image', { request });
    return new Uint8Array(bytes);
  };
  if (request.kind !== 'remote') return load();

  // Una richiesta remota può finire nel deposito o in cache senza toccare la
  // rete: si conta lo stesso, perché è comunque il tempo che l'utente aspetta.
  const activity = useNetworkActivity.getState();
  activity.queue();
  const watched = async () => {
    useNetworkActivity.getState().start(hostOf(request.url));
    try {
      const bytes = await load();
      useNetworkActivity.getState().succeed(bytes.byteLength);
      return bytes;
    } catch (error) {
      useNetworkActivity
        .getState()
        .fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
  try {
    return await remoteImageScheduler.schedule(watched, options);
  } catch (error) {
    // Annullata mentre era ancora in coda: `watched` non è mai partita, quindi
    // il posto in coda va restituito qui.
    if (error instanceof DOMException && error.name === 'AbortError') {
      useNetworkActivity.setState((state) => ({ queued: Math.max(0, state.queued - 1) }));
    }
    throw error;
  }
}

export async function cacheUsage(): Promise<CacheUsage> {
  return invoke<CacheUsage>('cache_usage');
}

export async function clearCache(): Promise<void> {
  await invoke('clear_cache');
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
}
