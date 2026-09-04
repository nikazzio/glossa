/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- La superficie deep-zoom è intenzionalmente un widget ARIA application: riceve focus e gestisce le frecce, mentre i controlli figli e la tela OSD conservano la propria tastiera. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import OpenSeadragon from 'openseadragon';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  HardDriveDownload,
  Images,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Focus,
  MoreHorizontal,
} from 'lucide-react';
import { ClickPopover, EmptyState, IconButton, MenuActionRow, Spinner, Tooltip } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { ThumbnailRail } from './ThumbnailRail';
import { createControlledIiifTileSource } from './iiifTileBridge';
import {
  fetchIiifBytes,
  fetchViewerManifestWithRetry,
  buildsImagesOnDemand,
  getLastViewedPage,
  infoJsonUrl,
  pageSourceUrl,
  setLastViewedPage,
  wholePageAttempts,
  type ViewerManifest,
} from '../../services/iiifViewerService';
import {
  cachedImage as pageImage,
  imageSource,
  type CacheRequest,
  type ImageSource,
} from '../../services/cacheService';
import { keepViewerPage } from '../../services/cacheService';
import { versionInventory, type VersionInventory } from '../../services/inventoryService';
import { useNetworkActivity } from '../../services/networkActivity';
import { errorMessage, logger } from '../../utils/logger';
import { resolutionLabel } from '../../utils/resolutionLabel';
import { toast } from 'sonner';

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
  /**
   * Quale versione locale leggere, quando ce n'è più di una sul computer: la
   * misura scelta nella scheda dell'opera. Se quella misura non ha pagine si
   * torna alla più fornita, che è il comportamento di sempre.
   */
  preferredLocalSize?: string | null;
  /** Dice quale versione locale il visore sta davvero leggendo, `null` se sta
   *  leggendo dalla biblioteca: la scheda dell'opera la segna come «in
   *  lettura» senza doverla indovinare. */
  onLocalSizeChange?: (sizeTag: string | null) => void;
  /** Avvisa chi ospita il visore della pagina mostrata, così altri riquadri
   *  della stessa schermata possono dirla senza chiederla al visore. */
  onPageChange?: (page: ViewerPagePosition) => void;
  /** Una pagina è appena entrata nel deposito: chi mostra le versioni locali
   *  deve rileggerle, perché spazio e conteggio sono cambiati. */
  onPageKept?: () => void;
}

/**
 * Quale cartella di misura leggere sul computer: quella chiesta, se ha pagine,
 * altrimenti la più fornita. Nessuna scelta implicita fra due misure: una
 * versione ridotta si legge solo se qualcuno l'ha chiesta.
 */
function readableSize(inventory: VersionInventory, preferred: string | null): string | null {
  const wanted = preferred
    ? inventory.sizes.find((size) => size.sizeTag === preferred && size.pages > 0)
    : undefined;
  if (wanted) return wanted.sizeTag;
  const principal = inventory.sizes.find((size) => size.sizeTag === inventory.principal);
  return principal && principal.pages > 0 ? principal.sizeTag : null;
}

const TILE_LOAD_FAILED = 'tile_load_failed';

/** Oltre questo tempo l'apertura si dichiara lenta: più lungo di una
 * biblioteca che risponde subito, più corto della pazienza di chi guarda. */
const SLOW_OPENING_AFTER_MS = 8_000;

/** Oltre questo ingrandimento rispetto ai pixel dell'immagine intera si passa
 *  allo zoom a pezzi. Poco più di uno: sotto, i pezzi non aggiungono nitidezza
 *  e costerebbero una quindicina di richieste alla biblioteca. */
const TILE_UPGRADE_FACTOR = 1.2;

/**
 * Quanto si può ingrandire oltre i pixel dell'immagine che si sta guardando.
 *
 * OpenSeadragon si fermerebbe a 1,1 — appena sopra la dimensione reale. Su un
 * libro letto dal disco, dove l'immagine è quella che è stata scaricata,
 * quel tetto lascia uno zoom quasi inesistente: si adatta la pagina alla
 * finestra e non si va più avanti. Peggio: essendo **più basso** di
 * `TILE_UPGRADE_FACTOR`, rendeva il passaggio allo zoom a pezzi
 * irraggiungibile, quindi la nitidezza vera non arrivava mai nemmeno online.
 *
 * Ingrandire oltre i pixel sgrana, ma su una scansione serve — una nota a
 * margine si legge ingrandendo, sfocata o no. Chi legge in rete supera intanto
 * la soglia dei pezzi e riceve il dettaglio vero.
 */
const MAX_MAGNIFICATION = 6;

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
  preferredLocalSize = null,
  onLocalSizeChange,
  onPageChange,
  onPageKept,
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
  const explainsSlowness = buildsImagesOnDemand(providerKey);
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
  /** Da dove è arrivata la pagina che si sta guardando, e a che misura. */
  const [pageOrigin, setPageOrigin] = useState<{
    source: ImageSource | null;
    size: string;
  } | null>(null);
  const [pageRequest, setPageRequest] = useState<CacheRequest | null>(null);
  /** Vero mentre la pagina aperta sta entrando nel deposito. */
  const [savingPage, setSavingPage] = useState(false);
  /**
   * La richiesta a schermo, leggibile da una promessa che finisce dopo.
   *
   * Conservare una pagina dura: nel frattempo si può voltare pagina, e senza
   * questo confronto l'esito veniva scritto sulla pagina nuova — che risultava
   * «sul computer» senza esserci.
   */
  const shownRequest = useRef<CacheRequest | null>(null);
  shownRequest.current = pageRequest;

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

  // Il messaggio spiega perché *questa* biblioteca è lenta: dirlo dove non è
  // vero — la francese, la vaticana — è una spiegazione sbagliata.
  const stillOpening = (!manifest && !manifestError) || pageLoading;
  useEffect(() => {
    if (!stillOpening) {
      setOpeningIsSlow(false);
      return;
    }
    if (!explainsSlowness) return;
    const timer = setTimeout(() => setOpeningIsSlow(true), SLOW_OPENING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stillOpening, explainsSlowness, manifestAttempt, currentIndex, pageAttempt]);

  /**
   * Quale misura di questo libro è sul computer, se c'è.
   *
   * Si rilegge anche a libro aperto: cancellare le pagine locali mentre si
   * legge non deve lasciare il visore convinto di averle ancora.
   */
  const refreshLocalSize = useCallback(async () => {
    const inventory = await versionInventory(versionId);
    setLocalSize(inventory ? readableSize(inventory, preferredLocalSize) : null);
  }, [versionId, preferredLocalSize]);

  useEffect(() => {
    let cancelled = false;
    void versionInventory(versionId).then((inventory) => {
      if (cancelled) return;
      setLocalSize(inventory ? readableSize(inventory, preferredLocalSize) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [versionId, preferredLocalSize]);

  useEffect(() => {
    onLocalSizeChange?.(localSize);
  }, [localSize, onLocalSizeChange]);

  useEffect(() => {
    let cancelled = false;
    setManifestError(null);
    void (async () => {
      try {
        const result = await fetchViewerManifestWithRetry(manifestUrl, providerKey, versionId);
        // Un motore che rispondesse con qualcosa senza `pages` non deve
        // restare a schermo come un caricamento infinito: è un errore, va
        // detto come tale.
        if (!result?.pages) throw new Error('manifesto senza pagine');
        if (cancelled) return;
        // La pagina di ripresa si legge **prima** di pubblicare l'indice:
        // pubblicarlo per primo faceva aprire la pagina uno mentre la lettura
        // era ancora in volo, e quella pagina uno finiva scritta al posto del
        // segno che si stava cercando.
        const lastPage = await getLastViewedPage(sourceId);
        if (cancelled) return;
        const validLast = lastPage !== null && lastPage < result.pages.length ? lastPage : 0;
        setCurrentIndex(validLast);
        setManifest(result);
      } catch (error) {
        if (cancelled) return;
        logger.error('library.viewer.manifestFailed', { message: errorMessage(error) });
        setManifestError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifestUrl, providerKey, sourceId, versionId, manifestAttempt]);

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
      maxZoomPixelRatio: MAX_MAGNIFICATION,
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
    // Finché non siamo stati noi ad aprire, quello che arriva riguarda ancora
    // la pagina di prima, che è rimasta a schermo: contarlo spegnerebbe la
    // rotella su un'immagine che non è quella chiesta.
    let opened = false;
    let announced = false;
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
      // Una grandezza sola, sempre la stessa: quella del deposito se il libro è
      // in casa, altrimenti il dimezzamento — che è una misura che la
      // biblioteca tiene pronta. Chiedere sempre la stessa cosa è anche il
      // motivo per cui riaprendo il libro la pagina si ritrova in casa invece
      // di essere richiesta di nuovo.
      const attempts = wholePageAttempts(page, localSize, buildsImagesOnDemand(providerKey));
      let bytes: Uint8Array | null = null;
      let request: CacheRequest | null = null;
      let lastFailure: unknown = null;
      for (const size of attempts) {
        const candidate: CacheRequest = {
          kind: 'page',
          versionId,
          index: page.index,
          size,
          remoteUrl: pageSourceUrl(page.imageService, size, manifest?.presentation2 ?? false),
          providerKey,
        };
        try {
          bytes = await pageImage(candidate, { priority: 'high', signal: controller.signal });
          request = candidate;
          break;
        } catch (error: unknown) {
          if (cancelled || controller.signal.aborted) throw error;
          lastFailure = error;
        }
      }
      if (!bytes || !request) throw lastFailure ?? new Error('pagina non servita');
      if (cancelled) return;
      setPageRequest({ ...request, providerKey: providerKey ?? 'generic' });
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
      // Da dove sono arrivati davvero quei byte lo sa solo il motore, e non
      // può viaggiare insieme a loro: si chiede subito dopo, sulla stessa
      // richiesta. Non arrivarci non è un guasto — si resta senza dirlo.
      void imageSource(request)
        .then((source) => {
          if (cancelled) return;
          setPageOrigin({ source, size: request.kind === 'page' ? request.size : '' });
          // Credevamo di leggere dal computer e la pagina è arrivata dalla
          // biblioteca: qualcuno ha cancellato quella copia mentre stavamo
          // leggendo. La pagina si vede comunque — il motore ha già ripiegato
          // da sé — ma l'inventario va riletto, o le prossime continuerebbero
          // a essere chieste come se il libro fosse ancora tutto in casa.
          if (localSize && source === 'network') {
            void refreshLocalSize();
          }
        })
        .catch((error: unknown) => {
          logger.debug('library.viewer.originUnknown', { message: errorMessage(error) });
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

    // Il suggerimento sui pezzi vale solo quando sono davvero i pezzi a non
    // arrivare: appiccicarlo a ogni guasto faceva leggere «la biblioteca non ha
    // restituito tutti i pezzi» anche a chi era andato in timeout prima che un
    // solo pezzo venisse chiesto.
    const givingUp = (error: unknown) => {
      if (cancelled) return;
      const message = errorMessage(error);
      logger.error('library.viewer.pageFailed', {
        message,
        index: page.index,
        ms: Math.round(performance.now() - openedAt),
      });
      setPageLoading(false);
      setPageError(message);
    };

    const handleTileLoaded = () => {
      if (cancelled || !opened) return;
      shown += 1;
      setPageLoading(false);
      setPageError(null);
      if (!announced) {
        announced = true;
        onPageChange?.({ index: currentIndex, label: page.label, total });
        void setLastViewedPage(sourceId, currentIndex).catch((error) => {
          logger.warn('library.viewer.lastPageSaveFailed', {
            message: errorMessage(error),
            index: currentIndex,
          });
        });
      }
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
    // La provenienza è di questa pagina: tenere quella di prima mentre la nuova
    // arriva la farebbe leggere come se valesse per l'immagine a schermo.
    setPageOrigin(null);
    setPageRequest(null);
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
  }, [
    page,
    providerKey,
    sourceId,
    versionId,
    localSize,
    manifest,
    currentIndex,
    pageAttempt,
    refreshLocalSize,
    onPageChange,
    total,
  ]);

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
      {manifest && total > 0 && thumbnailsOpen && (
        <div className="flex w-28 shrink-0 flex-col border-r border-editorial-border">
          <ThumbnailRail
            pages={manifest.pages}
            versionId={versionId}
            providerKey={providerKey}
            currentIndex={currentIndex}
            onSelect={goToIndex}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {manifest && total > 0 && (
          <ViewerToolbar
            fromDisk={localSize !== null}
            origin={pageOrigin}
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
            keepState={
              pageRequest?.kind !== 'page'
                ? 'unavailable'
                : pageOrigin?.source === 'vault'
                  ? 'saved'
                  : 'available'
            }
            // La misura non è quella delle impostazioni: è quella con cui la
            // pagina è arrivata, perché il comando riusa i byte già a schermo
            // senza chiederli di nuovo. Dirla evita di ritrovarsi una versione
            // locale a una misura che non si era scelta.
            keepSize={pageRequest?.kind === 'page' ? pageRequest.size : null}
            savingPage={savingPage}
            onDownloadPage={() => {
              const saved = pageRequest;
              if (!saved || saved.kind !== 'page') return;
              setSavingPage(true);
              void keepViewerPage(saved)
                .then(() => {
                  // Se nel frattempo si è voltata pagina, la provenienza a
                  // schermo riguarda un'altra immagine e non si tocca: quello
                  // che è finito nel deposito lo dice l'inventario.
                  if (sameRequest(shownRequest.current, saved)) {
                    setPageOrigin({ source: 'vault', size: saved.size });
                  }
                  void refreshLocalSize();
                  onPageKept?.();
                  toast.success(t('areas.library.viewerPageDownloaded'));
                })
                .catch((error: unknown) => {
                  toast.error(t('areas.library.viewerPageDownloadFailed'), {
                    description: errorMessage(error),
                  });
                })
                .finally(() => setSavingPage(false));
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
              <EmptyState
                icon={<Images size={28} />}
                message={t('areas.library.viewerLoadError')}
                hint={t('areas.library.viewerLoadErrorHint')}
              />
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
                label={t('areas.library.viewerOpeningPage', { index: currentIndex + 1 })}
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
                hint={
                  pageError === TILE_LOAD_FAILED
                    ? t('areas.library.viewerTileLoadErrorHint')
                    : t('areas.library.viewerLoadErrorHint')
                }
              />
              <IconButton size="sm" onClick={() => setPageAttempt((n) => n + 1)} title={t('areas.library.viewerRetry')}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ViewerToolbarProps {
  /** Vero quando la pagina viene letta dal computer e non dalla biblioteca. */
  fromDisk: boolean;
  /** Da dove arriva la pagina a schermo, quando il motore l'ha detto. */
  origin: { source: ImageSource | null; size: string } | null;
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
  /**
   * Cosa si può fare con la pagina a schermo: prenderla, niente perché non è
   * ancora aperta, oppure niente perché è già in casa. Un booleano solo
   * confondeva «non si può» con «è già fatto», e durante ogni apertura il
   * comando dichiarava sul computer una pagina appena chiesta alla biblioteca.
   */
  keepState: 'unavailable' | 'available' | 'saved';
  /** La misura con cui la pagina a schermo è arrivata, cioè quella con cui
   *  verrebbe conservata. */
  keepSize: string | null;
  /** Vero mentre la pagina aperta sta entrando nel deposito. */
  savingPage: boolean;
  onDownloadPage: () => void;
  thumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
}

/**
 * Da dove arriva **la pagina che si sta guardando**, e a che misura.
 *
 * Tre provenienze, che vanno dette diverse: il deposito sul computer, la
 * memoria di lavoro, la biblioteca. Dire «Online» sfogliando dal disco era
 * falso; dire «Dal computer» per una pagina ripresa dalla memoria di lavoro di
 * un libro che non possiedi lo è altrettanto. Il verde acceso vale solo per la
 * biblioteca, e significa che ha risposto da poco.
 *
 * Finché la provenienza non è nota si dice quello che si sa: se il libro è sul
 * disco, il disco.
 */
function ConnectionBadge({
  fromDisk,
  origin,
}: {
  fromDisk: boolean;
  origin: { source: ImageSource | null; size: string } | null;
}) {
  const { t } = useTranslation();
  const lastAnswerAt = useNetworkActivity((state) => state.lastAnswerAt);
  const [now, setNow] = useState(() => Date.now());
  const source = origin?.source ?? (fromDisk ? 'vault' : null);
  const fromLibrary = source === 'network';

  useEffect(() => {
    // L'orologio serve solo a spegnere il verde quando la biblioteca smette di
    // rispondere: quello che è già in casa non ha niente da spegnere.
    if (!fromLibrary) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [fromLibrary]);

  const answeredRecently = lastAnswerAt !== null && now - lastAnswerAt <= ONLINE_FOR_MS;
  const lit = fromLibrary && answeredRecently;
  const label =
    source === 'vault'
      ? t('areas.library.viewerFromDisk')
      : source === 'cache'
        ? t('areas.library.viewerFromMemory')
        : source === 'network'
          ? t('areas.library.viewerFromLibrary')
          : t('areas.library.viewerOnline');

  return (
    <Tooltip
      label={origin ? t('areas.library.viewerOriginSize', { size: origin.size }) : label}
      side="bottom"
    >
      <span
        className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${lit ? 'text-editorial-success' : 'text-editorial-muted'}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${lit ? 'bg-editorial-success' : 'bg-editorial-border'}`}
          aria-hidden="true"
        />
        {label}
      </span>
    </Tooltip>
  );
}

function ViewerToolbar({
  fromDisk,
  origin,
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
  keepState,
  keepSize,
  savingPage,
  onDownloadPage,
  thumbnailsOpen,
  onToggleThumbnails,
}: ViewerToolbarProps) {
  const { t } = useTranslation();
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-editorial-border px-3">
      <IconButton
        size="sm"
        onClick={onToggleThumbnails}
        ariaPressed={thumbnailsOpen}
        title={t(thumbnailsOpen ? 'areas.library.viewerHideThumbnails' : 'areas.library.viewerShowThumbnails')}
      >
        {thumbnailsOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
      </IconButton>
      <span className="h-5 w-px shrink-0 bg-editorial-border" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-1">
        <IconButton size="sm" onClick={onPrev} disabled={index <= 0} title={t('areas.library.viewerPrevPage')}>
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton size="sm" onClick={onNext} disabled={index >= total - 1} title={t('areas.library.viewerNextPage')}>
          <ChevronRight size={14} />
        </IconButton>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <form
          className="shrink-0"
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
        <span className="truncate text-xs text-editorial-muted">
          {t('areas.library.viewerPageOf', { index: index + 1, total })}
          {label ? ` · ${label}` : ''}
        </span>
      </div>

      {/* La provenienza è uno stato, non un comando: sta in mezzo, fra il
          contesto a sinistra e i comandi a destra. */}
      <div className="mx-auto shrink-0">
        <ConnectionBadge fromDisk={fromDisk} origin={origin} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <PageKeepButton
          saving={savingPage}
          state={keepState}
          size={keepSize}
          onDownload={onDownloadPage}
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-editorial-border" aria-hidden="true" />
        <IconButton size="sm" onClick={onZoomOut} title={t('areas.library.viewerZoomOut')}>
          <ZoomOut size={14} />
        </IconButton>
        <IconButton size="sm" onClick={onZoomIn} title={t('areas.library.viewerZoomIn')}>
          <ZoomIn size={14} />
        </IconButton>
        <ClickPopover
          open={zoomMenuOpen}
          onOpenChange={setZoomMenuOpen}
          trigger={
            <IconButton
              size="sm"
              ariaPressed={zoomMenuOpen}
              title={t('areas.library.viewerZoomMore')}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          }
        >
          <div className="min-w-44 py-1">
            <MenuActionRow
              icon={<Maximize size={14} />}
              label={t('areas.library.viewerZoomToFit')}
              onClick={() => {
                setZoomMenuOpen(false);
                onZoomToFit();
              }}
            />
            <MenuActionRow
              icon={<Focus size={14} />}
              label={t('areas.library.viewerZoomActualSize')}
              onClick={() => {
                setZoomMenuOpen(false);
                onZoomToActualSize();
              }}
            />
          </div>
        </ClickPopover>
      </div>
    </div>
  );
}

/**
 * Il comando che conserva sul computer la pagina aperta, e che dice in che
 * punto di quel gesto si è: da prendere, in corso, già in casa.
 *
 * Quando la pagina è già nel deposito non è più un comando spento — un pulsante
 * disabilitato non distingue «non si può» da «è già fatto» — ma uno stato, con
 * il suo colore e la sua frase. Riscaricare una pagina che c'è già è un'altra
 * funzione, e arriva con i comandi della singola pagina.
 */
function PageKeepButton({
  saving,
  state,
  size,
  onDownload,
}: {
  saving: boolean;
  state: 'unavailable' | 'available' | 'saved';
  size: string | null;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const sizeLabel = size ? resolutionLabel(size, t) : null;

  if (saving) {
    return (
      <IconButton size="sm" disabled title={t('areas.library.viewerPageSaving')}>
        <Loader2 size={14} className="animate-spin" />
      </IconButton>
    );
  }

  if (state === 'saved') {
    // La misura serve anche qui: sapere *quale* versione locale contiene questa
    // pagina è la differenza fra «ce l'ho» e «ce l'ho a quella giusta».
    const label = sizeLabel
      ? t('areas.library.viewerPageOnComputerAt', { size: sizeLabel })
      : t('areas.library.viewerPageOnComputer');
    return (
      <Tooltip label={label} side="bottom">
        <span
          role="status"
          aria-label={label}
          className="flex h-7 w-7 items-center justify-center text-editorial-success"
        >
          <HardDriveDownload size={14} />
        </span>
      </Tooltip>
    );
  }

  return (
    <IconButton
      size="sm"
      onClick={onDownload}
      disabled={state === 'unavailable'}
      title={
        sizeLabel
          ? t('areas.library.viewerDownloadPageAt', { size: sizeLabel })
          : t('areas.library.viewerDownloadPage')
      }
    >
      <Download size={14} />
    </IconButton>
  );
}

/** Due richieste che parlano della stessa immagine alla stessa misura. */
function sameRequest(current: CacheRequest | null, other: CacheRequest): boolean {
  if (!current || current.kind !== 'page' || other.kind !== 'page') return false;
  return (
    current.versionId === other.versionId &&
    current.index === other.index &&
    current.size === other.size
  );
}
