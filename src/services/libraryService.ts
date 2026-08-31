import { select, execute, runInTransaction } from './dbService';
import { workspacesOfMany } from './workspaceItemsService';
import { collectionsOfMany } from './libraryCollectionsService';
import {
  inventoryBytes,
  libraryInventory,
  principalPages,
  versionInventory,
} from './inventoryService';
import { generateId } from '../utils';
import { logger } from '../utils/logger';
import type {
  AddSourceToLibraryInput,
  LibraryCatalogEntry,
  LibrarySource,
  LibrarySourceDetail,
  LibrarySourceVersion,
  SourceField,
  SourceFieldValues,
  SourceKind,
  SourceStatus,
} from '../types';

interface SourceRow {
  id: string;
  title: string;
  kind: LibrarySource['kind'];
  primary_language: string | null;
  external_ref: string | null;
  status: SourceStatus;
  archived_at: string | null;
  created_at: string;
}

interface SourceVersionRow {
  id: string;
  source_id: string;
  label: string;
  version_kind: LibrarySourceVersion['versionKind'];
  source_url: string | null;
  is_primary: number;
  created_at: string;
}

function rowToSource(row: SourceRow): LibrarySource {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    primaryLanguage: row.primary_language,
    externalRef: row.external_ref,
    status: row.status,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

function rowToVersion(row: SourceVersionRow): LibrarySourceVersion {
  return {
    id: row.id,
    sourceId: row.source_id,
    label: row.label,
    versionKind: row.version_kind,
    sourceUrl: row.source_url,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
  };
}

function isValidUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

interface OverrideRow {
  source_id: string;
  field: SourceField;
  value: string;
}

/**
 * Applica le correzioni a mano a un'opera e restituisce, accanto ai valori da
 * mostrare, quelli che la biblioteca aveva dato: l'originale non si perde mai,
 * e da lì si può sempre tornare indietro.
 */
function withOverrides(
  source: LibrarySource,
  creator: string | null,
  date: string | null,
  overrides: SourceFieldValues,
): { source: LibrarySource; creator: string | null; date: string | null; original: SourceFieldValues } {
  const original: SourceFieldValues = {};
  const corrected = { ...source };
  let effectiveCreator = creator;
  let effectiveDate = date;

  if (overrides.title !== undefined) {
    original.title = source.title;
    corrected.title = overrides.title;
  }
  if (overrides.kind !== undefined) {
    original.kind = source.kind;
    corrected.kind = overrides.kind as SourceKind;
  }
  if (overrides.primary_language !== undefined) {
    original.primary_language = source.primaryLanguage ?? '';
    corrected.primaryLanguage = overrides.primary_language;
  }
  if (overrides.creator !== undefined) {
    original.creator = creator ?? '';
    effectiveCreator = overrides.creator;
  }
  if (overrides.date !== undefined) {
    original.date = date ?? '';
    effectiveDate = overrides.date;
  }

  return { source: corrected, creator: effectiveCreator, date: effectiveDate, original };
}

/**
 * Le correzioni a mano di tutte le opere in **una lettura sola**: una query per
 * scheda sarebbe una query per riga del catalogo.
 */
async function overridesOfMany(sourceIds: string[]): Promise<Map<string, SourceFieldValues>> {
  const bySource = new Map<string, SourceFieldValues>();
  if (sourceIds.length === 0) return bySource;
  const placeholders = sourceIds.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await select<OverrideRow>(
    `SELECT source_id, field, value FROM source_field_overrides
      WHERE source_id IN (${placeholders})`,
    sourceIds,
  );
  for (const row of rows) {
    bySource.set(row.source_id, { ...bySource.get(row.source_id), [row.field]: row.value });
  }
  return bySource;
}

interface CatalogRow extends SourceRow {
  version_id: string | null;
  manifest_url: string | null;
  metadata: string | null;
  expected_asset_count: number | null;
}

/**
 * Il catalogo come lo vede la Biblioteca: la fonte con la sua digitalizzazione
 * principale, la copertina, e **quante pagine sono davvero sul computer**.
 *
 * Le pagine presenti si contano guardando il deposito, non uno stato scritto a
 * parte: la disponibilità è un fatto che si osserva, non una bandierina da
 * tenere aggiornata.
 *
 * Il catalogo mostra **sempre tutti i libri** (#213): la Biblioteca è un
 * catalogo, non la vista di un workspace. A quali workspace appartiene un libro
 * si **vede** sulla sua scheda, e da lì si collega o si scollega.
 *
 * Le opere archiviate rientrano in questa lettura: nasconderle è una scelta
 * della vista, fatta dai filtri sul catalogo già in mano, non una seconda
 * query al database.
 */
export async function listLibraryCatalog(): Promise<LibraryCatalogEntry[]> {
  const rows = await select<CatalogRow>(
    `SELECT s.id, s.title, s.kind, s.primary_language, s.external_ref,
            s.status, s.archived_at, s.created_at,
            v.id AS version_id, v.source_url AS manifest_url, v.metadata,
            v.expected_asset_count
       FROM sources s
       LEFT JOIN source_versions v
         ON v.source_id = s.id AND v.is_primary = 1
      ORDER BY s.title ASC`,
  );

  // Quante pagine ci sono e quanto occupano lo dice il **deposito**, non il
  // database: le pagine non hanno più una riga a testa. Una lettura
  // sola per tutta la Biblioteca.
  const inventory = await libraryInventory();
  const byVersion = new Map(inventory.map((entry) => [entry.versionId, entry]));

  // I workspace di tutte le opere in **una lettura sola**: una per riga
  // significherebbe una query per scheda.
  const workspacesBySource = await workspacesOfMany(
    'source',
    rows.map((row) => row.id),
  );
  const overridesBySource = await overridesOfMany(rows.map((row) => row.id));
  const collectionsBySource = await collectionsOfMany(rows.map((row) => row.id));

  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata);
    const found = row.version_id ? byVersion.get(row.version_id) : undefined;
    const corrected = withOverrides(
      rowToSource(row),
      metadata.creator,
      metadata.date,
      overridesBySource.get(row.id) ?? {},
    );
    return {
      source: corrected.source,
      versionId: row.version_id,
      manifestUrl: row.manifest_url,
      thumbnailUrl: metadata.thumbnailUrl,
      creator: corrected.creator,
      date: corrected.date,
      original: corrected.original,
      // Quante pagine ha l'opera. Lo scaricamento lo scrive leggendo il
      // manifesto; prima di allora vale quello che la biblioteca aveva
      // dichiarato all'aggiunta, che è già salvato nei metadati.
      expectedPages: row.expected_asset_count ?? metadata.itemCount,
      localPages: found ? principalPages(found) : 0,
      localBytes: found ? inventoryBytes(found) : 0,
      // Le misure presenti: servono a distinguere «completo a 2000, più tre a
      // piena risoluzione» da «libro incompleto».
      sizes: found?.sizes ?? [],
      // Quale è la principale lo dice il deposito: la finestra non la indovina.
      principalSize: found?.principal ?? null,
      // La chiave scritta nel deposito vince su quella nei metadati: le fonti
      // aggiunte prima che la provenienza venisse salvata hanno i file sotto
      // una chiave e i metadati vuoti.
      providerKey: found?.providerKey ?? metadata.providerKey,
      workspaces: workspacesBySource.get(row.id) ?? [],
      collections: collectionsBySource.get(row.id) ?? [],
    };
  });
}

interface SourceMetadata {
  thumbnailUrl: string | null;
  creator: string | null;
  date: string | null;
  /**
   * Chiave della biblioteca nel registro dei provider: porta con sé il profilo
   * di rete e nomina la cartella nel deposito. **Non** è
   * `external_ref`, che è chiave *e* identificativo insieme e come componente di
   * percorso verrebbe rifiutata.
   */
  providerKey: string | null;
  /** Quante pagine dichiarava la biblioteca quando l'opera è stata aggiunta. */
  itemCount: number | null;
  language: string | null;
  subjects: string[];
  mediaType: string | null;
  materialType: string | null;
  collection: string | null;
  volume: string | null;
  /** Autori, curatori o traduttori oltre al primo (`creator`). */
  contributors: string[];
  publisher: string | null;
  /** Licenza o stato del diritto d'autore, spesso più di una dichiarazione. */
  rights: string[];
  /** Descrizione fisica del documento (supporto, misure): non è `mediaType`. */
  physicalDescription: string | null;
  /** Fondo e segnatura presso l'istituto che conserva l'originale. */
  holdingInstitution: string | null;
  /** Collegamento alla scheda del catalogo cartaceo/archivistico. */
  catalogUrl: string | null;
  /** La pagina web dell'opera sul sito della biblioteca, per un lettore umano. */
  pageUrl: string | null;
}

/** I metadati arrivano da cataloghi esterni: si legge quello che c'è e si
 *  ignora il resto, invece di fidarsi della forma. */
function parseMetadata(raw: string | null): SourceMetadata {
  const nothing: SourceMetadata = {
    thumbnailUrl: null,
    creator: null,
    date: null,
    providerKey: null,
    itemCount: null,
    language: null,
    subjects: [],
    mediaType: null,
    materialType: null,
    collection: null,
    volume: null,
    contributors: [],
    publisher: null,
    rights: [],
    physicalDescription: null,
    holdingInstitution: null,
    catalogUrl: null,
    pageUrl: null,
  };
  if (!raw) return nothing;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return nothing;
    const record = parsed as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
    const texts = (value: unknown) =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
    return {
      thumbnailUrl: text(record.thumbnailUrl),
      creator: text(record.creator),
      date: text(record.date),
      providerKey: text(record.providerKey),
      itemCount:
        typeof record.itemCount === 'number' && Number.isFinite(record.itemCount)
          ? record.itemCount
          : null,
      language: text(record.language),
      subjects: texts(record.subjects),
      mediaType: text(record.mediaType),
      materialType: text(record.materialType),
      collection: text(record.collection),
      volume: text(record.volume),
      contributors: texts(record.contributors),
      publisher: text(record.publisher),
      rights: texts(record.rights),
      physicalDescription: text(record.physicalDescription),
      holdingInstitution: text(record.holdingInstitution),
      catalogUrl: text(record.catalogUrl),
      pageUrl: text(record.pageUrl),
    };
  } catch {
    return nothing;
  }
}

/**
 * Toglie una fonte dalla Biblioteca. Le versioni, gli asset e i collegamenti ai
 * workspace se ne vanno con lei (il database li lega in cascata).
 *
 * **I file sul disco non li tocca**: cancellarli è "libera spazio", che è
 * un'azione diversa e va chiesta a parte, perché qui si sta rinunciando alla
 * scheda, non ai gigabyte.
 */
/**
 * La chiave della biblioteca **come è scritta nel deposito**
 * (`providers/<chiave>/<versione>/…`).
 *
 * Serve perché metadati e disco possono non concordare: chiedere lo
 * scaricamento con la chiave sbagliata riscaricherebbe tutto in una cartella
 * nuova, e cancellare con quella sbagliata lascerebbe i file sul disco.
 */
export async function versionProviderKey(versionId: string): Promise<string | null> {
  return (await versionInventory(versionId))?.providerKey ?? null;
}

/**
 * Mette da parte un'opera senza perderla, o la rimette in circolo.
 *
 * L'archiviazione riguarda **solo il catalogo**: le pagine già scaricate
 * restano dove sono, liberare lo spazio resta un'azione distinta e volontaria.
 */
export async function setSourceArchived(sourceId: string, archived: boolean): Promise<void> {
  // Una query sola, sempre uguale: la data segue lo stato invece di comporre
  // due testi diversi, così la forma della richiesta non dipende dal caso.
  await execute(
    `UPDATE sources
        SET status = $1,
            archived_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
    [archived ? 'archived' : 'active', archived ? 1 : 0, sourceId],
  );
  logger.info(archived ? 'library.source.archived' : 'library.source.restored', { sourceId });
}

export async function removeSourceFromLibrary(sourceId: string): Promise<void> {
  await execute('DELETE FROM sources WHERE id = $1', [sourceId]);
}

/** URL manifest già presenti in biblioteca (qualunque fonte, in qualunque versione),
 * con l'id della loro opera: usato per segnare come "già aggiunto" un risultato di
 * ricerca prima ancora che l'utente provi ad aggiungerlo, e per sapere a quali
 * workspace è già collegato senza rileggere tutto il catalogo. */
export async function listLibrarySourceUrls(): Promise<{ sourceUrl: string; sourceId: string }[]> {
  const rows = await select<{ source_url: string; source_id: string }>(
    "SELECT DISTINCT source_url, source_id FROM source_versions WHERE source_url IS NOT NULL ORDER BY source_url",
  );
  return rows.map((row) => ({ sourceUrl: row.source_url, sourceId: row.source_id }));
}

export async function addSourceToLibrary(
  input: AddSourceToLibraryInput,
): Promise<{ sourceId: string; wasCreated: boolean }> {
  const title = input.title.trim();
  if (!title) throw new Error('library_source_title_required');
  if (!isValidUrl(input.manifestUrl)) throw new Error('library_source_invalid_manifest_url');

  const [existing] = await select<{ source_id: string }>(
    'SELECT source_id FROM source_versions WHERE source_url = $1',
    [input.manifestUrl],
  );

  if (existing) {
    if (input.workspaceId) {
      await execute(
        `INSERT INTO workspace_items (workspace_id, item_type, item_id) VALUES ($1, 'source', $2)
         ON CONFLICT(workspace_id, item_type, item_id) DO NOTHING`,
        [input.workspaceId, existing.source_id],
      );
    }
    return { sourceId: existing.source_id, wasCreated: false };
  }

  const sourceId = generateId('source');
  const versionId = generateId('sver');
  // Si salva tutto quello che il catalogo ha detto, anche ciò che oggi nessuna
  // schermata mostra: rifare la ricerca per recuperare un dato che avevamo già
  // in mano è lavoro sprecato, e alcune di queste informazioni la biblioteca
  // potrebbe non ridarle uguali domani.
  const metadata = JSON.stringify({
    creator: input.creator,
    date: input.date,
    thumbnailUrl: input.thumbnailUrl,
    language: input.language,
    subjects: input.subjects,
    providerKey: input.providerKey,
    externalId: input.externalId,
    mediaType: input.mediaType,
    materialType: input.materialType,
    collection: input.collection,
    volume: input.volume,
    itemCount: input.itemCount,
    contributors: input.contributors,
    publisher: input.publisher,
    rights: input.rights,
    physicalDescription: input.physicalDescription,
    holdingInstitution: input.holdingInstitution,
    catalogUrl: input.catalogUrl,
    pageUrl: input.pageUrl,
  });

  await runInTransaction(async (run) => {
    await run(
      'INSERT INTO sources (id, title, kind, primary_language, description, external_ref, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      // `external_ref` è la provenienza: chiave della biblioteca e suo
      // identificativo, che insieme dicono da dove viene questa copia.
      [
        sourceId,
        title,
        input.kind,
        input.language,
        input.description,
        input.providerKey && input.externalId
          ? `${input.providerKey}:${input.externalId}`
          : input.providerKey,
        'active',
      ],
    );
    await run(
      'INSERT INTO source_versions (id, source_id, label, version_kind, source_url, metadata, is_primary) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [versionId, sourceId, 'primary', 'iiif_manifest', input.manifestUrl, metadata, 1],
    );
    if (input.workspaceId) {
      await run(
        `INSERT INTO workspace_items (workspace_id, item_type, item_id) VALUES ($1, 'source', $2)`,
        [input.workspaceId, sourceId],
      );
    }
  });

  return { sourceId, wasCreated: true };
}

export async function getLibrarySourceDetail(sourceId: string): Promise<LibrarySourceDetail> {
  const [source] = await select<SourceRow & { description: string | null }>(
    `SELECT id, title, kind, primary_language, external_ref, status, archived_at, created_at, description
       FROM sources WHERE id = $1`,
    [sourceId],
  );
  if (!source) throw new Error('library_source_not_found');

  const versionRows = await select<SourceVersionRow & { metadata: string | null }>(
    `SELECT id, source_id, label, version_kind, source_url, metadata, is_primary, created_at
       FROM source_versions WHERE source_id = $1`,
    [sourceId],
  );
  const linkRows = await select<{ workspace_id: string }>(
    `SELECT workspace_id FROM workspace_items WHERE item_type = 'source' AND item_id = $1`,
    [sourceId],
  );

  const primary = versionRows.find((row) => row.is_primary === 1) ?? versionRows[0];
  const metadata = parseMetadata(primary?.metadata ?? null);
  const corrected = withOverrides(
    rowToSource(source),
    metadata.creator,
    metadata.date,
    (await overridesOfMany([sourceId])).get(sourceId) ?? {},
  );

  return {
    source: corrected.source,
    versions: versionRows.map(rowToVersion),
    linkedWorkspaceIds: linkRows.map((row) => row.workspace_id),
    creator: corrected.creator,
    date: corrected.date,
    original: corrected.original,
    collections: (await collectionsOfMany([sourceId])).get(sourceId) ?? [],
    language: metadata.language,
    subjects: metadata.subjects,
    publisher: metadata.publisher,
    volume: metadata.volume,
    contributors: metadata.contributors,
    rights: metadata.rights,
    physicalDescription: metadata.physicalDescription,
    holdingInstitution: metadata.holdingInstitution,
    catalogUrl: metadata.catalogUrl,
    pageUrl: metadata.pageUrl,
    description: source.description,
    providerKey: metadata.providerKey,
  };
}

/**
 * Corregge a mano un campo dell'opera, o toglie la correzione (`null`)
 * riportando il valore della biblioteca.
 *
 * Correggere con lo stesso valore che aveva la biblioteca **non** lascia una
 * correzione: un segno «corretto a mano» su un dato identico all'originale
 * direbbe una cosa falsa.
 */
export async function setSourceFieldOverride(
  sourceId: string,
  field: SourceField,
  value: string | null,
): Promise<void> {
  const trimmed = value?.trim() ?? null;
  if (trimmed === null || trimmed === '') {
    await execute('DELETE FROM source_field_overrides WHERE source_id = $1 AND field = $2', [
      sourceId,
      field,
    ]);
    logger.info('library.source.fieldRestored', { sourceId, field });
    return;
  }
  if (trimmed === (await originalFieldValue(sourceId, field))) {
    await execute('DELETE FROM source_field_overrides WHERE source_id = $1 AND field = $2', [
      sourceId,
      field,
    ]);
    return;
  }
  await execute(
    `INSERT INTO source_field_overrides (source_id, field, value, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(source_id, field)
     DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [sourceId, field, trimmed],
  );
  logger.info('library.source.fieldCorrected', { sourceId, field });
}

/** Il valore che la biblioteca aveva dato per quel campo, mai sovrascritto. */
async function originalFieldValue(sourceId: string, field: SourceField): Promise<string | null> {
  const [row] = await select<{ title: string; kind: string; primary_language: string | null }>(
    'SELECT title, kind, primary_language FROM sources WHERE id = $1',
    [sourceId],
  );
  if (!row) return null;
  if (field === 'title') return row.title;
  if (field === 'kind') return row.kind;
  if (field === 'primary_language') return row.primary_language;

  const [version] = await select<{ metadata: string | null }>(
    'SELECT metadata FROM source_versions WHERE source_id = $1 ORDER BY is_primary DESC LIMIT 1',
    [sourceId],
  );
  const metadata = parseMetadata(version?.metadata ?? null);
  return field === 'creator' ? metadata.creator : metadata.date;
}

export async function setWorkspaceSourceLink(
  workspaceId: string,
  sourceId: string,
  linked: boolean,
): Promise<void> {
  if (linked) {
    await execute(
      `INSERT INTO workspace_items (workspace_id, item_type, item_id) VALUES ($1, 'source', $2)
       ON CONFLICT(workspace_id, item_type, item_id) DO NOTHING`,
      [workspaceId, sourceId],
    );
  } else {
    await execute(
      `DELETE FROM workspace_items WHERE workspace_id = $1 AND item_type = 'source' AND item_id = $2`,
      [workspaceId, sourceId],
    );
  }
}
