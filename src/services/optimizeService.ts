import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';
import type { Job } from './jobsService';

/**
 * L'ottimizzazione locale delle immagini (piano §5.7): rilegge le pagine di una
 * cartella di misura già scaricata, le rimpicciolisce al lato lungo scelto e le
 * ricomprime, sostituendo l'originale.
 *
 * È **irreversibile** e perde informazione: la si chiede, non parte mai da sé.
 * Lavora su una cartella di misura per volta, così le pagine prese a risoluzione
 * piena di proposito non vengono schiacciate da un'ottimizzazione che puntava ad
 * altro.
 */

export interface OptimizeEstimate {
  pages: number;
  bytes: number;
  longEdge: number;
  quality: number;
}

export const DEFAULT_OPTIMIZE_LONG_EDGE = 2000;
export const DEFAULT_OPTIMIZE_QUALITY = 82;

/** Le scelte offerte per il lato lungo di arrivo. */
export const OPTIMIZE_LONG_EDGES = [1000, 1500, 2000, 3000, 4000] as const;
/** Le scelte offerte per la qualità JPEG. */
export const OPTIMIZE_QUALITIES = [60, 70, 82, 90] as const;

const LONG_EDGE_KEY = 'optimize_long_edge';
const QUALITY_KEY = 'optimize_jpeg_quality';

/** Gli stessi estremi che applica il motore. */
const MIN_LONG_EDGE = 512;
const MAX_LONG_EDGE = 12_000;
const MIN_QUALITY = 40;
const MAX_QUALITY = 100;

export async function optimizeEstimate(versionId: string, sizeTag: string): Promise<OptimizeEstimate> {
  return invoke<OptimizeEstimate>('optimize_estimate', { versionId, sizeTag });
}

export async function enqueueOptimization(
  versionId: string,
  sizeTag: string,
  longEdge?: number,
  quality?: number,
): Promise<Job> {
  return invoke<Job>('enqueue_optimization', { versionId, sizeTag, longEdge, quality });
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

export async function getOptimizeLongEdge(): Promise<number> {
  return readNumber(LONG_EDGE_KEY, DEFAULT_OPTIMIZE_LONG_EDGE, MIN_LONG_EDGE, MAX_LONG_EDGE);
}

export async function setOptimizeLongEdge(value: number): Promise<void> {
  await writeNumber(LONG_EDGE_KEY, value);
}

export async function getOptimizeQuality(): Promise<number> {
  return readNumber(QUALITY_KEY, DEFAULT_OPTIMIZE_QUALITY, MIN_QUALITY, MAX_QUALITY);
}

export async function setOptimizeQuality(value: number): Promise<void> {
  await writeNumber(QUALITY_KEY, value);
}
