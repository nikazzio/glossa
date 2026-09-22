import { useEffect, useState } from 'react';
import {
  getLibrarySourceDetail,
  getVersionForViewer,
  type ViewerVersionRef,
} from '../../services/libraryService';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { versionInventory } from '../../services/inventoryService';
import { logger } from '../../utils/logger';

export interface BookHeaderInfo {
  title: string;
  creatorDate: string;
  pageUrl: string | null;
  providerLabel: string | undefined;
}

/** Risolve la copia principale, i dati dell'opera e l'eventuale copia
 * alternativa. Lo Studio riceve solo lo stato pronto per il visore. */
export function useTranscriptionSources(sourceVersionId: string | null) {
  const [viewerRef, setViewerRef] = useState<ViewerVersionRef | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [bookInfo, setBookInfo] = useState<BookHeaderInfo | null>(null);
  const [siblingVersion, setSiblingVersion] = useState<ViewerVersionRef | null>(null);
  const [siblingPageCount, setSiblingPageCount] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<'main' | 'sibling'>('main');
  const [manualUnlinked, setManualUnlinked] = useState(false);

  // Un documento creato senza digitalizzazione non ha un visore. Negli altri
  // casi la copia si risolve dal deposito, fonte di verità per il provider.
  useEffect(() => {
    if (!sourceVersionId) {
      setViewerRef(null);
      setViewerLoading(false);
      return;
    }
    let cancelled = false;
    setViewerLoading(true);
    getVersionForViewer(sourceVersionId)
      .then((ref) => { if (!cancelled) setViewerRef(ref); })
      .catch((error: unknown) => {
        logger.error('transcription.viewer.loadFailed', { sourceVersionId, error });
        if (!cancelled) setViewerRef(null);
      })
      .finally(() => { if (!cancelled) setViewerLoading(false); });
    return () => { cancelled = true; };
  }, [sourceVersionId]);

  // Titolo e autore si leggono una volta per opera. Insieme si cerca una sola
  // copia dell'altro tipo, perché due manifesti avrebbero comandi indistinti.
  useEffect(() => {
    if (!viewerRef) {
      setBookInfo(null);
      setSiblingVersion(null);
      setSiblingPageCount(null);
      return;
    }
    let cancelled = false;
    setActiveSource('main');
    setManualUnlinked(false);
    setSiblingVersion(null);
    setSiblingPageCount(null);
    Promise.all([getLibrarySourceDetail(viewerRef.sourceId), listIIIFProviders()])
      .then(([sourceDetail, providers]) => {
        if (cancelled) return;
        setBookInfo({
          title: sourceDetail.source.title,
          creatorDate: [sourceDetail.creator, sourceDetail.date].filter(Boolean).join(' · '),
          pageUrl: sourceDetail.pageUrl ?? sourceDetail.catalogUrl,
          providerLabel: providers.find((provider) => provider.key === viewerRef.providerKey)?.label,
        });

        const sibling = sourceDetail.versions.find(
          (version) =>
            version.versionKind !== viewerRef.versionKind &&
            (version.versionKind === 'iiif_manifest' || version.versionKind === 'pdf') &&
            version.sourceUrl,
        );
        if (!sibling) return;

        getVersionForViewer(sibling.id)
          .then((resolved) => { if (!cancelled) setSiblingVersion(resolved); })
          .catch((error: unknown) => {
            logger.error('transcription.siblingVersion.loadFailed', { versionId: sibling.id, error });
            if (!cancelled) setSiblingVersion(null);
          });
        if (sibling.versionKind === 'iiif_manifest') {
          setSiblingPageCount(sibling.expectedPages);
        } else {
          versionInventory(sibling.id)
            .then((inventory) => {
              if (!cancelled) setSiblingPageCount(inventory?.document?.pages ?? null);
            })
            .catch(() => { if (!cancelled) setSiblingPageCount(null); });
        }
      })
      .catch((error: unknown) => {
        logger.error('transcription.bookInfo.loadFailed', { sourceId: viewerRef.sourceId, error });
        if (!cancelled) {
          setBookInfo(null);
          setSiblingVersion(null);
          setSiblingPageCount(null);
        }
      });
    return () => { cancelled = true; };
  }, [viewerRef]);

  return {
    viewerRef,
    viewerLoading,
    bookInfo,
    siblingVersion,
    siblingPageCount,
    activeSource,
    setActiveSource,
    manualUnlinked,
    setManualUnlinked,
  };
}
