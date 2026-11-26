import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { execute, runInTransaction, select } from './dbService';
import { setSourceFieldOverride } from './libraryService';
import { generateId } from '../utils';
import { logger } from '../utils/logger';
import type { IIIFManifestPreview, SourceField } from '../types';
import type { Job } from './jobsService';
import { IMPORT_SCHEME, LOCAL_IMPORT_PROVIDER } from './importedCopies';

export { IMPORT_SCHEME, LOCAL_IMPORT_PROVIDER, PAGE_NOT_EXTRACTED, isImportUrl } from './importedCopies';

/** Importazione di un PDF dal computer (con il manifesto facoltativo) ed
 *  estrazione delle sue pagine come immagini. */

export interface PdfFacts {
  pages: number;
  bytes: number;
}

export interface ManifestFile {
  preview: IIIFManifestPreview;
  providerKey: string;
  pages: number;
}

/** I campi della finestra di importazione, come li ha lasciati l'utente. */
export interface ImportFields {
  title: string;
  creator: string;
  date: string;
  /** Codice ISO 639-3, o null se non scelto. */
  language: string | null;
  pageUrl: string;
}

function isPdfFacts(value: unknown): value is PdfFacts {
  const facts = value as PdfFacts | null;
  return typeof facts?.pages === 'number' && typeof facts.bytes === 'number';
}

function isManifestFile(value: unknown): value is ManifestFile {
  const file = value as ManifestFile | null;
  return typeof file?.providerKey === 'string'
    && typeof file.pages === 'number'
    && typeof file.preview?.title === 'string';
}

async function pickFile(title: string, name: string, extensions: string[]): Promise<string | null> {
  const picked = await open({ title, filters: [{ name, extensions }], multiple: false });
  return typeof picked === 'string' ? picked : null;
}

export function pickPdfFile(title: string): Promise<string | null> {
  return pickFile(title, 'PDF', ['pdf']);
}

export function pickManifestFile(title: string): Promise<string | null> {
  return pickFile(title, 'IIIF manifest', ['json']);
}

/** Pagine e dimensione del PDF scelto; rifiuta un file che non è un PDF leggibile. */
export async function inspectPdfFile(path: string): Promise<PdfFacts> {
  const facts = await invoke<unknown>('inspect_pdf_file', { path });
  if (!isPdfFacts(facts)) throw new Error('pdf_invalid');
  return facts;
}

export async function readManifestFile(path: string): Promise<ManifestFile> {
  const file = await invoke<unknown>('read_manifest_file', { path });
  if (!isManifestFile(file)) throw new Error('manifest_unreadable');
  return file;
}

/** Il nome del file senza cartella né estensione: il titolo di base di un
 *  PDF importato senza manifesto. */
export function fileStem(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.replace(/\.pdf$/i, '') || name;
}

/** I dati della biblioteca scritti nel blob della copia, come per un'opera
 *  aggiunta dalla Ricerca. */
function manifestMetadata(manifest: ManifestFile | null, providerKey: string, pageUrl: string | null) {
  const preview = manifest?.preview;
  return {
    creator: preview?.creator ?? null,
    date: preview?.date ?? null,
    thumbnailUrl: null,
    language: preview?.language ?? null,
    subjects: preview?.subjects ?? [],
    providerKey,
    externalId: null,
    mediaType: null,
    materialType: preview?.materialType ?? null,
    collection: null,
    volume: preview?.volume ?? null,
    itemCount: manifest?.pages ?? null,
    contributors: preview?.contributors ?? [],
    publisher: preview?.publisher ?? null,
    rights: preview?.rights ?? [],
    physicalDescription: preview?.physicalDescription ?? null,
    holdingInstitution: preview?.holdingInstitution ?? null,
    catalogUrl: null,
    pageUrl: preview?.pageUrl ?? pageUrl,
    manifestUrl: preview?.manifestUrl || null,
    raw: {},
  };
}

/** Le correzioni a mano: un campo uguale al dato della biblioteca non diventa
 *  correzione (lo scarta già `setSourceFieldOverride`). */
async function saveCorrections(sourceId: string, fields: ImportFields): Promise<void> {
  const typed: [SourceField, string | null][] = [
    ['title', fields.title],
    ['creator', fields.creator],
    ['date', fields.date],
    ['primary_language', fields.language],
  ];
  for (const [field, value] of typed) {
    if (value !== null && value.trim() !== '') await setSourceFieldOverride(sourceId, field, value);
  }
}

export async function enqueuePdfExtraction(pdfVersionId: string): Promise<Job> {
  return invoke<Job>('enqueue_pdf_extraction', { pdfVersionId });
}

export interface ImportAsNewWorkInput {
  pdfPath: string;
  manifestPath: string | null;
  manifest: ManifestFile | null;
  fields: ImportFields;
  workspaceId: string | null;
  extractNow: boolean;
}

/** Crea un'opera nuova dal PDF scelto. I file entrano nel deposito per primi:
 *  se il PDF non è valido non nasce nessuna riga. */
export async function importPdfAsNewWork(input: ImportAsNewWorkInput): Promise<string> {
  const sourceId = generateId('source');
  const versionId = generateId('sver');
  const providerKey = input.manifest?.providerKey ?? LOCAL_IMPORT_PROVIDER;
  await invoke('import_pdf_document', {
    versionId,
    providerKey,
    path: input.pdfPath,
    manifestPath: input.manifestPath,
  });

  const preview = input.manifest?.preview;
  const baseTitle = preview?.title || fileStem(input.pdfPath);
  const pageUrl = input.fields.pageUrl.trim() || null;
  const metadata = JSON.stringify(manifestMetadata(input.manifest, providerKey, pageUrl));
  await runInTransaction(async (run) => {
    await run(
      'INSERT INTO sources (id, title, kind, primary_language, description, external_ref, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [sourceId, baseTitle, 'other', preview?.language ?? null, preview?.description ?? null, providerKey, 'active'],
    );
    await run(
      'INSERT INTO source_versions (id, source_id, label, version_kind, source_url, metadata, is_primary) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [versionId, sourceId, 'primary', 'pdf', `${IMPORT_SCHEME}${versionId}`, metadata, 1],
    );
    if (input.workspaceId) {
      await run(
        `INSERT INTO workspace_items (workspace_id, item_type, item_id) VALUES ($1, 'source', $2)`,
        [input.workspaceId, sourceId],
      );
    }
  });
  await saveCorrections(sourceId, input.fields);
  logger.info('library.source.imported', { sourceId, providerKey, withManifest: Boolean(input.manifest) });
  if (input.extractNow) await enqueuePdfExtraction(versionId);
  return sourceId;
}

interface VersionRow {
  id: string;
  metadata: string | null;
  is_primary: number;
}

function metadataText(metadata: string | null, key: string): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    const value = (parsed as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

function providerKeyOf(metadata: string | null): string | null {
  return metadataText(metadata, 'providerKey');
}

/** Importa il PDF scelto come copia PDF di un'opera già in Biblioteca che non
 *  ne ha una sul computer. La riga PDF dichiarata dalla biblioteca, se c'è, si
 *  riempie; altrimenti se ne crea una. */
export async function importPdfIntoWork(sourceId: string, pdfPath: string): Promise<string> {
  const versions = await select<VersionRow & { version_kind: string }>(
    'SELECT id, metadata, is_primary, version_kind FROM source_versions WHERE source_id = $1',
    [sourceId],
  );
  const primary = versions.find((row) => row.is_primary === 1) ?? versions[0];
  const providerKey = providerKeyOf(primary?.metadata ?? null) ?? LOCAL_IMPORT_PROVIDER;
  const declared = versions.find((row) => row.version_kind === 'pdf');
  const versionId = declared?.id ?? generateId('sver');
  await invoke('import_pdf_document', { versionId, providerKey, path: pdfPath, manifestPath: null });
  if (!declared) {
    await execute(
      'INSERT INTO source_versions (id, source_id, label, version_kind, source_url, metadata, is_primary) VALUES ($1, $2, $3, $4, $5, $6, 0)',
      [versionId, sourceId, 'document', 'pdf', `${IMPORT_SCHEME}${versionId}`, JSON.stringify({ providerKey })],
    );
  }
  logger.info('library.source.pdfImported', { sourceId, versionId });
  return versionId;
}

/** Carica in seguito il manifesto di un'opera importata: riempie i dati della
 *  biblioteca e lascia intatte le correzioni a mano. */
export async function importSourceManifest(sourceId: string, manifestPath: string): Promise<void> {
  const [pdf] = await select<VersionRow>(
    "SELECT id, metadata, is_primary FROM source_versions WHERE source_id = $1 AND version_kind = 'pdf'",
    [sourceId],
  );
  if (!pdf) throw new Error('pdf_version_not_found');
  const providerKey = providerKeyOf(pdf.metadata) ?? LOCAL_IMPORT_PROVIDER;
  const file = await invoke<unknown>('import_source_manifest', {
    versionId: pdf.id,
    providerKey,
    path: manifestPath,
  });
  if (!isManifestFile(file)) throw new Error('manifest_unreadable');
  const metadata = manifestMetadata(file, providerKey, metadataText(pdf.metadata, 'pageUrl'));
  await runInTransaction(async (run) => {
    await run(
      `UPDATE sources SET title = COALESCE(NULLIF($2, ''), title), primary_language = COALESCE($3, primary_language),
         description = COALESCE($4, description), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [sourceId, file.preview.title, file.preview.language, file.preview.description],
    );
    await run('UPDATE source_versions SET metadata = $2 WHERE id = $1', [pdf.id, JSON.stringify(metadata)]);
  });
  logger.info('library.source.manifestImported', { sourceId });
}
