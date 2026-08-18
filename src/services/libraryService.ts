import { select, execute, runInTransaction } from './dbService';
import { workspacesOfMany } from './workspaceItemsService';
import {
  inventoryBytes,
  libraryInventory,
  principalPages,
  versionInventory,
  versionPagePaths,
} from './inventoryService';
import { generateId } from '../utils';
import type { AddSourceToLibraryInput, LibraryAsset, LibraryCatalogEntry, LibrarySource, LibrarySourceDetail, LibrarySourceVersion } from '../types';

interface SourceRow {
  id: string;
  title: string;
  kind: LibrarySource['kind'];
  primary_language: string | null;
  external_ref: string | null;
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

interface AssetRow {
  id: string;
  source_version_id: string | null;
  kind: LibraryAsset['kind'];
  locality: LibraryAsset['locality'];
  availability: LibraryAsset['availability'];
  remote_url: string | null;
}

function rowToSource(row: SourceRow): LibrarySource {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    primaryLanguage: row.primary_language,
    externalRef: row.external_ref,
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

function rowToAsset(row: AssetRow): LibraryAsset {
  return {
    id: row.id,
    sourceVersionId: row.source_version_id,
    kind: row.kind,
    locality: row.locality,
    availability: row.availability,
    remoteUrl: row.remote_url,
  };
}

function isValidUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

interface CatalogRow extends SourceRow {
  version_id: string | null;
  manifest_url: string | null;
  metadata: string | null;
  expected_asset_count: number | null;
}

/**
 * Il catalogo come lo vede la Biblioteca: la fonte con la sua digitalizzazione
 * principale, la copertina, e **quante carte sono davvero sul computer**.
 *
 * Le carte presenti si contano dalle righe locali, non da uno stato scritto a
 * parte: la disponibilità è un fatto che si osserva, non una bandierina da
 * tenere aggiornata (D7).
 */
/**
 * Il catalogo mostra **sempre tutti i libri** (#213).
 *
 * La Biblioteca è un catalogo, non la vista di un workspace: filtrarla su un
 * workspace nascondeva libri che ci sono. A quali workspace appartiene un libro
 * si **vede** sulla sua scheda, e da lì si collega o si scollega.
 */
export async function listLibraryCatalog(): Promise<LibraryCatalogEntry[]> {
  const rows = await select<CatalogRow>(
    `SELECT s.id, s.title, s.kind, s.primary_language, s.external_ref, s.created_at,
            v.id AS version_id, v.source_url AS manifest_url, v.metadata,
            v.expected_asset_count
       FROM sources s
       LEFT JOIN source_versions v
         ON v.source_id = s.id AND v.is_primary = 1
      WHERE s.status = 'active'
      ORDER BY s.title ASC`,
  );

  // Quante pagine ci sono e quanto occupano lo dice il **deposito**, non il
  // database: le pagine non hanno più una riga a testa (§5.4). Una lettura
  // sola per tutta la Biblioteca.
  const inventory = await libraryInventory();
  const byVersion = new Map(inventory.map((entry) => [entry.versionId, entry]));

  // I workspace di tutte le opere in **una lettura sola**: una per riga
  // significherebbe una query per scheda.
  const workspacesBySource = await workspacesOfMany(
    'source',
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata);
    const found = row.version_id ? byVersion.get(row.version_id) : undefined;
    return {
      source: rowToSource(row),
      versionId: row.version_id,
      manifestUrl: row.manifest_url,
      thumbnailUrl: metadata.thumbnailUrl,
      creator: metadata.creator,
      date: metadata.date,
      // Quante pagine ha l'opera. Lo scaricamento lo scrive leggendo il
      // manifesto; prima di allora vale quello che la biblioteca aveva
      // dichiarato all'aggiunta, che è già salvato nei metadati.
      expectedPages: row.expected_asset_count ?? metadata.itemCount,
      localPages: found ? principalPages(found) : 0,
      localBytes: found ? inventoryBytes(found) : 0,
      // Le misure presenti: servono a distinguere «completo a 2000, più tre a
      // piena risoluzione» da «libro incompleto» (§5.4, §5.6).
      sizes: found?.sizes ?? [],
      // La chiave scritta nel deposito vince su quella nei metadati: le fonti
      // aggiunte prima che la provenienza venisse salvata hanno i file sotto
      // una chiave e i metadati vuoti.
      providerKey: found?.providerKey ?? metadata.providerKey,
      workspaces: workspacesBySource.get(row.id) ?? [],
    };
  });
}

interface SourceMetadata {
  thumbnailUrl: string | null;
  creator: string | null;
  date: string | null;
  /**
   * Chiave della biblioteca nel registro dei provider: porta con sé il profilo
   * di rete (D18) e nomina la cartella nel deposito (D2). **Non** è
   * `external_ref`, che è chiave *e* identificativo insieme e come componente di
   * percorso verrebbe rifiutata.
   */
  providerKey: string | null;
  /** Quante pagine dichiarava la biblioteca quando l'opera è stata aggiunta. */
  itemCount: number | null;
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
  };
  if (!raw) return nothing;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return nothing;
    const record = parsed as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
    return {
      thumbnailUrl: text(record.thumbnailUrl),
      creator: text(record.creator),
      date: text(record.date),
      providerKey: text(record.providerKey),
      itemCount:
        typeof record.itemCount === 'number' && Number.isFinite(record.itemCount)
          ? record.itemCount
          : null,
    };
  } catch {
    return nothing;
  }
}

/**
 * Toglie una fonte dalla Biblioteca. Le versioni, gli asset e i collegamenti ai
 * workspace se ne vanno con lei (il database li lega in cascata).
 *
 * **I file sul disco non li tocca**: cancellarli è "libera spazio" (D6), che è
 * un'azione diversa e va chiesta a parte, perché qui si sta rinunciando alla
 * scheda, non ai gigabyte.
 */
/**
 * I percorsi delle pagine di una digitalizzazione, letti dal deposito.
 *
 * Prima venivano dalle righe `assets`: adesso le pagine non hanno una riga a
 * testa, e la cartella è la sola verità (§5.4).
 */
export async function listVersionVaultPaths(versionId: string): Promise<string[]> {
  return versionPagePaths(versionId);
}

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

export async function removeSourceFromLibrary(sourceId: string): Promise<void> {
  await execute('DELETE FROM sources WHERE id = $1', [sourceId]);
}

/** URL manifest già presenti in biblioteca (qualunque fonte, in qualunque versione):
 * usato per segnare come "già aggiunto" un risultato di ricerca prima ancora
 * che l'utente provi ad aggiungerlo. */
export async function listLibrarySourceUrls(): Promise<string[]> {
  const rows = await select<{ source_url: string }>(
    "SELECT DISTINCT source_url FROM source_versions WHERE source_url IS NOT NULL ORDER BY source_url",
  );
  return rows.map((row) => row.source_url);
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
  const assetId = generateId('asset');
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
    await run(
      'INSERT INTO assets (id, source_version_id, kind, locality, availability, remote_url) VALUES ($1, $2, $3, $4, $5, $6)',
      [assetId, versionId, 'manifest', 'remote', 'catalogued', input.manifestUrl],
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
  const [source] = await select<SourceRow>(
    'SELECT id, title, kind, primary_language, external_ref, created_at FROM sources WHERE id = $1',
    [sourceId],
  );
  if (!source) throw new Error('library_source_not_found');

  const versionRows = await select<SourceVersionRow>(
    'SELECT id, source_id, label, version_kind, source_url, is_primary, created_at FROM source_versions WHERE source_id = $1',
    [sourceId],
  );
  const versionIds = versionRows.map((row) => row.id);
  const assetRows = versionIds.length > 0
    ? await select<AssetRow>(
        `SELECT id, source_version_id, kind, locality, availability, remote_url FROM assets WHERE source_version_id IN (${versionIds.map((_, i) => `$${i + 1}`).join(', ')})`,
        versionIds,
      )
    : [];
  const linkRows = await select<{ workspace_id: string }>(
    `SELECT workspace_id FROM workspace_items WHERE item_type = 'source' AND item_id = $1`,
    [sourceId],
  );

  return {
    source: rowToSource(source),
    versions: versionRows.map(rowToVersion),
    assets: assetRows.map(rowToAsset),
    linkedWorkspaceIds: linkRows.map((row) => row.workspace_id),
  };
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
