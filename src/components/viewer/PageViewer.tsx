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
  wholePageUrl,
  WHOLE_PAGE_WIDTH_PX,
  type ViewerManifest,
} from '../../services/iiifViewerService';
import { cachedImage as pageImage } from '../../services/cacheService';
import { versionInventory } from '../../services/inventoryService';
import { useNetworkActivity } from '../../services/networkActivity';
import { errorMessage, logger } from '../../utils/logger';

interface PageViewerProps {
  sourceId: string;
  /** La copia digitale mostrata: è la chiave con cui si cercano le pagine sul
   *  computer prima di chiederle alla biblioteca. */
  versionId: string;
  manifestUrl: string;
  providerKey: string | null;
}

const TILE_LOAD_FAILED = 'tile_load_failed';

/** Oltre questo tempo l'apertura si dichiara lenta: più lungo di una
 * biblioteca che risponde subito, più corto della pazienza di chi guarda. */
const SLOW_OPENING_AFTER_MS = 8_000;

/** Entro questo tempo dall'ultima risposta la biblioteca è ancora "collegata".
 * Più lungo di una pagina lenta, più corto di una pausa fra due sfogliate. */
const ONLINE_FOR_MS = 30_000;

/**
 * Il visore IIIF remoto (Blocco 1 del piano locale): pagina singola, zoom a
 * tasselli via OpenSeadragon, tutto passato dal ponte controllato. File
 * locali, PDF e selezione multipla restano fuori — arrivano nei blocchi
 * successivi.
 */
export function PageViewer({ sourceId, versionId, manifestUrl, providerKey }: PageViewerProps) {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<ViewerManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [goToPage, setGoToPage] = useState('');
  // Vero quando l'apertura dura più del normale. Internet Archive ricava il
  // libro su richiesta: la prima volta l'attesa è lunga e senza una riga che
  // lo dica sembra che il programma si sia piantato.
  const [openingIsSlow, setOpeningIsSlow] = useState(false);
  const [manifestAttempt, setManifestAttempt] = useState(0);
  const [pageAttempt, setPageAttempt] = useState(0);
  /**
   * La misura con cui il libro è stato scaricato, quando c'è.
   *
   * Se c'è, le pagine si leggono dal computer e si mostrano intere: nessuna
   * richiesta alla biblioteca, nessuno zoom a pezzi da ricomporre. È il
   * comportamento di Scriptoria, che per un libro scaricato toglie del tutto il
   * riferimento al servizio della biblioteca.
   */
  const [localSize, setLocalSize] = useState<string | null>(null);

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

  const stillOpening = (!manifest && !manifestError) || pageLoading;
  useEffect(() => {
    if (!stillOpening) {
      setOpeningIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setOpeningIsSlow(true), SLOW_OPENING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stillOpening, manifestAttempt, currentIndex, pageAttempt]);

  useEffect(() => {
    let cancelled = false;
    setLocalSize(null);
    void versionInventory(versionId).then((inventory) => {
      if (cancelled || !inventory) return;
      const principal = inventory.sizes.find((size) => size.sizeTag === inventory.principal);
      setLocalSize(principal && principal.pages > 0 ? principal.sizeTag : null);
    });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

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
    // Cambiare pagina non deve lasciare in coda le richieste di quella prima:
    // sarebbero in testa alla corsia riservata, davanti a quella che si guarda.
    const controller = new AbortController();
    let shown = 0;
    // Tre stati e non un sì/no: mentre il ripiego è in corso arrivano altri
    // tasselli falliti, e con un solo interruttore dichiaravano guasta una
    // pagina che si stava ancora andando a prendere.
    let fallback: 'untried' | 'running' | 'done' = 'untried';
    let objectUrl: string | null = null;

    /**
     * Ripiego a pagina intera. Alcuni servizi promettono nell'`info.json` uno
     * zoom a tasselli che poi non servono: senza questo ripiego la pagina resta
     * bianca e il libro sembra rotto, mentre l'immagine intera arriva benissimo.
     */
    const showWholePage = async () => {
      fallback = 'running';
      try {
        const bytes = await pageImage(
          {
            kind: 'page',
            versionId,
            index: page.index,
            size: localSize ?? String(WHOLE_PAGE_WIDTH_PX),
            remoteUrl: wholePageUrl(page.imageService),
            providerKey,
          },
          { priority: 'high', signal: controller.signal },
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart]));
        viewer.open({ type: 'image', url: objectUrl } as unknown as OpenSeadragon.TileSourceSpecifier);
      } finally {
        fallback = 'done';
      }
    };

    const givingUp = (error: unknown) => {
      if (cancelled) return;
      logger.error('library.viewer.pageFailed', { message: errorMessage(error), index: currentIndex });
      setPageLoading(false);
      setPageError(TILE_LOAD_FAILED);
    };

    const handleTileLoaded = () => {
      if (cancelled) return;
      shown += 1;
      setPageLoading(false);
      setPageError(null);
    };
    const handleTileLoadFailed = () => {
      if (cancelled) return;
      logger.warn('library.viewer.tileFailed', { index: currentIndex, shown });
      // Un tassello ai bordi che non arriva non è una pagina rotta: si dichiara
      // guasta solo quando **non si vede niente**, e prima si prova l'intera.
      if (shown > 0) return;
      if (fallback === 'running') return;
      if (fallback === 'untried') {
        void showWholePage().catch(givingUp);
        return;
      }
      setPageLoading(false);
      setPageError(TILE_LOAD_FAILED);
    };
    // OpenSeadragon rinuncia prima ancora di chiedere un tassello quando il
    // descrittore non descrive niente di apribile: anche lì c'è la pagina
    // intera da provare.
    const handleOpenFailed = () => {
      if (cancelled || fallback !== 'untried') return;
      void showWholePage().catch(givingUp);
    };
    viewer.close();
    viewer.addHandler('tile-loaded', handleTileLoaded);
    viewer.addHandler('tile-load-failed', handleTileLoadFailed);
    viewer.addHandler('open-failed', handleOpenFailed);
    setPageError(null);
    setPageLoading(true);
    void (async () => {
      // Il libro è sul computer: si legge da lì e non si chiede niente a
      // nessuno. Niente zoom a pezzi, che avrebbe senso solo in rete.
      if (localSize) {
        await showWholePage().catch(givingUp);
        return;
      }
      try {
        const bytes = await fetchIiifBytes(infoJsonUrl(page.imageService), providerKey, controller.signal);
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
        // Senza `info.json` non c'è zoom, ma la pagina intera si può ancora
        // chiedere: è il caso dei servizi che espongono solo le immagini.
        logger.warn('library.viewer.infoFailed', { message: errorMessage(error), index: currentIndex });
        await showWholePage().catch(givingUp);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      viewer.removeHandler('tile-loaded', handleTileLoaded);
      viewer.removeHandler('tile-load-failed', handleTileLoadFailed);
      viewer.removeHandler('open-failed', handleOpenFailed);
      // L'immagine resta disegnata da OpenSeadragon anche dopo il rilascio
      // dell'indirizzo; tenerlo vivo esaurirebbe solo il tetto della finestra.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page, providerKey, sourceId, versionId, localSize, currentIndex, pageAttempt]);

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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-panel">
              <Spinner label={t('areas.library.viewerLoading')} />
              {openingIsSlow && (
                <p className="max-w-xs text-center text-xs text-editorial-muted">
                  {t('areas.library.viewerPreparing')}
                </p>
              )}
            </div>
          )}
          {manifest && total === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-panel">
              <EmptyState icon={<Images size={28} />} message={t('areas.library.viewerNoManifest')} />
            </div>
          )}
          {pageLoading && (
            <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-2">
              <Spinner
                label={t('areas.library.viewerLoading')}
                className="rounded bg-surface-panel/90 px-2 py-1 text-xs text-editorial-muted shadow"
              />
              {openingIsSlow && (
                <p className="max-w-xs rounded bg-surface-panel/90 px-2 py-1 text-center text-xs text-editorial-muted shadow">
                  {t('areas.library.viewerPreparing')}
                </p>
              )}
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
          <ThumbnailRail
            pages={manifest.pages}
            versionId={versionId}
            providerKey={providerKey}
            currentIndex={currentIndex}
            onSelect={goToIndex}
            fetching={!pageLoading}
          />
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
