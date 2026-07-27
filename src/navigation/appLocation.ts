/**
 * Contratto di navigazione dello shell 2.0 (#210), definito in
 * `docs-dev/PRODUCT_ARCHITECTURE_2_0.md` §6: posizione, workspace operativo
 * e filtro workspace sono tre concetti distinti, mai dedotti l'uno
 * dall'altro. Nessuna variante ammette un fallback implicito — il default è
 * sempre `dashboardLocation()`, mai un'area o un oggetto "a caso".
 */
export type GlobalArea = 'library' | 'transcriptions' | 'translations' | 'analysis';

export type AppLocation =
  | { area: 'dashboard' }
  | { area: 'workspace'; workspaceId: string }
  | { area: 'library'; itemId?: string; workspaceFilter?: string }
  | { area: 'transcriptions'; documentId?: string; workspaceFilter?: string }
  | { area: 'translations'; projectId?: string; workspaceFilter?: string }
  | { area: 'analysis'; workspaceFilter?: string };

export const GLOBAL_AREAS: readonly GlobalArea[] = [
  'library',
  'transcriptions',
  'translations',
  'analysis',
];

export function dashboardLocation(): AppLocation {
  return { area: 'dashboard' };
}

export function workspaceLocation(workspaceId: string): AppLocation {
  return { area: 'workspace', workspaceId };
}

export function libraryLocation(opts?: { itemId?: string; workspaceFilter?: string }): AppLocation {
  return { area: 'library', ...opts };
}

export function transcriptionsLocation(opts?: { documentId?: string; workspaceFilter?: string }): AppLocation {
  return { area: 'transcriptions', ...opts };
}

export function translationsLocation(opts?: { projectId?: string; workspaceFilter?: string }): AppLocation {
  return { area: 'translations', ...opts };
}

export function analysisLocation(opts?: { workspaceFilter?: string }): AppLocation {
  return { area: 'analysis', ...opts };
}

export function isGlobalArea(location: AppLocation): location is Extract<AppLocation, { area: GlobalArea }> {
  return (GLOBAL_AREAS as readonly string[]).includes(location.area);
}

export function getWorkspaceFilter(location: AppLocation): string | undefined {
  return isGlobalArea(location) ? location.workspaceFilter : undefined;
}

/**
 * Applica o rimuove (`workspaceFilter: null`) il filtro workspace su un'area
 * globale. No-op sulle posizioni che non ne hanno concetto (dashboard,
 * workspace) — restituisce la stessa posizione invariata.
 */
export function withWorkspaceFilter(location: AppLocation, workspaceFilter: string | null): AppLocation {
  if (!isGlobalArea(location)) return location;
  if (workspaceFilter !== null) return { ...location, workspaceFilter };
  const cleared: Partial<Record<'workspaceFilter', string>> & typeof location = { ...location };
  delete cleared.workspaceFilter;
  return cleared;
}

/** Confronto per valore (non identità): evita di ri-rendere i consumatori di `location` a fronte di una navigazione verso una posizione equivalente. */
export function locationsEqual(a: AppLocation, b: AppLocation): boolean {
  const aKeys = Object.keys(a) as Array<keyof AppLocation>;
  const bKeys = Object.keys(b) as Array<keyof AppLocation>;
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}
