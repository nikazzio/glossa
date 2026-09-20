import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';
import type { Job } from './jobsService';

/**
 * La ricompressione locale delle immagini: rilegge le pagine della copia e le
 * riscrive a una qualità più bassa **senza toccarne i pixel**, per liberare
 * spazio quando la misura va bene e il peso no.
 *
 * Non è reversibile: l'originale non resta da nessuna parte, e per riavere la
 * qualità di prima si riscarica dalla biblioteca. Non parte mai da sé.
 */

export const DEFAULT_OPTIMIZE_QUALITY = 82;

/** Le scelte offerte per la qualità JPEG. */
export const OPTIMIZE_QUALITIES = [60, 70, 82, 90] as const;

const QUALITY_KEY = 'optimize_jpeg_quality';

/** Gli stessi estremi che applica il motore. */
const MIN_QUALITY = 40;
const MAX_QUALITY = 100;

export async function enqueueOptimization(
  versionId: string,
  sizeTag: string,
  quality?: number,
): Promise<Job> {
  return invoke<Job>('enqueue_optimization', { versionId, sizeTag, quality });
}

async function readNumber(key: string, fallback: number, min: number, max: number): Promise<number> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  const stored = Number(rows[0]?.value);
  return Number.isFinite(stored) && stored >= min && stored <= max ? stored : fallback;
}

async function writeNumber(key: string, value: number): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)],
  );
}



export async function getOptimizeQuality(): Promise<number> {
  return readNumber(QUALITY_KEY, DEFAULT_OPTIMIZE_QUALITY, MIN_QUALITY, MAX_QUALITY);
}

export async function setOptimizeQuality(value: number): Promise<void> {
  await writeNumber(QUALITY_KEY, value);
}
