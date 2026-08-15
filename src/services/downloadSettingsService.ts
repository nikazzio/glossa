import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';

/**
 * La politica di scaricamento (#422) e i profili di rete delle biblioteche
 * (#421). Decisioni D4, D11 e D18.
 *
 * Due livelli di scelta e tre di precedenza: **fonte → biblioteca → globale**
 * per la risoluzione, **modifica dell'utente → registro → profilo prudente**
 * per il modo di stare al tavolo di una biblioteca.
 *
 * Il backend riporta comunque i valori dentro i limiti prima di usarli: qui i
 * limiti servono a non proporre scelte che verrebbero corrette dopo.
 */

const SIZE_CAP_KEY = 'download_size_cap';
const THUMBNAIL_EDGE_KEY = 'thumbnail_long_edge';

/** La politica «massima»: nessun tetto, la dimensione piena del servizio. */
export const MAX_SIZE_CAP = 'max';

/** I tetti fra cui si sceglie, in pixel sul lato lungo, più «massima». */
export const SIZE_CAPS = ['1000', '1500', '2000', '3000', MAX_SIZE_CAP] as const;

export const DEFAULT_SIZE_CAP = '2000';

/** Lati lunghi fra cui scegliere per le miniature che ricaviamo noi. */
export const THUMBNAIL_EDGES = [200, 300, 400, 600] as const;

export const DEFAULT_THUMBNAIL_EDGE = 300;

/**
 * Il tetto non superabile sulle richieste insieme verso una biblioteca (D11):
 * dipende dal loro server, non dalla potenza del computer. Il backend lo
 * applica di nuovo dove i valori si usano — questo è solo il menu.
 */
export const MAX_HOST_CONCURRENCY = 4;

export interface NetworkProfile {
  pauseMinMs: number;
  pauseMaxMs: number;
  burstRequests: number;
  burstWindowSecs: number;
  cooldown403Secs: number;
  cooldown429Secs: number;
  hostConcurrency: number;
  maxAttempts: number;
  backoffBaseSecs: number;
  backoffCapSecs: number;
  connectTimeoutSecs: number;
  readTimeoutSecs: number;
  needsViewerWarmup: boolean;
}

export interface LibrarySettings {
  key: string;
  label: string;
  /** Falso per le voci aggiunte a mano su un host fuori dal registro. */
  inRegistry: boolean;
  /** Vero quando esiste una modifica dell'utente da poter annullare. */
  customised: boolean;
  sizeCap: string | null;
  profile: NetworkProfile;
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

/** Un tetto scritto nel database che non significa niente vale come assente. */
function knownSizeCap(value: string | null): string | null {
  return value !== null && (SIZE_CAPS as readonly string[]).includes(value) ? value : null;
}

export async function getGlobalSizeCap(): Promise<string> {
  return knownSizeCap(await readSetting(SIZE_CAP_KEY)) ?? DEFAULT_SIZE_CAP;
}

export async function setGlobalSizeCap(value: string): Promise<void> {
  await writeSetting(SIZE_CAP_KEY, knownSizeCap(value) ?? DEFAULT_SIZE_CAP);
}

export async function getThumbnailEdge(): Promise<number> {
  const raw = await readSetting(THUMBNAIL_EDGE_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return (THUMBNAIL_EDGES as readonly number[]).includes(parsed) ? parsed : DEFAULT_THUMBNAIL_EDGE;
}

export async function setThumbnailEdge(value: number): Promise<void> {
  const chosen = (THUMBNAIL_EDGES as readonly number[]).includes(value) ? value : DEFAULT_THUMBNAIL_EDGE;
  await writeSetting(THUMBNAIL_EDGE_KEY, String(chosen));
}

/**
 * Il profilo prudente, che vale per chi non ha voce nel registro. Lo dichiara
 * il backend: tenerlo anche qui vorrebbe dire due elenchi di valori destinati
 * a divergere.
 */
export async function cautiousNetworkProfile(): Promise<NetworkProfile> {
  return invoke<NetworkProfile>('cautious_network_profile');
}

export async function listLibrarySettings(): Promise<LibrarySettings[]> {
  const answer = await invoke<LibrarySettings[] | null>('list_library_settings');
  return Array.isArray(answer) ? answer : [];
}

/** Salva e restituisce l'elenco **come è stato davvero scritto**. */
export async function saveLibrarySettings(
  key: string,
  sizeCap: string | null,
  profile: NetworkProfile,
): Promise<LibrarySettings[]> {
  const answer = await invoke<LibrarySettings[] | null>('save_library_settings', {
    key,
    sizeCap,
    profile,
  });
  return Array.isArray(answer) ? answer : [];
}

/** Riporta una biblioteca ai valori compilati nell'applicazione. */
export async function resetLibrarySettings(key: string): Promise<LibrarySettings[]> {
  const answer = await invoke<LibrarySettings[] | null>('reset_library_settings', { key });
  return Array.isArray(answer) ? answer : [];
}

/** Il tetto scelto sulla singola fonte, quando c'è (D4). */
export async function getVersionSizeCap(versionId: string): Promise<string | null> {
  return knownSizeCap(await invoke<string | null>('get_version_size_cap', { versionId }));
}

export async function setVersionSizeCap(versionId: string, sizeCap: string | null): Promise<string | null> {
  return invoke<string | null>('set_version_size_cap', { versionId, sizeCap });
}
