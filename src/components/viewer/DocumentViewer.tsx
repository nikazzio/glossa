/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Come il visore delle immagini: la superficie deep-zoom è un widget ARIA application che riceve il fuoco e gestisce le frecce. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import OpenSeadragon from 'openseadragon';
import { useTranslation } from 'react-i18next';
import { FileText, RefreshCw } from 'lucide-react';
import { EmptyState, IconButton, Spinner } from '../ui';
import { ViewerToolbar } from './ViewerToolbar';
import { documentBytes, isTooLarge, openDocumentExternally } from '../../services/documentService';
import { renderDocumentPage, openDocument, type LoadedDocument } from './pdfDocument';
import { errorMessage, logger } from '../../utils/logger';

/** Quanto si può ingrandire oltre i pixel disegnati, come per le immagini. */
const MAX_MAGNIFICATION = 2;

/**
 * La lettura del documento unico offerto dalla biblioteca.
 *
 * È una lettura **separata** da quella della sequenza di immagini: le due non
 * promettono la stessa identità di pagina, quindi non si fondono in un unico
 * sfoglio e la barra dichiara sempre quale delle due si sta guardando.
 *
 * La pagina la disegna pdf.js, la mostra OpenSeadragon: zoom, trascinamento e
 * comandi restano quelli di sempre.
 */
export function DocumentViewer({
  versionId,
  providerKey,
}: {
  versionId: string;
  providerKey: string;
}) {
  const { t } = useTranslation();
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const documentRef = useRef<LoadedDocument | null>(null);

  const [total, setTotal] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [goToPage, setGoToPage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  /** Il documento non è ancora sul computer: si legge solo quello che c'è. */
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Il visore nasce una volta sola: ricrearlo a ogni pagina butterebbe zoom e
  // posizione senza motivo.
  useEffect(() => {
    if (!viewerElementRef.current) return;
    const viewer = OpenSeadragon({
      element: viewerElementRef.current,
      showNavigationControl: false,
      gestureSettingsMouse: { clickToZoom: false },
      visibilityRatio: 1,
      constrainDuringPan: true,
      maxZoomPixelRatio: MAX_MAGNIFICATION,
    });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Il documento si apre una volta e resta aperto: è un file solo, e ogni
  // pagina si disegna da quello già in mano.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setTooLarge(false);
    setMissing(false);
    void (async () => {
      try {
        const bytes = await documentBytes(providerKey, versionId);
        const opened = await openDocument(bytes);
        if (cancelled) {
          void opened.destroy();
          return;
        }
        documentRef.current = opened;
        setTotal(opened.pages);
        setCurrentIndex(0);
      } catch (error: unknown) {
        if (cancelled) return;
        if (isTooLarge(error)) {
          setTooLarge(true);
        } else if (String(error).includes('document_missing')) {
          setMissing(true);
        } else {
          logger.error('library.document.openFailed', { message: errorMessage(error) });
          setLoadError(errorMessage(error));
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void documentRef.current?.destroy();
      documentRef.current = null;
    };
  }, [providerKey, versionId, attempt]);

  // La pagina: pdf.js la disegna su una tela, OpenSeadragon la mostra.
  useEffect(() => {
    const viewer = viewerRef.current;
    const opened = documentRef.current;
    if (!viewer || !opened || total === 0) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    void (async () => {
      try {
        const blob = await renderDocumentPage(opened, currentIndex);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        viewer.open({
          type: 'image',
          url: objectUrl,
        } as unknown as OpenSeadragon.TileSourceSpecifier);
        setLoadError(null);
      } catch (error: unknown) {
        if (cancelled) return;
        logger.error('library.document.pageFailed', { message: errorMessage(error) });
        setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentIndex, total, attempt]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setCurrentIndex(index);
    },
    [total],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToIndex(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToIndex(currentIndex - 1);
    }
  };

  return (
    <div
      role="region"
      aria-label={t('areas.library.documentViewerSection')}
      className="flex h-full min-h-0 flex-1"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {total > 0 && (
          <ViewerToolbar
            fromDisk
            origin={{ source: 'vault', size: '' }}
            shownEdge={null}
            index={currentIndex}
            total={total}
            label={t('areas.library.documentReading')}
            goToPage={goToPage}
            onGoToPageChange={setGoToPage}
            onGoToPageSubmit={() => {
              const target = Number(goToPage) - 1;
              if (Number.isInteger(target)) goToIndex(target);
              setGoToPage('');
            }}
            onPrev={() => goToIndex(currentIndex - 1)}
            onNext={() => goToIndex(currentIndex + 1)}
            onZoomIn={() => viewerRef.current?.viewport.zoomBy(1.4)}
            onZoomOut={() => viewerRef.current?.viewport.zoomBy(1 / 1.4)}
            onZoomToFit={() => viewerRef.current?.viewport.goHome()}
            onZoomToActualSize={() => {
              const viewport = viewerRef.current?.viewport;
              if (!viewport) return;
              viewport.zoomTo(viewport.imageToViewportZoom(1));
              viewport.applyConstraints();
            }}
          />
        )}
        <div
          role="application"
          aria-label={t('areas.library.documentViewerSection')}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="relative min-h-0 flex-1 bg-surface-panel"
        >
          <div ref={viewerElementRef} className="absolute inset-0" />
          {missing && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-panel/90">
              <EmptyState
                icon={<FileText size={24} />}
                message={t('areas.library.documentNotHere')}
                hint={t('areas.library.documentNotHereHint')}
              />
            </div>
          )}
          {loading && !loadError && !tooLarge && !missing && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-panel/70">
              <Spinner />
            </div>
          )}
          {tooLarge && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-panel/90">
              <EmptyState
                icon={<FileText size={24} />}
                message={t('areas.library.documentTooLarge')}
                hint={t('areas.library.documentTooLargeHint')}
              />
              <IconButton
                size="sm"
                onClick={() => void openDocumentExternally(providerKey, versionId)}
                title={t('areas.library.documentOpenOutside')}
              >
                <FileText size={14} />
              </IconButton>
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-panel/90">
              <EmptyState
                icon={<FileText size={24} />}
                message={t('areas.library.documentLoadError')}
                hint={t('areas.library.documentLoadErrorHint')}
              />
              <IconButton
                size="sm"
                onClick={() => setAttempt((count) => count + 1)}
                title={t('areas.library.viewerRetry')}
              >
                <RefreshCw size={14} />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
