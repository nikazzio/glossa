/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- La superficie deep-zoom è intenzionalmente un widget ARIA application: riceve focus e gestisce le frecce, mentre i controlli figli e la tela OSD conservano la propria tastiera. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import OpenSeadragon from 'openseadragon';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Images,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import { IconButton, Spinner, EmptyState } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { ThumbnailRail } from './ThumbnailRail';
import { createControlledIiifTileSource } from './iiifTileBridge';
import {
  fetchIiifBytes,
  fetchViewerManifest,
  getLastViewedPage,
  infoJsonUrl,
  setLastViewedPage,
  type ViewerManifest,
} from '../../services/iiifViewerService';
import { useNetworkActivity } from '../../services/networkActivity';
import { errorMessage, logger } from '../../utils/logger';

interface PageViewerProps {
  sourceId: string;
  manifestUrl: string;
  providerKey: string | null;
}

const TILE_LOAD_FAILED = 'tile_load_failed';

/** Entro questo tempo dall'ultima risposta la biblioteca è ancora "collegata".
 * Più lungo di una pagina lenta, più corto di una pausa fra due sfogliate. */
const ONLINE_FOR_MS = 30_000;

/**
 * Il visore IIIF remoto (Blocco 1 del piano locale): pagina singola, zoom a
 * tasselli via OpenSeadragon, tutto passato dal ponte controllato. File
 * locali, PDF e selezione multipla restano fuori — arrivano nei blocchi
 * successivi.
 */
export function PageViewer({ sourceId, manifestUrl, providerKey }: PageViewerProps) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<ViewerManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [goToPage, setGoToPage] = useState('');
  const [manifestAttempt, setManifestAttempt] = useState(0);
  const [pageAttempt, setPageAttempt] = useState(0);

  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  // Un'opera diversa: il manifesto e la posizione precedenti non hanno senso.
  useEffect(() => {
    viewerRef.current?.close();
    setManifest(null);
    setManifestError(null);
    setCurrentIndex(0);
    setPageError(null);
    setPageLoading(false);
    setManifestAttempt(0);
    setPageAttempt(0);
  }, [manifestUrl, sourceId]);

  useEffect(() => {
    let cancelled = false;
    setManifestError(null);
    void (async () => {
      try {
        const result = await fetchViewerManifest(manifestUrl, providerKey);
        // Un motore che rispondesse con qualcosa senza `pages` non deve
        // restare a schermo come un caricamento infinito: è un errore, va
        // detto come tale.
        if (!result?.pages) throw new Error('manifesto senza pagine');
        if (cancelled) return;
        setManifest(result);
        const lastPage = await getLastViewedPage(sourceId);
        if (cancelled) return;
        const validLast = lastPage !== null && lastPage < result.pages.length ? lastPage : 0;
        setCurrentIndex(validLast);
      } catch (error) {
        if (cancelled) return;
        logger.error('library.viewer.manifestFailed', { message: errorMessage(error) });
        setManifestError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifestUrl, providerKey, sourceId, manifestAttempt]);

  // Il visore nasce una sola volta e muore con il componente: ricrearlo a
  // ogni cambio pagina butterebbe via lo stato di zoom/pan senza motivo.
  useEffect(() => {
    if (!viewerElementRef.current) return;
    const viewer = OpenSeadragon({
      element: viewerElementRef.current,
      showNavigationControl: false,
      gestureSettingsMouse: { clickToZoom: false },
      visibilityRatio: 1,
      constrainDuringPan: true,
    });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  const page = manifest?.pages[currentIndex] ?? null;
  const total = manifest?.pages.length ?? 0;
  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setCurrentIndex(index);
    },
    [total],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !page) return;
    let cancelled = false;
    const handleTileLoaded = () => {
      if (!cancelled) setPageLoading(false);
    };
    const handleTileLoadFailed = () => {
      if (cancelled) return;
      logger.error('library.viewer.tileFailed', { index: currentIndex });
      setPageLoading(false);
      setPageError(TILE_LOAD_FAILED);
    };
    viewer.close();
    viewer.addHandler('tile-loaded', handleTileLoaded);
    viewer.addHandler('tile-load-failed', handleTileLoadFailed);
    setPageError(null);
    setPageLoading(true);
    void (async () => {
      try {
        const bytes = await fetchIiifBytes(infoJsonUrl(page.imageService), providerKey);
        if (cancelled) return;
        const infoJson = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
        if (cancelled) return;
        const tileSource = createControlledIiifTileSource(infoJson, providerKey);
        // I tipi del pacchetto descrivono `open` come accettante opzioni
        // grezze, non l'istanza di `TileSource` già pronta che il ponte
        // costruisce sopra — a runtime OpenSeadragon la accetta comunque.
        viewer.open(tileSource as unknown as OpenSeadragon.TileSourceSpecifier);
        void setLastViewedPage(sourceId, currentIndex).catch((error) => {
          logger.warn('library.viewer.lastPageSaveFailed', { message: errorMessage(error), index: currentIndex });
        });
      } catch (error) {
        if (cancelled) return;
        logger.error('library.viewer.pageFailed', { message: errorMessage(error), index: currentIndex });
        setPageLoading(false);
        setPageError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
      viewer.removeHandler('tile-loaded', handleTileLoaded);
      viewer.removeHandler('tile-load-failed', handleTileLoadFailed);
    };
  }, [page, providerKey, sourceId, currentIndex, pageAttempt]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    // I campi e i controlli mantengono le proprie frecce; dentro la tela OSD
    // servono per il pan. Il cambio pagina appartiene alla cornice del visore,
    // non all'intera applicazione.
    if (target?.closest('input, textarea, select, button, [contenteditable="true"], .openseadragon-canvas')) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToIndex(currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToIndex(currentIndex - 1);
    }
  };

  // Il contenitore di OpenSeadragon resta sempre montato: l'effetto che crea
  // il viewer gira una sola volta, al primo montaggio del componente. Se il
  // suo `<div>` comparisse solo dopo che il manifesto è arrivato, quel primo
  // giro troverebbe il ref ancora vuoto e il viewer non nascerebbe mai.
  return (
    <div
      role="region"
      aria-label={t('areas.library.viewerSection')}
      className="flex h-full min-h-0 flex-1"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {manifest && total > 0 && (
          <ViewerToolbar
            index={currentIndex}
            total={total}
            label={page?.label ?? null}
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
            thumbnailsOpen={thumbnailsOpen}
            onToggleThumbnails={() => setThumbnailsOpen((open) => !open)}
          />
        )}
        <div
          role="application"
          aria-label={t('areas.library.viewerSection')}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="relative min-h-0 flex-1 bg-surface-elevated outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-editorial-accent"
        >
          <div ref={viewerElementRef} className="absolute inset-0" />
          {manifestError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-panel">
              <EmptyState icon={<Images size={28} />} message={t('areas.library.viewerLoadError')} hint={manifestError} />
              <IconButton size="sm" onClick={() => setManifestAttempt((n) => n + 1)} title={t('areas.library.viewerRetry')}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
          )}
          {!manifestError && !manifest && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-panel">
              <Spinner label={t('areas.library.viewerLoading')} />
            </div>
          )}
          {manifest && total === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-panel">
              <EmptyState icon={<Images size={28} />} message={t('areas.library.viewerNoManifest')} />
            </div>
          )}
          {pageLoading && (
            <div className="absolute inset-x-0 top-0 flex justify-center p-2">
              <Spinner
                label={t('areas.library.viewerLoading')}
                className="rounded bg-surface-panel/90 px-2 py-1 text-xs text-editorial-muted shadow"
              />
            </div>
          )}
          {pageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-panel/90">
              <EmptyState
                icon={<Images size={24} />}
                message={t('areas.library.viewerLoadError')}
                hint={pageError === TILE_LOAD_FAILED ? t('areas.library.viewerTileLoadErrorHint') : pageError}
              />
              <IconButton size="sm" onClick={() => setPageAttempt((n) => n + 1)} title={t('areas.library.viewerRetry')}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      {manifest && total > 0 && thumbnailsOpen && (
        <div className="flex w-28 shrink-0 flex-col border-l border-editorial-border">
          <ThumbnailRail pages={manifest.pages} providerKey={providerKey} currentIndex={currentIndex} onSelect={goToIndex} />
        </div>
      )}
    </div>
  );
}

interface ViewerToolbarProps {
  index: number;
  total: number;
  label: string | null;
  goToPage: string;
  onGoToPageChange: (value: string) => void;
  onGoToPageSubmit: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  thumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
}

/**
 * Se la biblioteca sta davvero rispondendo.
 *
 * Verde quando una risposta è arrivata da poco, smorzato quando è passato
 * troppo tempo: la stessa scritta sempre accesa non distingueva un visore
 * collegato da uno fermo.
 */
function ConnectionBadge() {
  const { t } = useTranslation();
  const lastOkAt = useNetworkActivity((state) => state.lastOkAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const connected = lastOkAt !== null && now - lastOkAt <= ONLINE_FOR_MS;

  return (
    <span
      className={`ml-auto flex items-center gap-1.5 text-xs ${connected ? 'text-editorial-success' : 'text-editorial-muted'}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-editorial-success' : 'bg-editorial-border'}`}
        aria-hidden="true"
      />
      {t('areas.library.viewerOnline')}
    </span>
  );
}

function ViewerToolbar({
  index,
  total,
  label,
  goToPage,
  onGoToPageChange,
  onGoToPageSubmit,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  thumbnailsOpen,
  onToggleThumbnails,
}: ViewerToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-editorial-border px-2">
      <IconButton size="sm" onClick={onPrev} disabled={index <= 0} title={t('areas.library.viewerPrevPage')}>
        <ChevronLeft size={14} />
      </IconButton>
      <IconButton size="sm" onClick={onNext} disabled={index >= total - 1} title={t('areas.library.viewerNextPage')}>
        <ChevronRight size={14} />
      </IconButton>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onGoToPageSubmit();
        }}
      >
        <input
          value={goToPage}
          onChange={(event) => onGoToPageChange(event.target.value.replace(/\D/g, ''))}
          placeholder={String(index + 1)}
          aria-label={t('areas.library.viewerGoToPage')}
          className={`${FIELD_CLASSNAME} w-12 py-1 text-center text-xs`}
        />
      </form>
      <span className="text-xs text-editorial-muted">
        {t('areas.library.viewerPageOf', { index: index + 1, total })}
        {label ? ` · ${label}` : ''}
      </span>
      <span className="mx-1 h-4 w-px bg-editorial-border" aria-hidden="true" />
      <IconButton size="sm" onClick={onZoomOut} title={t('areas.library.viewerZoomOut')}>
        <ZoomOut size={14} />
      </IconButton>
      <IconButton size="sm" onClick={onZoomIn} title={t('areas.library.viewerZoomIn')}>
        <ZoomIn size={14} />
      </IconButton>
      <IconButton size="sm" onClick={onZoomToFit} title={t('areas.library.viewerZoomToFit')}>
        <Maximize size={14} />
      </IconButton>
      <ConnectionBadge />
      <IconButton
        size="sm"
        onClick={onToggleThumbnails}
        ariaPressed={thumbnailsOpen}
        title={t(thumbnailsOpen ? 'areas.library.viewerHideThumbnails' : 'areas.library.viewerShowThumbnails')}
      >
        {thumbnailsOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
      </IconButton>
    </div>
  );
}
