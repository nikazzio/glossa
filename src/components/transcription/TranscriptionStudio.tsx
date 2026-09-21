import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileInput,
  FileText,
  History,
  Images,
  Info,
  Link2,
  Loader2,
  Lock,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlink2,
  User,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MarkdownEditor, PanelTransitionVeil } from '../common';
import { ClickPopover, IconButton, IconLink, InspectorShell, MenuActionRow, Spinner, StatRow } from '../ui';
import { PageViewer, type PageStatus } from '../viewer/PageViewer';
import { DocumentViewer } from '../viewer/DocumentViewer';
import { CopyProvenance } from '../workspace/CopyProvenance';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useDebounce } from '../../hooks/useDebounce';
import { useUiStore } from '../../stores/uiStore';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import { confirm } from '../../stores/confirmStore';
import { getLibrarySourceDetail, getVersionForViewer, type ViewerVersionRef } from '../../services/libraryService';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { versionInventory } from '../../services/inventoryService';
import { logger } from '../../utils/logger';
import { computeSyncState } from './transcriptionSync';
import {
  ensureSegment,
  getSegmentByPosition,
  listRevisions,
  restoreRevision,
  saveSegmentText,
  setDocumentStatus,
  unverifySegment,
  verifySegment,
  type TranscriptionRevision,
  type TranscriptionSegment,
} from '../../services/transcriptionService';

const SAVE_DELAY_MS = 800;
const INSPECTOR_COLLAPSED = 56;
const INSPECTOR_MIN = 300;
const INSPECTOR_MAX = 520;
const VIEWER_MIN = 280;
const VIEWER_MAX = 1400;
const TEXT_MIN = 280;
/** Proporzione al primo apertura, prima che l'utente sposti il divisore: 3/5
 *  visore, 2/5 testo. */
const VIEWER_DEFAULT_RATIO = '60%';
/** Altezza della barra di intestazione del testo: la stessa di
 *  `ViewerToolbar` a sinistra, così le due colonne partono allineate. */
const TEXT_HEADER_HEIGHT = 'h-12';

function clampWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

interface TranscriptionStudioProps {
  documentId: string;
  workspaceId: string | null;
  onBack: () => void;
}

/** Quanto serve per la riga dell'opera in alto — stessa forma della scheda
 *  opera in Biblioteca, letta una volta sola per `sourceId`, non a ogni
 *  cambio pagina. */
interface BookHeaderInfo {
  title: string;
  creatorDate: string;
  pageUrl: string | null;
  providerLabel: string | undefined;
}

/**
 * Studio di trascrizione (#388): visore a sinistra — zoom/pan della pagina
 * collegata, riuso di `PageViewer`/`DocumentViewer` già scritti per la scheda
 * opera in Biblioteca; un documento nato senza digitalizzazione mostra un
 * avviso al posto suo — testo al centro, strumenti a destra. Filtri visuali,
 * preset e cambio fonte restano il resto di #221.
 *
 * **Un segmento per pagina**, non uno per documento: cambiare pagina nel
 * visore cambia il testo mostrato, ancorato a quella posizione
 * (`transcription_segments.position`, non ancora `source_page_id` — quella
 * riga esiste solo dopo uno scaricamento, il visore la mostra anche prima).
 * Un documento senza visore (nato da zero) resta su un solo blocco di testo,
 * in posizione 0.
 */
export function TranscriptionStudio({ documentId, workspaceId, onBack }: TranscriptionStudioProps) {
  const { t, i18n } = useTranslation();
  const detail = useTranscriptionStore((s) => s.detail);
  const loadDetail = useTranscriptionStore((s) => s.loadDetail);

  const [segment, setSegment] = useState<TranscriptionSegment | null>(null);
  const [revisions, setRevisions] = useState<TranscriptionRevision[]>([]);
  const [loadingSegment, setLoadingSegment] = useState(true);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'assist' | 'metadata'>('history');
  const [textMenuOpen, setTextMenuOpen] = useState(false);
  const [viewerRef, setViewerRef] = useState<ViewerVersionRef | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [bookInfo, setBookInfo] = useState<BookHeaderInfo | null>(null);
  const [removingDocument, setRemovingDocument] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // Cambio fonte immagini/PDF: la copia con cui il documento è nato resta
  // "principale" per sempre; l'altra, quando c'è, è "secondaria" e potrebbe
  // non promettere la stessa numerazione di pagina — vedi transcriptionSync.ts.
  const [siblingVersion, setSiblingVersion] = useState<ViewerVersionRef | null>(null);
  const [siblingPageCount, setSiblingPageCount] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<'main' | 'sibling'>('main');
  /** Interruttore manuale: stacca l'aggancio testo↔visore a prescindere dal
   *  calcolo automatico, anche sulla principale — chiesto esplicitamente per
   *  poter curiosare una pagina senza spostare il punto in cui si scrive. */
  const [manualUnlinked, setManualUnlinked] = useState(false);
  const [jumpRequest, setJumpRequest] = useState<{ index: number; token: number } | null>(null);

  // La pagina mostrata a sinistra: un documento senza visore resta sempre a
  // 0, l'unico blocco di testo che ha senso per lui.
  const [pageIndex, setPageIndex] = useState(0);
  const [pageLabel, setPageLabel] = useState<string | null>(null);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  /** La pagina richiesta è in corso o è appena fallita: stesso segnale che
   *  la scheda opera in Biblioteca usa già, qui applicato al testo e allo
   *  storico invece che ai dati tecnici della copia. */
  const [pendingStatus, setPendingStatus] = useState<PageStatus | null>(null);

  const debouncedDraft = useDebounce(draft, SAVE_DELAY_MS);
  const savedRef = useRef('');
  const attemptRef = useRef<string | null>(null);
  // Un salvataggio in corso quando si cambia pagina non deve scrivere il suo
  // risultato sullo stato della pagina nuova, arrivato nel frattempo.
  const pageIndexRef = useRef(pageIndex);
  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);

  const inspectorWidth = useUiStore((state) => state.transcriptionInspectorWidth);
  const setInspectorWidth = useUiStore((state) => state.setTranscriptionInspectorWidth);
  const viewerWidth = useUiStore((state) => state.transcriptionViewerWidth);
  const setViewerWidth = useUiStore((state) => state.setTranscriptionViewerWidth);
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [viewerPanel, setViewerPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  // Chiuso di default a ogni apertura dello Studio: solo la larghezza si
  // ricorda fra le sessioni, non se il pannello era aperto o chiuso.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const initialInspectorWidth = useRef(clampWidth(inspectorWidth || 380, INSPECTOR_MIN, INSPECTOR_MAX));
  const initialViewerSize = useRef<number | string>(
    viewerWidth > 0 ? clampWidth(viewerWidth, VIEWER_MIN, VIEWER_MAX) : VIEWER_DEFAULT_RATIO,
  );

  useEffect(() => {
    void loadDetail(documentId);
  }, [documentId, loadDetail]);

  // Il documento può nascere legato a una digitalizzazione della Biblioteca
  // (creato dalla scheda dell'opera) oppure no (creato da zero in
  // Trascrizioni): solo nel primo caso c'è una pagina da mostrare a sinistra.
  useEffect(() => {
    const sourceVersionId = detail?.source_version_id ?? null;
    if (!sourceVersionId) {
      setViewerRef(null);
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
  }, [detail?.source_version_id]);

  // Titolo e autore dell'opera, come nella scheda opera in Biblioteca: letti
  // una volta per opera (non per pagina), il visore può cambiare pagina
  // migliaia di volte senza rileggere niente qui.
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
    Promise.all([getLibrarySourceDetail(viewerRef.sourceId), listIIIFProviders()])
      .then(([sourceDetail, providers]) => {
        if (cancelled) return;
        setBookInfo({
          title: sourceDetail.source.title,
          creatorDate: [sourceDetail.creator, sourceDetail.date].filter(Boolean).join(' · '),
          pageUrl: sourceDetail.pageUrl ?? sourceDetail.catalogUrl,
          providerLabel: providers.find((p) => p.key === viewerRef.providerKey)?.label,
        });

        // La copia dell'altro tipo, se c'è: stessa opera, non la principale,
        // leggibile (manifest o PDF con indirizzo). Al massimo una per tipo
        // interessa qui — cambiarla di nuovo resta un caso raro.
        const sibling = sourceDetail.versions.find(
          (version) =>
            version.id !== viewerRef.versionId &&
            (version.versionKind === 'iiif_manifest' || version.versionKind === 'pdf') &&
            version.sourceUrl,
        );
        if (!sibling) {
          setSiblingVersion(null);
          setSiblingPageCount(null);
          return;
        }
        // Stessa risoluzione robusta della principale (`getVersionForViewer`):
        // la chiave della biblioteca scritta nei metadati della copia può
        // mancare (es. PDF registrato prima che questo campo esistesse), ma
        // il deposito la sa sempre. Con la chiave sbagliata il visore non
        // apre niente e lo sgancio manuale resta l'unica via d'uscita.
        getVersionForViewer(sibling.id)
          .then((resolved) => { if (!cancelled) setSiblingVersion(resolved); })
          .catch((error: unknown) => {
            logger.error('transcription.siblingVersion.loadFailed', { versionId: sibling.id, error });
            if (!cancelled) setSiblingVersion(null);
          });
        if (sibling.versionKind === 'iiif_manifest') {
          // Pagine dichiarate dal manifesto: stesso campo che la scheda
          // opera mostra, niente lettura in più.
          setSiblingPageCount(sibling.expectedPages);
        } else {
          // Per il PDF conta il file arrivato, non una dichiarazione: letto
          // una volta allo scaricamento, qui si rilegge solo quel dato.
          versionInventory(sibling.id)
            .then((inventory) => { if (!cancelled) setSiblingPageCount(inventory?.document?.pages ?? null); })
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

  const handleRemoveDocument = async () => {
    const ok = await confirm({
      title: t('transcription.confirmDeleteTitle'),
      message: t('transcription.confirmDeleteMessage', { name: detail?.title ?? '' }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setRemovingDocument(true);
    try {
      await setDocumentStatus(documentId, 'trashed');
      toast.success(t('transcription.deleted'));
      onBack();
    } catch (err: unknown) {
      toast.error(t('transcription.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemovingDocument(false);
    }
  };

  const loadSegmentForPage = useCallback(async () => {
    setLoadingSegment(true);
    try {
      const existing = await getSegmentByPosition(documentId, pageIndex);
      const history = existing ? await listRevisions(existing.id) : [];
      setSegment(existing);
      setRevisions(history);
      const currentText = history[0]?.text ?? '';
      setDraft(currentText);
      savedRef.current = currentText;
      attemptRef.current = null;
      setSaveState('saved');
    } catch (err: unknown) {
      toast.error(t('transcription.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingSegment(false);
    }
  }, [documentId, pageIndex, t]);

  useEffect(() => { void loadSegmentForPage(); }, [loadSegmentForPage]);

  const save = useCallback(
    async (text: string) => {
      const savingPage = pageIndex;
      attemptRef.current = text;
      setSaveState('saving');
      try {
        // Sfogliare pagine mai trascritte non crea righe vuote: il segmento
        // nasce solo al primo salvataggio davvero.
        const target = segment ?? await ensureSegment(documentId, savingPage, pageLabel);
        // Nel frattempo si è già cambiata pagina (salvataggio lanciato
        // all'uscita, prima del debounce): il suo risultato non riguarda più
        // quello che si vede adesso.
        if (pageIndexRef.current !== savingPage) return;
        if (!segment) setSegment(target);
        const revision = await saveSegmentText(target.id, text, 'user');
        if (pageIndexRef.current !== savingPage) return;
        savedRef.current = text;
        if (attemptRef.current === text) setSaveState('saved');
        if (revision) setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
      } catch {
        if (pageIndexRef.current === savingPage && attemptRef.current === text) setSaveState('error');
      }
    },
    [segment, documentId, pageIndex, pageLabel],
  );

  useEffect(() => {
    if (loadingSegment) return;
    if (debouncedDraft === savedRef.current) return;
    if (attemptRef.current === debouncedDraft) return;
    void save(debouncedDraft);
  }, [debouncedDraft, save, loadingSegment]);

  const { aligned, synced } = computeSyncState({
    activeSource,
    manualUnlinked,
    mainPageTotal: pageTotal,
    siblingPageCount,
  });

  /** Il visore ha disegnato un'altra pagina davvero (non solo richiesta): se
   *  quella che si lascia ha testo non ancora salvato, lo si salva subito —
   *  aspettare il debounce lo perderebbe cambiando pagina in fretta.
   *
   *  Fuori sincronia il visore sfoglia per conto suo: i suoi eventi non
   *  toccano più la pagina di testo, che si sposta solo con le frecce
   *  indipendenti. */
  const handleViewerPageChange = useCallback(
    (index: number, label: string | null, total: number | null) => {
      if (!synced) return;
      if (draft !== savedRef.current) void save(draft);
      setPageIndex(index);
      setPageLabel(label);
      setPageTotal(total);
      setPendingStatus(null);
    },
    [draft, save, synced],
  );

  // Tornando in sincronia (si rientra sulla principale, o si riallinea la
  // secondaria) il visore attivo salta dove sta il testo: senza, resterebbe
  // dov'era rimasto sfogliando da solo.
  const wasSyncedRef = useRef(synced);
  useEffect(() => {
    if (synced && !wasSyncedRef.current) {
      setJumpRequest({ index: pageIndex, token: Date.now() });
    }
    wasSyncedRef.current = synced;
  }, [synced, pageIndex]);

  const handleVerify = async () => {
    if (!segment) return;
    setVerifying(true);
    try {
      const revision = await verifySegment(segment.id, workspaceId);
      setSegment({ ...segment, approved_revision_id: revision.id });
      toast.success(t('transcription.verified'));
    } catch (err: unknown) {
      toast.error(t('transcription.verifyFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleUnverify = async () => {
    if (!segment) return;
    setVerifying(true);
    try {
      await unverifySegment(segment.id, workspaceId);
      setSegment({ ...segment, approved_revision_id: null });
    } catch (err: unknown) {
      toast.error(t('transcription.verifyFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleRestore = async (revisionId: string) => {
    if (!segment) return;
    try {
      const revision = await restoreRevision(segment.id, revisionId);
      setDraft(revision.text);
      savedRef.current = revision.text;
      setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
      toast.success(t('transcription.restored'));
    } catch (err: unknown) {
      toast.error(t('transcription.restoreFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Il pannello destro nasce chiuso: l'unica cosa che si ricorda è la sua
  // larghezza, per quando l'utente lo riapre.
  useEffect(() => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    inspectorPanel.collapse();
  }, [inspectorPanel]);

  const persistInspectorLayout = () => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    const px = Math.round(inspectorPanel.getSize().inPixels);
    if (px !== inspectorWidth) setInspectorWidth(px);
  };
  const persistViewerLayout = () => {
    if (!viewerPanel) return;
    const px = Math.round(viewerPanel.getSize().inPixels);
    if (px !== viewerWidth) setViewerWidth(px);
  };
  const syncInspectorCollapsed = () => {
    setInspectorCollapsed(inspectorPanel?.isCollapsed() ?? false);
  };
  const toggleInspectorCollapsed = (next: boolean) => {
    if (!inspectorPanel) return;
    if (next) inspectorPanel.collapse();
    else inspectorPanel.expand();
    setInspectorCollapsed(next);
  };

  const isVerified = Boolean(segment?.approved_revision_id);
  // Il numero mostrato segue subito la pagina scelta, non quella ancora
  // confermata: la stessa convenzione della scheda opera in Biblioteca. Fuori
  // sincronia il visore sfoglia per conto suo: il suo stato di caricamento
  // non riguarda più la pagina di testo mostrata qui.
  const displayIndex = synced ? pendingStatus?.index ?? pageIndex : pageIndex;
  const isPagePending = synced && pendingStatus?.state === 'loading';
  const pagePendingError = synced && pendingStatus?.state === 'error' ? pendingStatus.message : null;
  const pageTitle =
    viewerRef && pageTotal
      ? t('areas.library.viewerPageOf', { index: displayIndex + 1, total: pageTotal })
      : viewerRef
        ? t('transcription.pageTitle', { n: displayIndex + 1 })
        : t('transcription.paneLabel');
  const formatDate = (value: string) => {
    // `value` è già ISO (revisione appena scritta, in attesa della rilettura
    // dal database) oppure "AAAA-MM-GG HH:MM:SS" di SQLite, sempre UTC. Solo
    // la seconda forma va completata: aggiungere "Z" alla prima produceva due
    // fusi orari sulla stessa stringa e una data non finita.
    const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
    return new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  };

  const revisionAuthorIcon = { user: User, ocr: ScanText, import: FileInput } as const;

  const displayedVersion = activeSource === 'main' ? viewerRef : siblingVersion;
  const sourceIcon = (kind: ViewerVersionRef['versionKind']) => (kind === 'pdf' ? FileText : Images);
  const sourceLabelKey = (kind: ViewerVersionRef['versionKind'], forAligned: boolean) =>
    kind === 'pdf'
      ? forAligned ? 'transcription.sourcePdf' : 'transcription.sourcePdfUnaligned'
      : forAligned ? 'transcription.sourceImages' : 'transcription.sourceImagesUnaligned';
  // Comandi del cambio fonte: stessa barra del visore (accanto a "leggi solo
  // file locali"), non una riga a parte. Il cambio fonte compare solo con
  // una secondaria; lo sgancio manuale sempre, anche con una copia sola —
  // può tornare comodo curiosare senza spostare il punto di scrittura.
  const sourceSwitchControls = viewerRef && (
    <div className="flex items-center gap-1">
      {siblingVersion && (
        <>
          {(['main', 'sibling'] as const).map((source) => {
            const version = source === 'main' ? viewerRef : siblingVersion;
            const Icon = sourceIcon(version.versionKind);
            return (
              <IconButton
                key={source}
                size="sm"
                tone={activeSource === source ? 'accent' : 'default'}
                ariaPressed={activeSource === source}
                onClick={() => setActiveSource(source)}
                title={t(sourceLabelKey(version.versionKind, aligned))}
              >
                <Icon size={14} />
              </IconButton>
            );
          })}
        </>
      )}
      <IconButton
        size="sm"
        tone={manualUnlinked ? 'accent' : 'default'}
        ariaPressed={manualUnlinked}
        onClick={() => setManualUnlinked((current) => !current)}
        title={t(manualUnlinked ? 'transcription.relink' : 'transcription.unlink')}
      >
        {manualUnlinked ? <Unlink2 size={14} /> : <Link2 size={14} />}
      </IconButton>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-panel">
      {/* Stessa riga della scheda opera in Biblioteca (icona, titolo/autore,
          uscita verso la biblioteca): quando il documento è legato a
          un'opera è quella a identificarlo qui, non il titolo scelto per la
          trascrizione — visibile comunque nel breadcrumb in alto. */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton size="sm" onClick={onBack} title={t('transcription.backToCatalogue')}>
            <ArrowLeft size={15} />
          </IconButton>
          {bookInfo && <BookOpenText size={16} className="shrink-0 text-editorial-accent" aria-hidden="true" />}
          <div className="min-w-0">
            <h1 className="truncate font-display text-base italic text-editorial-ink">
              {bookInfo?.title ?? detail?.title ?? t('areas.transcriptions.title')}
            </h1>
            {bookInfo?.creatorDate && (
              <p className="truncate text-xs text-editorial-muted">{bookInfo.creatorDate}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {bookInfo?.providerLabel && (
            <CopyProvenance providerLabel={bookInfo.providerLabel} className="mr-1 text-xs text-editorial-ink" />
          )}
          {bookInfo?.pageUrl && (
            <IconLink size="sm" href={bookInfo.pageUrl} title={t('areas.library.openOnLibrarySite')}>
              <ExternalLink size={13} />
            </IconLink>
          )}
          <ClickPopover
            open={headerMenuOpen}
            onOpenChange={setHeaderMenuOpen}
            trigger={
              <IconButton size="sm" title={t('areas.library.moreActions')} disabled={removingDocument} ariaPressed={headerMenuOpen}>
                <MoreVertical size={13} />
              </IconButton>
            }
          >
            <div className="min-w-44 py-1">
              <MenuActionRow
                icon={<Trash2 size={14} />}
                label={t('transcription.removeDocument')}
                tone="danger"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  void handleRemoveDocument();
                }}
              />
            </div>
          </ClickPopover>
        </div>
      </header>

      <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistInspectorLayout}>
        <Panel id="transcription-main" className="flex min-w-0 flex-col">
        <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistViewerLayout}>
        <Panel
          id="transcription-viewer"
          defaultSize={initialViewerSize.current}
          minSize={VIEWER_MIN}
          maxSize={VIEWER_MAX}
          panelRef={setViewerPanel}
          className="relative flex min-w-0 flex-col border-r border-editorial-border bg-surface-panel"
        >
          {viewerLoading ? (
            <Spinner size={14} label={t('common.loading')} className="flex h-full items-center justify-center gap-2 text-xs text-editorial-muted" />
          ) : displayedVersion?.versionKind === 'pdf' && displayedVersion.providerKey ? (
            <DocumentViewer
              key={displayedVersion.versionId}
              versionId={displayedVersion.versionId}
              providerKey={displayedVersion.providerKey}
              onPageChange={(index, total) => handleViewerPageChange(index, null, total)}
              onPageStatusChange={setPendingStatus}
              requestedIndex={jumpRequest?.index ?? null}
              requestToken={jumpRequest?.token ?? 0}
              onRequestedIndexHandled={() => setJumpRequest(null)}
              extraControls={sourceSwitchControls}
            />
          ) : displayedVersion?.versionKind === 'iiif_manifest' && displayedVersion.sourceUrl ? (
            <PageViewer
              key={displayedVersion.versionId}
              sourceId={displayedVersion.sourceId}
              versionId={displayedVersion.versionId}
              manifestUrl={displayedVersion.sourceUrl}
              providerKey={displayedVersion.providerKey}
              onPageChange={(page) => handleViewerPageChange(page.index, page.label, page.total)}
              onPageStatusChange={setPendingStatus}
              requestedIndex={jumpRequest?.index ?? null}
              requestToken={jumpRequest?.token ?? 0}
              onRequestedIndexHandled={() => setJumpRequest(null)}
              extraControls={sourceSwitchControls}
            />
          ) : (
            // Filtri visuali, preset e cambio fonte restano il resto di #221:
            // questa colonna oggi offre solo zoom/pan della pagina. I comandi
            // del cambio fonte restano visibili anche qui — se la copia
            // scelta non si apre, si deve poter tornare indietro senza
            // restare bloccati su una schermata senza uscita.
            <div className="flex h-full min-h-0 flex-col">
              {sourceSwitchControls && (
                <div className="flex h-12 shrink-0 items-center justify-end border-b border-editorial-border px-3">
                  {sourceSwitchControls}
                </div>
              )}
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-editorial-muted">
                <span className="flex flex-col items-center gap-2">
                  <Images size={28} className="text-editorial-muted/60" aria-hidden="true" />
                  {t(displayedVersion ? 'transcription.viewerOpenFailed' : 'transcription.viewerUnavailable')}
                </span>
              </div>
            </div>
          )}
          {/* Cambiare fonte smonta e rimonta il visore (chiavi diverse, dati
              diversi): senza questo velo si vede il vuoto per un istante fra
              i due, uno scatto invece di una transizione. */}
          <PanelTransitionVeil panelKey={displayedVersion?.versionId ?? 'none'} tone="panel" variant="project" />
        </Panel>

        <Separator
          onPointerDown={() => setDragging(true)}
          className={`group/sep relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
            dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
          }`}
        >
          <span
            aria-hidden="true"
            className={`relative h-7 w-px rounded-full transition-colors ${
              dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
            }`}
          />
        </Separator>

        <Panel id="transcription-text" minSize={TEXT_MIN} className="flex min-w-0 flex-1 flex-col bg-surface-panel">
          {loadingSegment ? (
            <Spinner size={14} label={t('common.loading')} className="flex h-full items-center justify-center gap-2 text-xs text-editorial-muted" />
          ) : (
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Stessa altezza della barra comandi del visore a sinistra
                  (`ViewerToolbar`, h-12): le due colonne partono allineate. */}
              <div className={`flex ${TEXT_HEADER_HEIGHT} shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3`}>
                <div className="flex min-w-0 items-center gap-3">
                  {/* Navigazione autonoma del testo: sempre presente, attiva
                      solo fuori sincronia (visore staccato sulla secondaria,
                      o sgancio manuale). Stesse pagine di sempre — cambia
                      solo chi le comanda. */}
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      size="sm"
                      disabled={synced || pageIndex <= 0}
                      onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                      title={t('transcription.textPrevPage')}
                    >
                      <ChevronLeft size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      disabled={synced || (pageTotal !== null && pageIndex >= pageTotal - 1)}
                      onClick={() => setPageIndex((current) => (pageTotal !== null ? Math.min(pageTotal - 1, current + 1) : current + 1))}
                      title={t('transcription.textNextPage')}
                    >
                      <ChevronRight size={14} />
                    </IconButton>
                  </span>
                  <h3 className="min-w-0 flex-1 truncate font-display text-lg italic text-editorial-ink">
                    {pageTitle}
                  </h3>
                  <span className="shrink-0">
                    <IconButton
                      size="sm"
                      tone={isVerified ? 'success' : 'muted'}
                      onClick={() => void (isVerified ? handleUnverify() : handleVerify())}
                      disabled={verifying || !segment || isPagePending || (!isVerified && !draft.trim())}
                      title={t(isVerified ? 'transcription.unverify' : 'transcription.verify')}
                      ariaPressed={isVerified}
                    >
                      {verifying ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    </IconButton>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      saveState === 'error' ? 'text-editorial-danger' : 'text-editorial-muted'
                    }`}
                    role="status"
                  >
                    {saveState === 'saving' ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    ) : saveState === 'error' ? (
                      <AlertCircle size={12} aria-hidden="true" />
                    ) : (
                      <Check size={12} aria-hidden="true" />
                    )}
                    {t(`transcription.save${saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'Error'}`)}
                    {saveState === 'error' && (
                      <IconButton size="xs" tone="danger" onClick={() => void save(draft)} title={t('transcription.saveRetry')}>
                        <RefreshCw size={12} />
                      </IconButton>
                    )}
                  </span>
                  <span className="h-4 w-px bg-editorial-border/60" aria-hidden="true" />
                  <IconButton
                    size="lg"
                    tone={textMenuOpen ? 'accent' : 'default'}
                    onClick={() => setTextMenuOpen((open) => !open)}
                    title={t('editor.textMenu')}
                    ariaPressed={textMenuOpen}
                  >
                    <SlidersHorizontal size={14} />
                  </IconButton>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col bg-editorial-bg px-12 py-8">
                <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-editorial-border/50 bg-editorial-page px-7 py-4 shadow-[var(--shadow-page-card)]">
                  <MarkdownEditor
                    identityKey={segment?.id ?? `${documentId}:${pageIndex}`}
                    flatToolbar
                    menuOpen={textMenuOpen}
                    onMenuOpenChange={setTextMenuOpen}
                    value={draft}
                    onChange={setDraft}
                    markdownEnabled
                    readOnly={isVerified || isPagePending || Boolean(pagePendingError)}
                    fillHeight
                    textClassName="doc-content text-editorial-ink"
                    previewClassName="min-h-[280px] doc-content text-editorial-ink"
                    placeholder={t('transcription.textPlaceholder')}
                  />
                  <PagePendingOverlay pending={isPagePending} errorMessage={pagePendingError} />
                </div>
              </div>
            </section>
          )}
        </Panel>
        </Group>
        </Panel>

        <Separator
          onPointerDown={() => setDragging(true)}
          className={`group/sep relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
            dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
          }`}
        >
          <span
            aria-hidden="true"
            className={`relative h-7 w-px rounded-full transition-colors ${
              dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
            }`}
          />
        </Separator>

        <Panel
          id="transcription-inspector"
          collapsible
          collapsedSize={INSPECTOR_COLLAPSED}
          minSize={INSPECTOR_MIN}
          maxSize={INSPECTOR_MAX}
          defaultSize={initialInspectorWidth.current}
          panelRef={setInspectorPanel}
          onResize={syncInspectorCollapsed}
          className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
            dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
          }`}
        >
          <InspectorShell
            ariaLabel={t('transcription.inspectorLabel')}
            headerHeightClassName="h-12"
            tabRowHeightClassName="h-12"
            tabs={[
              {
                id: 'assist',
                label: t('transcription.tabs.assist'),
                icon: <Sparkles size={13} />,
                disabled: true,
              },
              { id: 'history', label: t('transcription.tabs.history'), icon: <History size={13} /> },
              { id: 'metadata', label: t('transcription.tabs.metadata'), icon: <Info size={13} /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'history' | 'assist' | 'metadata')}
            panelIcon={<History size={15} />}
            panelLabel={t('transcription.inspectorPanelTitle')}
            collapsed={inspectorCollapsed}
            onCollapsedChange={toggleInspectorCollapsed}
          >
            {activeTab === 'history' ? (
              <div className="relative flex min-h-0 flex-1 flex-col gap-2 p-3">
                {revisions.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-editorial-muted">
                    {t('transcription.noRevisions')}
                  </p>
                ) : (
                  revisions.map((revision) => {
                    const Icon = revisionAuthorIcon[revision.created_by];
                    const isApproved = revision.id === segment?.approved_revision_id;
                    const isCurrent = revision.text === draft;
                    return (
                      <div
                        key={revision.id}
                        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                          isApproved ? 'border-editorial-success/40 bg-editorial-success/5' : 'border-editorial-border'
                        }`}
                      >
                        <Icon size={13} className="mt-0.5 shrink-0 text-editorial-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-editorial-muted">
                            <span>{t(`transcription.authorLabels.${revision.created_by}`)}</span>
                            <span>·</span>
                            <span>{formatDate(revision.created_at)}</span>
                            {isApproved && (
                              <span className="text-editorial-success">· {t('transcription.verifiedBadge')}</span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-3 text-editorial-ink">{revision.text}</p>
                        </div>
                        {!isCurrent && (
                          <IconButton
                            size="xs"
                            onClick={() => void handleRestore(revision.id)}
                            title={t('transcription.restore')}
                            disabled={isPagePending}
                          >
                            <RotateCcw size={12} />
                          </IconButton>
                        )}
                      </div>
                    );
                  })
                )}
                <PagePendingOverlay pending={isPagePending} errorMessage={pagePendingError} roundedClassName="rounded-none" />
              </div>
            ) : activeTab === 'metadata' ? (
              <dl className="flex flex-col gap-3 p-4">
                <StatRow label={t('transcription.meta.page')} value={displayIndex + 1} />
                <StatRow label={t('transcription.meta.pageLabel')} value={pageLabel ?? '—'} />
                <StatRow
                  label={t('transcription.meta.status')}
                  value={t(isVerified ? 'transcription.verifiedBadge' : 'transcription.draftBadge')}
                />
                <StatRow label={t('transcription.meta.revisionCount')} value={revisions.length} />
                <StatRow label={t('transcription.meta.segmentId')} value={segment?.id ?? '—'} />
                <StatRow
                  label={t('transcription.meta.sourcePageId')}
                  value={segment?.source_page_id ?? t('transcription.meta.sourcePageIdUnset')}
                />
              </dl>
            ) : null}
          </InspectorShell>
        </Panel>
      </Group>
    </div>
  );
}

/**
 * Il visore sta ancora aprendo una pagina diversa, o ci ha appena rinunciato:
 * stessa idea del pannello Digitalizzazioni della Biblioteca, applicata al
 * testo e allo storico invece che ai dati tecnici della copia. Blocca il
 * contenuto sotto (non solo lo attenua) — un clic durante il cambio pagina
 * non deve colpire la pagina sbagliata.
 */
function PagePendingOverlay({
  pending,
  errorMessage,
  roundedClassName = 'rounded-2xl',
}: {
  pending: boolean;
  errorMessage: string | null;
  roundedClassName?: string;
}) {
  const { t } = useTranslation();
  if (!pending && !errorMessage) return null;
  return (
    <div className={`absolute inset-0 z-10 flex items-center justify-center bg-editorial-bg/70 ${roundedClassName}`}>
      {pending ? (
        <Loader2 size={20} className="animate-spin text-editorial-muted" aria-label={t('common.loading')} />
      ) : (
        <span className="flex flex-col items-center gap-1.5 text-center text-xs text-editorial-danger">
          <AlertTriangle size={20} aria-hidden="true" />
          {errorMessage}
        </span>
      )}
    </div>
  );
}
