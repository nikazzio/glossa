import { select } from './dbService';
import { fetchViewerManifestWithRetry, pageSourceUrl } from './iiifViewerService';
import { enqueueOcrPages, type Job, type OcrPageJobInput } from './jobsService';
import {
  resolveOcrSettings,
  type TranscriptionDocument,
  type TranscriptionSegment,
} from './transcriptionService';
import type { ViewerVersionRef } from './libraryService';
import type { CacheRequest } from './cacheService';
import type { Workspace } from '../types';

/**
 * Lettura assistita di una pagina (#220): il visore risolve già una
 * `CacheRequest::Page` per mostrare l'immagine — qui se ne costruisce una
 * equivalente per il lavoro OCR, così Rust non deve mai costruire un
 * indirizzo di biblioteca da solo (lo conosce solo chi ha aperto il visore).
 *
 * **Limite v1**: solo le copie IIIF (`versionKind === 'iiif_manifest'`) sono
 * risolvibili qui — un documento unico (PDF) non ha pagine logiche separate
 * nello stesso modo e resta fuori da questo primo giro.
 */

type OcrWorkspace = Pick<Workspace, 'ocrDefaultPrompt' | 'ocrDefaultProvider' | 'ocrDefaultModel'>;

async function sourcePagePosition(sourcePageId: string): Promise<number | null> {
  const rows = await select<{ position: number }>(
    'SELECT position FROM source_pages WHERE id = $1',
    [sourcePageId],
  );
  return rows[0]?.position ?? null;
}

export type OcrUnavailableReason =
  | 'noDigitization'
  | 'noSourcePage'
  | 'noModelConfigured';

/** Perché il comando OCR è disattivato per questa pagina, se lo è — il
 *  motivo va nel tooltip del comando, non in un testo a parte. */
export function ocrUnavailableReason(
  viewerRef: ViewerVersionRef | null,
  segment: TranscriptionSegment | null,
  provider: string,
  model: string,
): OcrUnavailableReason | null {
  if (!viewerRef || viewerRef.versionKind !== 'iiif_manifest' || !viewerRef.sourceUrl) {
    return 'noDigitization';
  }
  if (!segment?.source_page_id) {
    return 'noSourcePage';
  }
  if (!provider || !model) {
    return 'noModelConfigured';
  }
  return null;
}

async function buildCacheRequest(
  viewerRef: ViewerVersionRef,
  position: number,
  imageEdge: number,
): Promise<CacheRequest> {
  if (!viewerRef.sourceUrl) throw new Error('noDigitization');
  const manifest = await fetchViewerManifestWithRetry(
    viewerRef.sourceUrl,
    viewerRef.providerKey,
    viewerRef.versionId,
  );
  const page = manifest.pages.find((candidate) => candidate.index === position);
  if (!page) throw new Error('noSourcePage');
  const size = String(imageEdge);
  return {
    kind: 'page',
    versionId: viewerRef.versionId,
    index: page.index,
    size,
    remoteUrl: pageSourceUrl(page.imageService, size, manifest.presentation2),
    providerKey: viewerRef.providerKey,
  };
}

interface BuildPageInputParams {
  document: TranscriptionDocument;
  segment: TranscriptionSegment;
  workspace: OcrWorkspace;
  viewerRef: ViewerVersionRef;
  pageLabel: string;
}

async function buildPageInput(params: BuildPageInputParams): Promise<OcrPageJobInput> {
  const { document, segment, workspace, viewerRef, pageLabel } = params;
  const settings = resolveOcrSettings(segment, document, workspace);
  if (!settings.provider || !settings.model) throw new Error('noModelConfigured');
  if (!segment.source_page_id) throw new Error('noSourcePage');
  const position = await sourcePagePosition(segment.source_page_id);
  if (position == null) throw new Error('noSourcePage');
  const cacheRequest = await buildCacheRequest(viewerRef, position, settings.imageEdge);
  return {
    segmentId: segment.id,
    documentId: document.id,
    cacheRequest,
    prompt: settings.prompt,
    referenceText: null,
    provider: settings.provider,
    model: settings.model,
    imageEdge: settings.imageEdge,
    pageLabel,
  };
}

/** Avvia la lettura della pagina aperta nello Studio. */
export async function startOcrForPage(params: BuildPageInputParams): Promise<Job> {
  const page = await buildPageInput(params);
  return enqueueOcrPages([page]);
}

/** Avvia la lettura di un intervallo di pagine: un solo lavoro, una pagina
 *  per volta — la stessa forma dati del comando singolo, con più elementi. */
export async function startOcrForRange(
  pages: BuildPageInputParams[],
): Promise<Job> {
  const built = await Promise.all(pages.map(buildPageInput));
  return enqueueOcrPages(built);
}
