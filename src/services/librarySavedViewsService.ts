import { select, execute } from './dbService';
import { generateId } from '../utils';
import { logger } from '../utils/logger';
import {
  EMPTY_LIBRARY_FILTERS,
  parseLibraryFilters,
  type LibraryFilters,
} from '../utils/libraryCatalogFilters';
/** Una combinazione di filtri con un nome, richiamabile dalla barra di ricerca. */
export interface LibrarySavedView {
  id: string;
  name: string;
  filters: LibraryFilters;
  createdAt: string;
}

interface SavedViewRow {
  id: string;
  name: string;
  filters: string;
  created_at: string;
}

/**
 * Le viste salvate, con i loro filtri.
 *
 * I filtri arrivano da un testo salvato tempo fa: si legge quello che si
 * riconosce e si ignora il resto, invece di fidarsi della forma — una vista
 * scritta da una versione con filtri diversi non deve rompere l'elenco.
 */
export async function listSavedViews(): Promise<LibrarySavedView[]> {
  const rows = await select<SavedViewRow>(
    'SELECT id, name, filters, created_at FROM library_saved_views ORDER BY name ASC',
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filters: parseLibraryFilters(row.filters) ?? EMPTY_LIBRARY_FILTERS,
    createdAt: row.created_at,
  }));
}

/** Salva la combinazione di filtri corrente, sovrascrivendo la vista omonima. */
export async function saveView(name: string, filters: LibraryFilters): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('saved_view_name_required');
  await execute(
    `INSERT INTO library_saved_views (id, name, filters) VALUES ($1, $2, $3)
     ON CONFLICT(name) DO UPDATE SET filters = excluded.filters`,
    [generateId('view'), trimmed, JSON.stringify(filters)],
  );
  logger.info('library.savedView.saved', { name: trimmed });
}

export async function deleteSavedView(viewId: string): Promise<void> {
  await execute('DELETE FROM library_saved_views WHERE id = $1', [viewId]);
  logger.info('library.savedView.deleted', { viewId });
}
