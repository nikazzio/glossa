/**
 * Classi condivise dai cataloghi (Biblioteca, Trascrizioni): stesso aspetto
 * degli stessi gesti in ogni elenco.
 */

/** Comandi di riga che compaiono al passaggio o col fuoco: opacità, non
 *  `display`, così il tabulatore li raggiunge e il fuoco li mostra. */
export const ROW_REVEAL_CLASSNAME =
  'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100';

/** Un filtro rapido con un valore scelto: il bordo verde dice che restringe. */
export const ACTIVE_FILTER_CLASSNAME = 'border-editorial-accent text-editorial-accent';

/** Larghezza massima di una tendina fra i filtri rapidi. */
export const QUICK_FILTER_CLASSNAME = 'max-w-[11rem]';

/** Griglia delle copertine: tutte della stessa misura, a stringersi è il titolo. */
export const CATALOG_GRID_CLASSNAME = 'grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3 py-4';

/** Elenco a righe separate da un filetto. */
export const CATALOG_LIST_CLASSNAME = 'flex flex-col divide-y divide-rule py-2';

/** Intestazione di un gruppo dell'elenco, ferma in cima mentre si scorre. Il
 *  fondo lo mette chi la usa: è la carta della sua area. */
export const CATALOG_GROUP_HEADER_CLASSNAME =
  'sticky top-0 z-10 flex items-baseline gap-2 border-b border-editorial-border py-2 font-display text-lg italic text-editorial-ink';

/** Filetto verticale fra gruppi di comandi sulla stessa riga. */
export const COMMAND_DIVIDER_CLASSNAME = 'h-4 w-px shrink-0 bg-editorial-border';
