import { select, execute, runInTransaction } from './dbService';
import { generateId } from '../utils';
import type {
  AddSourceToLibraryInput,
  LibraryAsset,
  LibrarySource,
  LibrarySourceDetail,
  LibrarySourceVersion,
} from '../types';

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

/** Biblioteca è un catalogo globale, senza filtro workspace: ogni fonte attiva è visibile a chiunque. */
export async function listLibrarySources(): Promise<LibrarySource[]> {
  const rows = await select<SourceRow>(
    `SELECT id, title, kind, primary_language, external_ref, created_at
     FROM sources
     WHERE status = 'active'
     ORDER BY title ASC`,
  );
  return rows.map(rowToSource);
}

/** URL manifest già presenti in biblioteca (qualunque fonte, in qualunque versione):
 * usato per segnare come "già aggiunto" un risultato di ricerca prima ancora
 * che l'utente provi ad aggiungerlo. */
export async function listLibrarySourceUrls(): Promise<string[]> {
  const rows = await select<{ source_url: string }>(
    "SELECT source_url FROM source_versions WHERE source_url IS NOT NULL",
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
  const metadata = JSON.stringify({
    creator: input.creator,
    date: input.date,
    thumbnailUrl: input.thumbnailUrl,
    language: input.language,
    subjects: input.subjects,
  });

  await runInTransaction(async (run) => {
    await run(
      'INSERT INTO sources (id, title, kind, primary_language, description, external_ref, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [sourceId, title, input.kind, input.language, input.description, null, 'active'],
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
