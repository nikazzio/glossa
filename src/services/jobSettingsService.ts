import { execute, select } from './dbService';

/**
 * Le impostazioni dei lavori in background.
 *
 * I limiti dicono quanti lavori girano insieme **per classe di risorsa**: non
 * c'è un numero solo, perché saturano cose diverse. `0` significa automatico.
 */

export const RESOURCE_CLASSES = ['network', 'cpu', 'disk', 'languageService', 'documents'] as const;
export type ResourceClass = (typeof RESOURCE_CLASSES)[number];

const LIMIT_KEY: Record<ResourceClass, string> = {
  network: 'jobs_limit_network',
  cpu: 'jobs_limit_cpu',
  disk: 'jobs_limit_disk',
  languageService: 'jobs_limit_language_service',
  documents: 'jobs_limit_documents',
};

const AUTO_RESUME_KEY = 'auto_resume_downloads';

/**
 * Tetto non superabile sui lavori di rete: il limite verso una
 * biblioteca dipende dal loro server, non dalla potenza del computer. Non serve
 * a limitare l'utente, serve a non farlo bandire.
 */
export const NETWORK_LIMIT_CAP = 4;
const OTHER_LIMIT_CAP = 8;

export function limitCap(resource: ResourceClass): number {
  return resource === 'network' ? NETWORK_LIMIT_CAP : OTHER_LIMIT_CAP;
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

export type JobLimits = Record<ResourceClass, number>;

export async function getJobLimits(): Promise<JobLimits> {
  const entries = await Promise.all(
    RESOURCE_CLASSES.map(async (resource) => {
      const raw = await readSetting(LIMIT_KEY[resource]);
      const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
      const usable = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      // Il tetto vale anche in lettura: un valore piu' alto — da una versione
      // precedente o scritto a mano nel database — non comparirebbe fra le
      // scelte, e il menu mostrerebbe un valore che non esiste.
      return [resource, Math.min(usable, limitCap(resource))] as const;
    }),
  );
  return Object.fromEntries(entries) as JobLimits;
}

/** Il valore viene comunque riportato dentro i limiti prima di essere salvato. */
export async function setJobLimit(resource: ResourceClass, value: number): Promise<number> {
  const clamped = Math.max(0, Math.min(limitCap(resource), Math.round(value)));
  await writeSetting(LIMIT_KEY[resource], String(clamped));
  return clamped;
}

export async function getAutoResumeDownloads(): Promise<boolean> {
  return (await readSetting(AUTO_RESUME_KEY)) === '1';
}

export async function setAutoResumeDownloads(enabled: boolean): Promise<void> {
  await writeSetting(AUTO_RESUME_KEY, enabled ? '1' : '0');
}
