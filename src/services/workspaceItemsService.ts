import { execute, select } from './dbService';
import { logger } from '../utils/logger';

/**
 * Cosa contiene un workspace (#213).
 *
 * Due forme di appartenenza, e non è una complicazione gratuita:
 *
 * - **casa**: una traduzione e una trascrizione stanno in *un solo* workspace,
 *   scritto sulla loro riga. Da lì prendono le risorse: se stessero in due,
 *   «quali dizionari vede questo lavoro» non avrebbe una risposta sola;
 * - **collegamento**: un libro è materiale di partenza e sta in più workspace
 *   insieme; un dizionario e le frasi importate si condividono allo stesso
 *   modo. Per questi il legame è una riga qui, uguale per ogni tipo.
 *
 * Un tipo nuovo — i ritagli di caratteri delle trascrizioni, o quel che verrà —
 * è una stringa in più, non una migrazione.
 */

/** I tipi che si collegano a più workspace. La casa non passa da qui. */
export type LinkedItemType = 'source' | 'glossary' | 'phrase';

export interface WorkspaceLink {
  workspaceId: string;
  workspaceName: string;
  /** Il workspace in cui la risorsa è nata: la sua provenienza. */
  isOrigin: boolean;
}

/** Collega un item a un workspace. Rifarlo non cambia niente. */
export async function linkItem(
  workspaceId: string,
  itemType: LinkedItemType,
  itemId: string,
  isOrigin = false,
): Promise<void> {
  await execute(
    `INSERT INTO workspace_items (workspace_id, item_type, item_id, is_origin)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(workspace_id, item_type, item_id) DO NOTHING`,
    [workspaceId, itemType, itemId, isOrigin ? 1 : 0],
  );
  logger.info('workspace.item.linked', { workspaceId, itemType, itemId, isOrigin });
}

export async function unlinkItem(
  workspaceId: string,
  itemType: LinkedItemType,
  itemId: string,
): Promise<void> {
  await execute(
    'DELETE FROM workspace_items WHERE workspace_id = $1 AND item_type = $2 AND item_id = $3',
    [workspaceId, itemType, itemId],
  );
  logger.info('workspace.item.unlinked', { workspaceId, itemType, itemId });
}

/** In quali workspace sta questo item, e dove è nato. */
export async function workspacesOf(
  itemType: LinkedItemType,
  itemId: string,
): Promise<WorkspaceLink[]> {
  const rows = await select<{ workspace_id: string; name: string; is_origin: number }>(
    `SELECT wi.workspace_id, w.name, wi.is_origin
       FROM workspace_items wi
       JOIN workspaces w ON w.id = wi.workspace_id
      WHERE wi.item_type = $1 AND wi.item_id = $2
      ORDER BY wi.is_origin DESC, w.name ASC`,
    [itemType, itemId],
  );
  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    workspaceName: row.name,
    isOrigin: row.is_origin === 1,
  }));
}

/**
 * I workspace di **più item insieme**: una lettura sola per tutta una schermata,
 * invece di una per riga.
 */
export async function workspacesOfMany(
  itemType: LinkedItemType,
  itemIds: string[],
): Promise<Map<string, WorkspaceLink[]>> {
  const byItem = new Map<string, WorkspaceLink[]>();
  if (itemIds.length === 0) return byItem;

  const placeholders = itemIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await select<{
    item_id: string;
    workspace_id: string;
    name: string;
    is_origin: number;
  }>(
    `SELECT wi.item_id, wi.workspace_id, w.name, wi.is_origin
       FROM workspace_items wi
       JOIN workspaces w ON w.id = wi.workspace_id
      WHERE wi.item_type = $1 AND wi.item_id IN (${placeholders})
      ORDER BY wi.is_origin DESC, w.name ASC`,
    [itemType, ...itemIds],
  );

  for (const row of rows) {
    const links = byItem.get(row.item_id) ?? [];
    links.push({
      workspaceId: row.workspace_id,
      workspaceName: row.name,
      isOrigin: row.is_origin === 1,
    });
    byItem.set(row.item_id, links);
  }
  return byItem;
}

/** Gli id degli item di un tipo collegati a un workspace. */
export async function itemIdsOf(
  workspaceId: string,
  itemType: LinkedItemType,
): Promise<string[]> {
  const rows = await select<{ item_id: string }>(
    'SELECT item_id FROM workspace_items WHERE workspace_id = $1 AND item_type = $2',
    [workspaceId, itemType],
  );
  return rows.map((row) => row.item_id);
}


/** Un item collegato, come lo mostra la pagina del workspace. */
export interface LinkedItem {
  id: string;
  label: string;
}

/**
 * I libri e i dizionari collegati a un workspace, con il loro nome.
 *
 * Due letture invece di una join sola perché sono due tabelle diverse, e
 * mescolarle in una query costringerebbe a inventare una colonna comune che
 * non esiste.
 */
export async function linkedSources(workspaceId: string): Promise<LinkedItem[]> {
  return select<LinkedItem>(
    `SELECT s.id, s.title AS label
       FROM workspace_items wi
       JOIN sources s ON s.id = wi.item_id
      WHERE wi.workspace_id = $1 AND wi.item_type = 'source'
      ORDER BY s.title ASC`,
    [workspaceId],
  );
}

export async function linkedGlossaries(workspaceId: string): Promise<LinkedItem[]> {
  return select<LinkedItem>(
    `SELECT g.id, g.name AS label
       FROM workspace_items wi
       JOIN glossaries g ON g.id = wi.item_id
      WHERE wi.workspace_id = $1 AND wi.item_type = 'glossary'
      ORDER BY g.name ASC`,
    [workspaceId],
  );
}
