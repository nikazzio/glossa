/**
 * Misure e classi condivise dalle colonne a schede (scheda opera in Biblioteca,
 * Studio di trascrizione): stessa colonna, stessi margini. La didascalia è lo
 * stile `caption-label` del foglio di stile.
 */

/** Il corpo di una scheda della colonna: le sezioni si susseguono con questo passo. */
export const PANEL_BODY_CLASSNAME = 'flex flex-col gap-6 px-4 py-5';

/** Elenco etichetta–valore dentro una sezione. */
export const STAT_LIST_CLASSNAME = 'space-y-2.5';

/** Elenco di impostazioni subito sotto il titolo di una `PanelSection`: il
 *  filetto del titolo fa già da bordo superiore, un secondo bordo lo
 *  raddoppierebbe. */
export const SECTION_SETTING_LIST_CLASSNAME = 'divide-y divide-rule border-b border-rule';

/** Larghezze della colonna a schede, in pixel. */
export const INSPECTOR_WIDTH = {
  collapsed: 56,
  min: 320,
  max: 560,
  initial: 400,
} as const;

/** La larghezza ricordata, riportata dentro i limiti della colonna. */
export function clampInspectorWidth(width: number): number {
  return Math.min(Math.max(width || INSPECTOR_WIDTH.initial, INSPECTOR_WIDTH.min), INSPECTOR_WIDTH.max);
}
