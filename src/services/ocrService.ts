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
 * Stessa catena del visore, sempre: deposito → cache di rete → deposito a
 * misura più grande → biblioteca remota. Una copia in cache (mai scaricata
 * formalmente, solo vista) vale quanto una nel deposito — bytes_of non fa
 * differenza, e nemmeno questo servizio: **non** si richiede più un
 * collegamento a `source_pages` (quello esiste solo dopo un lavoro di
 * scaricamento vero e proprio, che non è un prerequisito dell'OCR).
 *
 * **Limite v1**: solo le copie IIIF (`versionKind === 'iiif_manifest'`) sono
 * risolvibili qui — un documento unico (PDF) non ha pagine logiche separate
 * nello stesso modo e resta fuori da questo primo giro.
 */

type OcrWorkspace = Pick<Workspace, 'ocrDefaultPrompt' | 'ocrDefaultProvider' | 'ocrDefaultModel'>;

export type OcrUnavailableReason = 'noDigitization' | 'noModelConfigured';

/** Perché il comando OCR è disattivato, se lo è — il motivo va nel
 *  suggerimento del comando, non in un testo a parte. Non dipende dal
 *  segmento: una pagina mai toccata è comunque leggibile, il segmento nasce
 *  al bisogno (`ensureSegment`), come già fa il salvataggio manuale. */
export function ocrUnavailableReason(
  viewerRef: ViewerVersionRef | null,
  provider: string,
  model: string,
): OcrUnavailableReason | null {
  if (!viewerRef || viewerRef.versionKind !== 'iiif_manifest' || !viewerRef.sourceUrl) {
    return 'noDigitization';
  }
  if (!provider || !model) {
    return 'noModelConfigured';
  }
  return null;
}

async function buildCacheRequest(
  viewerRef: ViewerVersionRef,
  pageIndex: number,
  imageEdge: number,
): Promise<CacheRequest> {
  if (!viewerRef.sourceUrl) throw new Error('noDigitization');
  const manifest = await fetchViewerManifestWithRetry(
    viewerRef.sourceUrl,
    viewerRef.providerKey,
    viewerRef.versionId,
  );
  const page = manifest.pages.find((candidate) => candidate.index === pageIndex);
  if (!page) throw new Error('noDigitization');
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
  /** Il segmento della pagina, già garantito da `ensureSegment` se serviva
   *  crearlo: l'OCR può partire su una pagina mai toccata prima. */
  segment: TranscriptionSegment;
  workspace: OcrWorkspace;
  viewerRef: ViewerVersionRef;
  pageLabel: string;
}

async function buildPageInput(params: BuildPageInputParams): Promise<OcrPageJobInput> {
  const { document, segment, workspace, viewerRef, pageLabel } = params;
  const settings = resolveOcrSettings(segment, document, workspace);
  if (!settings.provider || !settings.model) throw new Error('noModelConfigured');
  const cacheRequest = await buildCacheRequest(viewerRef, segment.position, settings.imageEdge);
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
