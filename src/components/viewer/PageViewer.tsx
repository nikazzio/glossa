/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- La superficie deep-zoom è intenzionalmente un widget ARIA application: riceve focus e gestisce le frecce, mentre i controlli figli e la tela OSD conservano la propria tastiera. */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import OpenSeadragon from 'openseadragon';
import { useTranslation } from 'react-i18next';
import { Images, RefreshCw } from 'lucide-react';
import { EmptyState, IconButton, Spinner } from '../ui';
import { ThumbnailRail } from './ThumbnailRail';
import { ViewerToolbar } from './ViewerToolbar';
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
import { libraryPageUrl } from '../../services/libraryLinks';
import { versionInventory, type VersionInventory } from '../../services/inventoryService';
import { errorMessage, logger } from '../../utils/logger';
import { networkErrorHintKey } from '../../services/viewerErrorHint';

/** Dove si è arrivati nel libro, per chi sta fuori dal visore. */
export interface ViewerPagePosition {
  index: number;
  label: string | null;
  total: number;
  /** L'immagine di questa pagina come la serve la biblioteca, alla misura con
   *  cui è stata chiesta: fuori dal visore serve per darne l'indirizzo. */
  imageUrl: string | null;
  /** Il servizio immagini di questa pagina e la versione del formato: con
   *  questi due la scheda costruisce da sé la richiesta a qualunque misura,
   *  senza dover chiedere al visore di scaricare per conto suo. */
  imageService: string;
  presentation2: boolean;
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
  /** Avvisa chi ospita il visore che una pagina diversa da quella mostrata è
   *  in caricamento o ha appena fallito: senza, un riquadro che tiene i dati
   *  dell'ultima pagina riuscita non saprebbe che non sono più quelli giusti.
   *  `null` quando la pagina mostrata e quella richiesta tornano a coincidere. */
  onPageStatusChange?: (status: PageStatus | null) => void;
  /** Comanda una pagina dall'esterno (es. si torna alla fonte principale
   *  dopo averla sfogliata da sola): cambia `requestToken` anche per
   *  richiedere di nuovo la stessa pagina, altrimenti l'effetto non
   *  scatterebbe una seconda volta. */
  requestedIndex?: number | null;
  requestToken?: number;
  onRequestedIndexHandled?: () => void;
  /** Comandi propri di chi ospita il visore (es. cambio fonte), nella stessa
   *  barra del visore invece che in una riga a parte. */
  extraControls?: ReactNode;
}

/** Cosa sta succedendo a una pagina diversa da quella confermata a schermo:
 *  la si sta apre, o si è appena arresa. `message` è quanto arrivato dal
 *  motore, nello stesso formato che `networkErrorHintKey` sa leggere. */
export type PageStatus =
  | { index: number; state: 'loading' }
  | { index: number; state: 'error'; message: string };

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
  onPageStatusChange,
  requestedIndex = null,
  requestToken = 0,
  onRequestedIndexHandled,
  extraControls,
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
  /**
   * Leggere solo quello che è sul computer.
   *
   * Non è un'impostazione salvata: vale per il libro aperto e si spegne
   * chiudendolo. Tecnicamente basta non dare alla richiesta l'indirizzo remoto:
   * il motore prova deposito e memoria di lavoro e poi si ferma, invece di
   * andare a chiedere la pagina alla biblioteca.
   */
  const [localOnly, setLocalOnly] = useState(false);
  /**
   * Il lato lungo, in pixel, dell'immagine che si sta guardando.
   *
   * Non coincide più con la misura chiesta: quando sul computer c'è una copia
   * più grande viene servita com'è. Lo si legge dall'immagine aperta, che è
   * l'unico posto dove il numero è vero.
   */
  const [shownEdge, setShownEdge] = useState<number | null>(null);
  /**
   * La richiesta a schermo, leggibile da una promessa che finisce dopo.
   *
   * Conservare una pagina dura: nel frattempo si può voltare pagina, e senza
   * questo confronto l'esito veniva scritto sulla pagina nuova — che risultava
   * «sul computer» senza esserci.
   */
  const shownRequest = useRef<CacheRequest | null>(null);
  shownRequest.current = pageRequest;
  /**
   * Chi vuole sapere a che pagina siamo, senza far parte delle dipendenze.
   *
   * La scheda dell'opera passa una funzione scritta sul posto: cambia identità
   * a ogni suo ridisegno — per esempio **cambiando linguetta** — e averla fra
   * le dipendenze dell'apertura faceva ricaricare da capo la pagina che si
   * stava già guardando.
   */
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onPageStatusChangeRef = useRef(onPageStatusChange);
  onPageStatusChangeRef.current = onPageStatusChange;

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
    setLocalOnly(false);
    onPageStatusChangeRef.current?.(null);
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
  // Il visore della biblioteca aperto su **questa** pagina. Non l'immagine
  // grezza: chi esce vuole vedere la pagina dove la biblioteca la mostra, con
  // il suo sfoglio e i suoi dati. Esiste solo dove la forma dell'indirizzo è
  // stata verificata, e dove manca non si mostra niente.
  const shownPageUrl = libraryPageUrl(providerKey, manifestUrl, currentIndex);
  const total = manifest?.pages.length ?? 0;
  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setCurrentIndex(index);
    },
    [total],
  );

  // Salto comandato da chi ospita il visore (es. si torna sulla fonte
  // principale dopo averla sfogliata da sola): `requestToken` cambia anche a
  // parità di pagina, per far scattare l'effetto pure quando si richiede la
  // stessa pagina già mostrata.
  const goToIndexRef = useRef(goToIndex);
  goToIndexRef.current = goToIndex;
  const onRequestedIndexHandledRef = useRef(onRequestedIndexHandled);
  onRequestedIndexHandledRef.current = onRequestedIndexHandled;
  useEffect(() => {
    if (requestedIndex === null) return;
    // Il manifesto può ancora essere in arrivo (`total` a 0): la richiesta
    // resta in attesa invece di scartarla, altrimenti un visore appena
    // montato non raggiunge mai la pagina del testo.
    if (total === 0) return;
    goToIndexRef.current(requestedIndex);
    onRequestedIndexHandledRef.current?.();
    // Scatta su richiesta nuova (requestToken) o non appena il manifesto
    // arriva (total), non a ogni cambio di `requestedIndex` da solo: chi lo
    // aggiorna deve anche cambiare il token, altrimenti non è una richiesta
    // nuova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestToken, total]);

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
          remoteUrl: localOnly
            ? undefined
            : pageSourceUrl(page.imageService, size, manifest?.presentation2 ?? false),
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
      viewer.addOnceHandler('open', () => {
        if (cancelled) return;
        const size = viewer.world.getItemAt(0)?.getContentSize();
        if (size) setShownEdge(Math.round(Math.max(size.x, size.y)));
      });
      viewer.open({ type: 'image', url: objectUrl } as unknown as OpenSeadragon.TileSourceSpecifier);
      logger.info('library.viewer.wholePageShown', {
        sourceId,
        versionId,
        index: page.index,
        size: request.kind === 'page' ? request.size : '',
        bytes: bytes.byteLength,
        ms: Math.round(performance.now() - openedAt),
        local: Boolean(localSize),
        localOnly,
      });
      // Da dove sono arrivati davvero quei byte lo sa solo il motore, e non
      // può viaggiare insieme a loro: si chiede subito dopo, sulla stessa
      // richiesta. Non arrivarci non è un guasto — si resta senza dirlo.
      void imageSource(request)
        .then((source) => {
          if (cancelled) return;
          setPageOrigin({ source, size: request.kind === 'page' ? request.size : '' });
          logger.info('library.viewer.pageOrigin', {
            sourceId,
            versionId,
            index: page.index,
            size: request.kind === 'page' ? request.size : '',
            from: source ?? 'unknown',
          });
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
      onPageStatusChangeRef.current?.({ index: currentIndex, state: 'error', message });
    };

    const handleTileLoaded = () => {
      if (cancelled || !opened) return;
      shown += 1;
      setPageLoading(false);
      setPageError(null);
      onPageStatusChangeRef.current?.(null);
      if (!announced) {
        announced = true;
        onPageChangeRef.current?.({
          index: currentIndex,
          label: page.label,
          total,
          // La misura è quella con cui la pagina è stata davvero chiesta;
          // finché non lo si sa, quella che il visore chiederebbe.
          imageUrl: pageSourceUrl(
            page.imageService,
            shownRequest.current?.kind === 'page'
              ? shownRequest.current.size
              : wholePageAttempts(page, null, buildsImagesOnDemand(providerKey))[0],
            manifest?.presentation2 ?? false,
          ),
          imageService: page.imageService,
          presentation2: manifest?.presentation2 ?? false,
        });
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
    onPageStatusChangeRef.current?.({ index: currentIndex, state: 'loading' });
    // La provenienza è di questa pagina: tenere quella di prima mentre la nuova
    // arriva la farebbe leggere come se valesse per l'immagine a schermo.
    setPageOrigin(null);
    setPageRequest(null);
    setShownEdge(null);
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
    localOnly,
    manifest,
    currentIndex,
    pageAttempt,
    refreshLocalSize,
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
        {((manifest && total > 0) || extraControls) && (
          <ViewerToolbar
            fromDisk={localSize !== null}
            origin={pageOrigin}
            shownEdge={shownEdge}
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
            localOnly={localOnly}
            onToggleLocalOnly={() => {
              logger.info('library.viewer.localOnlyChanged', { sourceId, localOnly: !localOnly });
              setLocalOnly(!localOnly);
            }}
            thumbnailsOpen={thumbnailsOpen}
            onToggleThumbnails={() => setThumbnailsOpen((open) => !open)}
            shownPageUrl={shownPageUrl}
            extraControls={extraControls}
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
                size={16}
                label={t('areas.library.viewerOpeningPage', { index: currentIndex + 1 })}
                className="flex items-center gap-2 rounded bg-surface-panel/90 px-3 py-1.5 text-sm text-editorial-muted shadow"
              />
              {openingIsSlow && (
                <p className="max-w-xs rounded bg-surface-panel/90 px-3 py-1.5 text-center text-sm text-editorial-muted shadow">
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
                  localOnly
                    ? t('areas.library.viewerNotLocal')
                    : pageError === TILE_LOAD_FAILED
                      ? t('areas.library.viewerTileLoadErrorHint')
                      : t(networkErrorHintKey(pageError ?? '') ?? 'areas.library.viewerLoadErrorHint')
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
