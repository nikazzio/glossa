import { select, execute } from './dbService';
import { generateId } from '../utils';
import { logger } from '../utils/logger';
import type { SourceCollection } from '../types';

interface CollectionRow {
  id: string;
  name: string;
  created_at: string;
}

/** Le collezioni esistenti, in ordine alfabetico. */
export async function listCollections(): Promise<SourceCollection[]> {
  const rows = await select<CollectionRow>(
    'SELECT id, name, created_at FROM source_collections ORDER BY name ASC',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

/**
 * Crea una collezione, o restituisce quella che porta già quel nome: due
 * collezioni con lo stesso nome sarebbero indistinguibili nell'elenco.
 */
export async function createCollection(name: string): Promise<SourceCollection> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('collection_name_required');

  // Prima si scrive, poi si legge: guardare e poi scrivere lascia in mezzo lo
  // spazio per un secondo invio con lo stesso nome, che farebbe fallire la
  // creazione invece di restituire la collezione che esiste già.
  const id = generateId('coll');
  await execute(
    'INSERT INTO source_collections (id, name) VALUES ($1, $2) ON CONFLICT(name) DO NOTHING',
    [id, trimmed],
  );
  const [row] = await select<CollectionRow>(
    'SELECT id, name, created_at FROM source_collections WHERE name = $1',
    [trimmed],
  );
  if (!row) throw new Error('collection_not_created');
  if (row.id === id) logger.info('library.collection.created', { collectionId: id });
  // La data di creazione la dice il database, non l'orologio di chi chiama.
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

/** Elimina la collezione: le opere restano, perdono solo quell'etichetta. */
export async function deleteCollection(collectionId: string): Promise<void> {
  await execute('DELETE FROM source_collections WHERE id = $1', [collectionId]);
  logger.info('library.collection.deleted', { collectionId });
}

export async function setSourceCollection(
  collectionId: string,
  sourceId: string,
  member: boolean,
): Promise<void> {
  if (member) {
    await execute(
      `INSERT INTO source_collection_items (collection_id, source_id) VALUES ($1, $2)
       ON CONFLICT(collection_id, source_id) DO NOTHING`,
      [collectionId, sourceId],
    );
  } else {
    await execute(
      'DELETE FROM source_collection_items WHERE collection_id = $1 AND source_id = $2',
      [collectionId, sourceId],
    );
  }
}

interface MembershipRow {
  source_id: string;
  id: string;
  name: string;
}

/**
 * Le collezioni di tutte le opere in **una lettura sola**: una per riga
 * significherebbe una query per scheda del catalogo.
 */
export async function collectionsOfMany(
  sourceIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const bySource = new Map<string, { id: string; name: string }[]>();
  if (sourceIds.length === 0) return bySource;
  const placeholders = sourceIds.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await select<MembershipRow>(
    `SELECT i.source_id, c.id, c.name
       FROM source_collection_items i
       JOIN source_collections c ON c.id = i.collection_id
      WHERE i.source_id IN (${placeholders})
      ORDER BY c.name ASC`,
    sourceIds,
  );
  for (const row of rows) {
    bySource.set(row.source_id, [
      ...(bySource.get(row.source_id) ?? []),
      { id: row.id, name: row.name },
    ]);
  }
  return bySource;
}
