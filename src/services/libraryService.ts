import { select, execute, runInTransaction } from './dbService';
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
  local_pages: number;
  local_bytes: number;
  linked_here: number;
}

/**
 * «Questa opera è collegata al workspace attivo».
 *
 * Sta qui una volta sola perché serve in due punti della stessa query — la
 * colonna e il filtro — e due copie divergerebbero alla prima modifica.
 */
const linkedExpression =
  "(CASE WHEN EXISTS (SELECT 1 FROM workspace_sources ws WHERE ws.source_id = s.id AND ws.workspace_id = $1) THEN 1 ELSE 0 END)";

/**
 * Il catalogo come lo vede la Biblioteca: la fonte con la sua digitalizzazione
 * principale, la copertina, e **quante carte sono davvero sul computer**.
 *
 * Le carte presenti si contano dalle righe locali, non da uno stato scritto a
 * parte: la disponibilità è un fatto che si osserva, non una bandierina da
 * tenere aggiornata (D7).
 */
export async function listLibraryCatalog(
  /**
   * Quando c'è, mostra **solo le opere collegate a quel workspace** (#213):
   * nessuna lettura da un altro workspace senza chiederla. Senza, è il catalogo
   * generale, che resta il modo di ritrovare un'opera e collegarla.
   */
  workspaceId?: string,
  /** Vero per vedere solo quelle collegate; falso per il catalogo generale. */
  onlyLinked = false,
): Promise<LibraryCatalogEntry[]> {
  const rows = await select<CatalogRow>(
    // Un solo passaggio sugli asset: con due subquery per riga la Biblioteca
    // faceva due letture della tabella per ogni fonte.
    `SELECT s.id, s.title, s.kind, s.primary_language, s.external_ref, s.created_at,
            v.id AS version_id, v.source_url AS manifest_url, v.metadata,
            v.expected_asset_count,
            -- Carte distinte, non righe: la stessa carta esiste anche a piena
            -- risoluzione (D4), e contarla due volte darebbe «740 su 374». I
            -- byte invece si sommano tutti, perché lo spazio lo occupano tutti.
            COUNT(DISTINCT a.page_index) AS local_pages,
            COALESCE(SUM(a.byte_size), 0) AS local_bytes,
            ${workspaceId ? linkedExpression : '0'} AS linked_here
       FROM sources s
       LEFT JOIN source_versions v
         ON v.source_id = s.id AND v.is_primary = 1
       LEFT JOIN assets a
         ON a.source_version_id = v.id AND a.kind = 'image' AND a.locality = 'local'
      WHERE s.status = 'active'
        ${workspaceId && onlyLinked ? `AND ${linkedExpression} = 1` : ''}
      GROUP BY s.id, v.id
      ORDER BY s.title ASC`,
    workspaceId ? [workspaceId] : [],
  );

  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata);
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
      localPages: row.local_pages,
      localBytes: row.local_bytes,
      providerKey: metadata.providerKey,
      linkedToWorkspace: row.linked_here === 1,
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
 * I percorsi che il database dichiara di avere nel deposito per questa
 * digitalizzazione. La verifica confronta questi con quello che c'è davvero: il
 * database è la verità, il disco si controlla (D5).
 */
export async function listVersionVaultPaths(versionId: string): Promise<string[]> {
  const rows = await select<{ vault_path: string }>(
    "SELECT vault_path FROM assets WHERE source_version_id = $1 AND vault_path IS NOT NULL AND locality = 'local' ORDER BY vault_path",
    [versionId],
  );
  return rows.map((row) => row.vault_path);
}

/**
 * La chiave della biblioteca **come è scritta nel deposito**, ricavata dal
 * percorso di un file già registrato (`providers/<chiave>/<versione>/…`).
 *
 * Serve perché i metadati e il disco possono non concordare: le fonti aggiunte
 * prima che la provenienza venisse salvata hanno i file sotto una chiave e i
 * metadati vuoti. Chiedere lo scaricamento con la chiave sbagliata farebbe
 * riscaricare tutto in una cartella nuova; cancellare con quella sbagliata
 * lascerebbe i file sul disco e toglierebbe le righe dal database.
 */
export async function versionProviderKey(versionId: string): Promise<string | null> {
  const [row] = await select<{ vault_path: string }>(
    "SELECT vault_path FROM assets WHERE source_version_id = $1 AND vault_path LIKE 'providers/%' LIMIT 1",
    [versionId],
  );
  return row?.vault_path.split('/')[1] ?? null;
}

/**
 * Toglie dal database le carte di una digitalizzazione, dopo che i file sono
 * stati cancellati da «libera spazio» (D6).
 *
 * Senza questo la Biblioteca continuerebbe a dichiarare presenti carte che non
 * ci sono più: il conteggio si legge dalle righe. Miniature e manifesto restano,
 * perché «libera spazio» non li tocca.
 */
export async function forgetVersionPages(versionId: string): Promise<void> {
  await execute("DELETE FROM assets WHERE source_version_id = $1 AND kind = 'image'", [versionId]);
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
        'INSERT OR IGNORE INTO workspace_sources (workspace_id, source_id) VALUES ($1, $2)',
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
        'INSERT INTO workspace_sources (workspace_id, source_id) VALUES ($1, $2)',
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
    'SELECT workspace_id FROM workspace_sources WHERE source_id = $1',
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
      'INSERT OR IGNORE INTO workspace_sources (workspace_id, source_id) VALUES ($1, $2)',
      [workspaceId, sourceId],
    );
  } else {
    await execute(
      'DELETE FROM workspace_sources WHERE workspace_id = $1 AND source_id = $2',
      [workspaceId, sourceId],
    );
  }
}
