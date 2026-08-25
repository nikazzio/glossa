import type { IconButtonTone } from '../ui';

/** Tono icona per stato fase pipeline — condiviso fra la vista documento e la
 * riga di stato nella rail sinistra. */
export const STAGE_TONE_MAP: Record<string, IconButtonTone> = {
  completed: 'success',
  processing: 'running',
  retrying: 'running',
  error: 'danger',
  idle: 'muted',
};
