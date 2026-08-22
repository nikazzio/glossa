import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';

/** Impostazioni per dimensioni delle immagini e profili di rete. */

const SIZE_CAP_KEY = 'download_size_cap';
const THUMBNAIL_EDGE_KEY = 'thumbnail_long_edge';

/** La politica «massima»: nessun tetto, la dimensione piena del servizio. */
export const MAX_SIZE_CAP = 'max';

/** Le misure fra cui si sceglie, in pixel sul lato lungo, più «massima». */
export const SIZE_CAPS = ['1000', '1500', '2000', '3000', MAX_SIZE_CAP] as const;

export const DEFAULT_SIZE_CAP = '2000';

/** Lati lunghi fra cui scegliere per le miniature che ricaviamo noi. */
export const THUMBNAIL_EDGES = [200, 300, 400, 600] as const;

export const DEFAULT_THUMBNAIL_EDGE = 300;

/**
 * Il tetto non superabile sulle richieste insieme verso una biblioteca:
 * dipende dal loro server, non dalla potenza del computer. Il backend lo
 * applica di nuovo dove i valori si usano — questo è solo il menu.
 */
export const MAX_HOST_CONCURRENCY = 4;

export interface NetworkValues {
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

export interface NetworkProfile {
  id: string;
  name: string;
  /** I profili che nascono con l'applicazione: si modificano, non si eliminano. */
  builtin: boolean;
  values: NetworkValues;
  /** Quante biblioteche lo usano. */
  usedBy: number;
}

export interface LibraryChoice {
  key: string;
  label: string;
  profileId: string;
}

export interface NetworkSettings {
  profiles: NetworkProfile[];
  libraries: LibraryChoice[];
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

/** Una misura scritta nel database che non è fra le scelte vale come assente. */
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

const emptySettings: NetworkSettings = { profiles: [], libraries: [] };

/**
 * Quello che arriva dal backend, controllato prima di usarlo: la schermata
 * scorre entrambi gli elenchi, e uno solo dei due mancante la farebbe cadere.
 */
function asSettings(answer: NetworkSettings | null): NetworkSettings {
  if (!answer) return emptySettings;
  return {
    profiles: Array.isArray(answer.profiles) ? answer.profiles : [],
    libraries: Array.isArray(answer.libraries) ? answer.libraries : [],
  };
}

export async function listNetworkSettings(): Promise<NetworkSettings> {
  return asSettings(await invoke<NetworkSettings | null>('list_network_settings'));
}

/**
 * Salva un profilo, nuovo o esistente, e restituisce lo stato **come è stato
 * davvero scritto**: un valore riportato dentro i limiti si vede subito.
 */
export async function saveNetworkProfile(profile: {
  id: string | null;
  name: string;
  values: NetworkValues;
}): Promise<NetworkSettings> {
  return asSettings(await invoke<NetworkSettings | null>('save_network_profile', { profile }));
}

export async function deleteNetworkProfile(id: string): Promise<NetworkSettings> {
  return asSettings(await invoke<NetworkSettings | null>('delete_network_profile', { id }));
}

export async function setLibraryProfile(libraryKey: string, profileId: string): Promise<NetworkSettings> {
  return asSettings(
    await invoke<NetworkSettings | null>('set_library_network_profile', { libraryKey, profileId }),
  );
}

/** La misura scelta per la singola opera, quando c'è. */
export async function getVersionSizeCap(versionId: string): Promise<string | null> {
  return knownSizeCap(await invoke<string | null>('get_version_size_cap', { versionId }));
}

export async function setVersionSizeCap(versionId: string, sizeCap: string | null): Promise<string | null> {
  return invoke<string | null>('set_version_size_cap', { versionId, sizeCap });
}
