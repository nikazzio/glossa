/**
 * Le origini scritte nel file di log, raggruppate per area dell'applicazione.
 *
 * Il file elenca il modulo che ha scritto la riga (`glossa_lib::iiif::search::vatican`,
 * `federation`, `webview`): utile a chi legge il codice, illeggibile come
 * filtro. Qui i moduli diventano le quattro aree che l'utente conosce, più le
 * librerie di terze parti, che non sono un'area ma tutto il resto.
 */
export const LOG_AREAS = {
  library: [
    'federation',
    'glossa_lib::iiif',
    'glossa_lib::download',
    'glossa_lib::vault',
    'glossa_lib::images',
    'glossa_lib::httpcache',
    'glossa_lib::optimize',
  ],
  translation: [
    'glossa_lib::llm',
    'glossa_lib::deepl',
    'glossa_lib::vector',
    'glossa_lib::documents',
  ],
  jobs: ['glossa_lib::jobs'],
  interface: ['webview'],
} as const;

export type LogArea = keyof typeof LOG_AREAS;

/** `dependencies` non sta in `LOG_AREAS`: non è un prefisso, è «tutto ciò che
 *  non viene dal programma», e il backend lo tratta con un interruttore suo. */
export const LOG_FILTER_KEYS = [...(Object.keys(LOG_AREAS) as LogArea[]), 'dependencies'] as const;
export type LogFilterKey = (typeof LOG_FILTER_KEYS)[number];

/** I prefissi da chiedere al backend per le aree selezionate. `null` quando
 *  ci sono tutte: evita di spedire una lista che sarebbe da aggiornare a ogni
 *  modulo nuovo. */
export function prefixesFor(selected: Set<LogFilterKey>): string[] | null {
  const areas = (Object.keys(LOG_AREAS) as LogArea[]).filter((area) => selected.has(area));
  if (areas.length === Object.keys(LOG_AREAS).length) return null;
  return areas.flatMap((area) => [...LOG_AREAS[area]]);
}

/** L'area di una riga, per scriverla accanto al messaggio. */
export function areaOf(target: string): LogArea | 'dependencies' {
  for (const [area, prefixes] of Object.entries(LOG_AREAS) as [LogArea, readonly string[]][]) {
    if (prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}::`))) return area;
  }
  return 'dependencies';
}
