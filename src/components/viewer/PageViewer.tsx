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
  Focus,
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
  pageSourceUrl,
  preferredPageWidth,
  setLastViewedPage,
  type ViewerManifest,
} from '../../services/iiifViewerService';
import { cachedImage as pageImage } from '../../services/cacheService';
import { versionInventory } from '../../services/inventoryService';
import { useNetworkActivity } from '../../services/networkActivity';
import { errorMessage, logger } from '../../utils/logger';

/** Dove si è arrivati nel libro, per chi sta fuori dal visore. */
export interface ViewerPagePosition {
  index: number;
  label: string | null;
  total: number;
}

interface PageViewerProps {
  sourceId: string;
  /** La copia digitale mostrata: è la chiave con cui si cercano le pagine sul
   *  computer prima di chiederle alla biblioteca. */
  versionId: string;
  manifestUrl: string;
  providerKey: string | null;
  /** Avvisa chi ospita il visore della pagina mostrata, così altri riquadri
   *  della stessa schermata possono dirla senza chiederla al visore. */
  onPageChange?: (page: ViewerPagePosition) => void;
}

const TILE_LOAD_FAILED = 'tile_load_failed';

/** Oltre questo tempo l'apertura si dichiara lenta: più lungo di una
 * biblioteca che risponde subito, più corto della pazienza di chi guarda. */
const SLOW_OPENING_AFTER_MS = 8_000;

/** Oltre questo ingrandimento rispetto ai pixel dell'immagine intera si passa
 *  allo zoom a pezzi. Poco più di uno: sotto, i pezzi non aggiungono nitidezza
 *  e costerebbero una quindicina di richieste alla biblioteca. */
const TILE_UPGRADE_FACTOR = 1.2;

/** Entro questo tempo dall'ultima risposta la biblioteca è ancora "collegata".
 * Più lungo di una pagina lenta, più corto di una pausa fra due sfogliate. */
const ONLINE_FOR_MS = 30_000;

/**
 * Il visore IIIF remoto (Blocco 1 del piano locale): pagina singola, zoom a
 * tasselli via OpenSeadragon, tutto passato dal ponte controllato. File
 * locali, PDF e selezione multipla restano fuori — arrivano nei blocchi
 * successivi.
 */
export function PageViewer({
  sourceId,
  versionId,
  manifestUrl,
  providerKey,
  onPageChange,
}: PageViewerProps) {
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
    // I contatori dei tentativi **non** si azzerano qui: l'effetto che carica
    // il manifesto li ha fra le dipendenze, e riportarli a zero gli faceva
    // chiedere due volte lo stesso manifesto — megabyte, sulla corsia della
    // pagina — per una sola apertura.
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

  // Vale anche alla prima apertura: `page` esiste solo da quando il manifesto
  // è arrivato, quindi il primo giro annuncia già la pagina di partenza.
  useEffect(() => {
    if (!page) return;
    onPageChange?.({ index: currentIndex, label: page.label, total });
  }, [page, currentIndex, total, onPageChange]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !page) return;
    let cancelled = false;
    // Cambiare pagina non deve lasciare in coda le richieste di quella prima:
    // sarebbero in testa alla corsia riservata, davanti a quella che si guarda.
    const controller = new AbortController();
    let shown = 0;
    // Finché non siamo stati noi ad aprire, quello che arriva riguarda ancora
    // la pagina di prima, che è rimasta a schermo: contarlo spegnerebbe la
    // rotella su un'immagine che non è quella chiesta.
    let opened = false;
    let tiles: 'none' | 'loading' | 'shown' = 'none';
    let objectUrl: string | null = null;
    const openedAt = performance.now();
    /**
     * La pagina intera, in **una sola richiesta**.
     *
     * È così che si apre sempre, locale o remota. Lo zoom a pezzi chiede una
     * quindicina di immagini per schermata, e ognuna attraversa il motore e
     * occupa un posto in corsia verso la biblioteca: dove le immagini vengono
     * ricavate al momento — Internet Archive, Gallica — quella schermata non
     * arrivava mai. Una pagina che si vede subito vale più di uno zoom che non
     * arriva; i pezzi si chiedono solo se lo zoom li rende davvero utili.
     */
    const openWholePage = async () => {
      // Nessuna attesa aggiuntiva: se l'indice porta già misure pronte si usa
      // la più piccola sufficiente, altrimenti il dimezzamento misurato.
      const size = localSize ?? String(preferredPageWidth(page));
      const bytes = await pageImage(
        {
          kind: 'page',
          versionId,
          index: page.index,
          size,
          remoteUrl: pageSourceUrl(page.imageService, size, manifest?.presentation2 ?? false),
          providerKey,
        },
        { priority: 'high', signal: controller.signal },
      );
      if (cancelled) return;
      // Un indirizzo temporaneo per volta: sovrascriverlo senza rilasciarlo
      // lascerebbe i byte della pagina precedente appesi alla finestra.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart]));
      opened = true;
      viewer.open({ type: 'image', url: objectUrl } as unknown as OpenSeadragon.TileSourceSpecifier);
      logger.debug('library.viewer.wholePageShown', {
        index: page.index,
        bytes: bytes.byteLength,
        ms: Math.round(performance.now() - openedAt),
        local: Boolean(localSize),
      });
    };

    /**
     * Si passa ai pezzi solo quando l'immagine intera non basta più, cioè
     * quando lo zoom la sta ingrandendo oltre i suoi pixel. Prima sarebbe
     * spendere quindici richieste per una nitidezza che nessuno sta guardando.
     */
    const upgradeToTiles = async () => {
      tiles = 'loading';
      const bytes = await fetchIiifBytes(infoJsonUrl(page.imageService), providerKey, controller.signal);
      if (cancelled) return;
      const infoJson = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      if (cancelled) return;
      const source = createControlledIiifTileSource(infoJson, providerKey);
      // Dove si stava guardando non deve saltare: si rimette com'era appena la
      // nuova sorgente è aperta.
      const center = viewer.viewport.getCenter();
      const zoom = viewer.viewport.getZoom();
      viewer.addOnceHandler('open', () => {
        if (cancelled) return;
        viewer.viewport.zoomTo(zoom, undefined, true);
        viewer.viewport.panTo(center, true);
      });
      // I tipi del pacchetto descrivono `open` come accettante opzioni grezze,
      // non l'istanza di `TileSource` già pronta che il ponte costruisce sopra.
      viewer.open(source as unknown as OpenSeadragon.TileSourceSpecifier);
      tiles = 'shown';
      logger.debug('library.viewer.tilesShown', { index: page.index });
    };

    const givingUp = (error: unknown) => {
      if (cancelled) return;
      logger.error('library.viewer.pageFailed', {
        message: errorMessage(error),
        index: page.index,
        ms: Math.round(performance.now() - openedAt),
      });
      setPageLoading(false);
      setPageError(TILE_LOAD_FAILED);
    };

    const handleTileLoaded = () => {
      if (cancelled || !opened) return;
      shown += 1;
      setPageLoading(false);
      setPageError(null);
    };
    /** Non si vede ancora niente: la pagina è guasta. */
    const nothingIsShowing = () => {
      if (cancelled || !opened || shown > 0) return;
      givingUp(new Error(TILE_LOAD_FAILED));
    };
    const handleTileLoadFailed = () => {
      if (cancelled || !opened) return;
      logger.warn('library.viewer.tileFailed', { index: page.index, shown });
      // Un pezzo ai bordi che non arriva non è una pagina rotta.
      nothingIsShowing();
    };
    const handleOpenFailed = nothingIsShowing;
    /** Lo zoom ha superato i pixel dell'immagine intera: adesso i pezzi servono. */
    const handleZoom = () => {
      if (cancelled || localSize || tiles !== 'none' || shown === 0) return;
      const viewport = viewer.viewport;
      if (viewport.getZoom(true) <= viewport.imageToViewportZoom(1) * TILE_UPGRADE_FACTOR) return;
      void upgradeToTiles().catch((error) => {
        // I pezzi non arrivano: l'immagine intera resta a schermo, che è meglio
        // di una superficie vuota.
        tiles = 'none';
        logger.warn('library.viewer.tilesUnavailable', {
          message: errorMessage(error),
          index: page.index,
        });
      });
    };

    // La pagina di prima **resta a schermo** finché la nuova non è pronta:
    // `open` la sostituisce da solo. Chiuderla subito lasciava un rettangolo
    // vuoto per tutto il tempo dell'attesa, e sembrava che l'immagine fosse
    // sparita.
    viewer.addHandler('tile-loaded', handleTileLoaded);
    viewer.addHandler('tile-load-failed', handleTileLoadFailed);
    viewer.addHandler('open-failed', handleOpenFailed);
    viewer.addHandler('zoom', handleZoom);
    setPageError(null);
    setPageLoading(true);
    // Dove si è arrivati si ricorda comunque, che la pagina venga dal computer
    // o dalla rete: riaprendo il libro si torna qui.
    void setLastViewedPage(sourceId, currentIndex).catch((error) => {
      logger.warn('library.viewer.lastPageSaveFailed', { message: errorMessage(error), index: currentIndex });
    });

    void openWholePage().catch(givingUp);

    return () => {
      cancelled = true;
      controller.abort();
      viewer.removeHandler('tile-loaded', handleTileLoaded);
      viewer.removeHandler('tile-load-failed', handleTileLoadFailed);
      viewer.removeHandler('open-failed', handleOpenFailed);
      viewer.removeHandler('zoom', handleZoom);
      // L'immagine resta disegnata da OpenSeadragon anche dopo il rilascio
      // dell'indirizzo; tenerlo vivo esaurirebbe solo il tetto della finestra.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [page, providerKey, sourceId, versionId, localSize, manifest, currentIndex, pageAttempt]);

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
            fromDisk={localSize !== null}
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
            onZoomToActualSize={() => {
              const viewport = viewerRef.current?.viewport;
              if (!viewport) return;
              // Un pixel dell'immagine su un pixel dello schermo; i vincoli
              // rimettono dentro la cornice quel che finirebbe fuori.
              viewport.zoomTo(viewport.imageToViewportZoom(1));
              viewport.applyConstraints();
            }}
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
          />
        </div>
      )}
    </div>
  );
}

interface ViewerToolbarProps {
  /** Vero quando la pagina viene letta dal computer e non dalla biblioteca. */
  fromDisk: boolean;
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
  onZoomToActualSize: () => void;
  thumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
}

/**
 * Da dove arriva quello che si sta leggendo.
 *
 * Due cose diverse, e vanno dette diverse: un libro sul computer non ha niente
 * a che fare con la biblioteca, e accendere «Online» mentre si sfoglia dal
 * disco era falso. Quando invece si legge in rete, verde vuol dire che la
 * biblioteca ha risposto da poco.
 */
function ConnectionBadge({ fromDisk }: { fromDisk: boolean }) {
  const { t } = useTranslation();
  const lastAnswerAt = useNetworkActivity((state) => state.lastAnswerAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // L'orologio serve solo a spegnere il verde quando la biblioteca smette di
    // rispondere: leggendo dal disco non c'è niente da spegnere.
    if (fromDisk) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [fromDisk]);

  const lit = fromDisk || (lastAnswerAt !== null && now - lastAnswerAt <= ONLINE_FOR_MS);

  return (
    <span
      className={`ml-auto flex items-center gap-1.5 text-xs ${lit ? 'text-editorial-success' : 'text-editorial-muted'}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${lit ? 'bg-editorial-success' : 'bg-editorial-border'}`}
        aria-hidden="true"
      />
      {t(fromDisk ? 'areas.library.viewerFromDisk' : 'areas.library.viewerOnline')}
    </span>
  );
}

function ViewerToolbar({
  fromDisk,
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
  onZoomToActualSize,
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
      <IconButton size="sm" onClick={onZoomToActualSize} title={t('areas.library.viewerZoomActualSize')}>
        <Focus size={14} />
      </IconButton>
      <ConnectionBadge fromDisk={fromDisk} />
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
