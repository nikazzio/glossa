import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Images,
  Link2,
  Loader2,
  Lock,
  MoreVertical,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Unlink2,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MarkdownEditor, PanelTransitionVeil } from '../common';
import { ClickPopover, EmptyState, IconButton, IconLink, MenuActionRow, Spinner } from '../ui';
import { PageViewer, type PageStatus } from '../viewer/PageViewer';
import { DocumentViewer } from '../viewer/DocumentViewer';
import { CopyProvenance } from '../workspace/CopyProvenance';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useDebounce } from '../../hooks/useDebounce';
import { useUiStore } from '../../stores/uiStore';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { confirm } from '../../stores/confirmStore';
import type { ViewerVersionRef } from '../../services/libraryService';
import { computeSyncState } from './transcriptionSync';
import { useTranscriptionSources } from './useTranscriptionSources';
import { PagePendingOverlay } from './PagePendingOverlay';
import {
  TranscriptionInspector,
  type TranscriptionInspectorTab,
} from './TranscriptionInspector';
import {
  ensureSegment,
  getSegmentByPosition,
  listRevisions,
  restoreRevision,
  saveSegmentText,
  setDocumentStatus,
  unverifySegment,
  updateDocumentOcrSettings,
  verifySegment,
  type TranscriptionRevision,
  type TranscriptionSegment,
} from '../../services/transcriptionService';
import { startOcrForPage } from '../../services/ocrService';
import {
  DEFAULT_OCR_IMAGE_PREFERENCES,
  getOcrImagePreferences,
  type OcrImageMode,
} from '../../services/ocrImageSettingsService';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';
import { useOcrPageActivity } from '../../hooks/useOcrPageActivity';
import type { ModelProvider } from '../../types';

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
  onBack: () => void;
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
 * (`transcription_segments.position`; `source_page_id` si aggiunge da sé al
 * primo tocco del segmento dopo che un lavoro di scaricamento ha popolato
 * `source_pages`). L'OCR (#220) non aspetta quel collegamento: gli basta la
 * copia che il visore sta già mostrando.
 * Un documento senza visore (nato da zero) resta su un solo blocco di testo,
 * in posizione 0.
 */
export function TranscriptionStudio({ documentId, onBack }: TranscriptionStudioProps) {
  const { t, i18n } = useTranslation();
  const detail = useTranscriptionStore((s) => s.detail);
  const loadDetail = useTranscriptionStore((s) => s.loadDetail);
  const patchDetail = useTranscriptionStore((s) => s.patchDetail);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const [segment, setSegment] = useState<TranscriptionSegment | null>(null);
  const [revisions, setRevisions] = useState<TranscriptionRevision[]>([]);
  const [loadingSegment, setLoadingSegment] = useState(true);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<TranscriptionInspectorTab>('history');
  const [textMenuOpen, setTextMenuOpen] = useState(false);
  const [removingDocument, setRemovingDocument] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const {
    viewerRef,
    viewerLoading,
    bookInfo,
    siblingVersion,
    siblingPageCount,
    activeSource,
    setActiveSource,
    manualUnlinked,
    setManualUnlinked,
  } = useTranscriptionSources(detail?.source_version_id ?? null);
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
  const ocrPromptSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const draftRef = useRef(draft);
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    draftRef.current = draft;
    saveStateRef.current = saveState;
  }, [draft, saveState]);
  const attemptRef = useRef<string | null>(null);
  // Un salvataggio in corso quando si cambia pagina non deve scrivere il suo
  // risultato sullo stato della pagina nuova, arrivato nel frattempo.
  const pageIndexRef = useRef(pageIndex);
  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);
  // Il cambio pagina (salvataggio immediato) e il debounce possono chiedere
  // di salvare quasi nello stesso istante: senza serializzare, entrambi
  // leggono la stessa revisione precedente e calcolano lo stesso numero
  // successivo, e uno dei due testi sparisce in silenzio (scartato dal
  // vincolo di unicità). Incodare sulla stessa catena li rende sequenziali.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

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

  const loadSegmentForPage = useCallback(async (preserveDirty = false) => {
    setLoadingSegment(true);
    try {
      const existing = await getSegmentByPosition(documentId, pageIndex);
      const history = existing ? await listRevisions(existing.id) : [];
      if (preserveDirty && (draftRef.current !== savedRef.current || saveStateRef.current !== 'saved')) return;
      setSegment(existing);
      setRevisions(history);
      const currentText = history[0]?.text ?? '';
      draftRef.current = currentText;
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

  // Assistenza OCR/HTR (#220).
  const [ocrStarting, setOcrStarting] = useState(false);
  // Quali pagine di questo documento sono in lettura adesso: viene dai lavori
  // in coda, quindi resta vero anche riaprendo il documento o dopo un riavvio.
  const ocrActivity = useOcrPageActivity(detail?.id ?? null);
  // Immagine inviata: la scelta delle impostazioni generali, cambiabile qui
  // per la sessione — non si salva nel documento.
  const [ocrImage, setOcrImage] = useState(DEFAULT_OCR_IMAGE_PREFERENCES);
  useEffect(() => {
    getOcrImagePreferences().then(setOcrImage).catch((err: unknown) => {
      toast.error(t('transcription.assist.imageSettingsFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  }, [t]);
  const handleOcrImageModeChange = (mode: OcrImageMode) => setOcrImage((current) => ({ ...current, mode }));

  // Il lavoro gira in background: quando un lavoro OCR finisce si rilegge la
  // pagina corrente, così la revisione appena scritta compare da sola nello
  // storico, senza che l'utente debba cambiare pagina e tornare indietro.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType !== OCR_JOB_TYPE || job.status !== 'completed' || !segment) return;
      try {
        const config = JSON.parse(job.config) as { pages?: unknown };
        if (!Array.isArray(config.pages)) return;
        const affectsPage = config.pages.some((page: unknown) =>
          typeof page === 'object' && page !== null &&
          'documentId' in page && page.documentId === documentId &&
          'segmentId' in page && page.segmentId === segment.id,
        );
        if (affectsPage) void loadSegmentForPage(true);
      } catch { /* Un lavoro con configurazione illeggibile non riguarda la pagina aperta. */ }
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, [documentId, segment, loadSegmentForPage]);

  const handleDocumentOcrProviderChange = (provider: ModelProvider | '', model: string) => {
    if (!detail) return;
    patchDetail({ ocr_provider: provider || null, ocr_model: model || null });
    void updateDocumentOcrSettings(detail.id, {
      ocrProvider: provider || null,
      ocrModel: model || null,
    }).catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const handleDocumentOcrModelChange = (model: string) => {
    if (!detail) return;
    patchDetail({ ocr_model: model || null });
    void updateDocumentOcrSettings(detail.id, { ocrModel: model || null }).catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  };

  // Il prompt appartiene al documento: modificato da una pagina qualsiasi,
  // vale per tutte. `null` torna al prompt di partenza del workspace.
  const handleDocumentOcrPromptChange = (prompt: string | null) => {
    if (!detail) return;
    patchDetail({ ocr_prompt: prompt });
    const targetDocumentId = detail.id;
    // Le digitazioni rapide devono arrivare al database nello stesso ordine.
    ocrPromptSaveChainRef.current = ocrPromptSaveChainRef.current
      .catch(() => undefined)
      .then(() => updateDocumentOcrSettings(targetDocumentId, { ocrPrompt: prompt }));
    void ocrPromptSaveChainRef.current.catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const handleStartOcr = async () => {
    if (!detail || !activeWorkspace || !viewerRef) return;
    setOcrStarting(true);
    try {
      // Una pagina mai toccata non ha ancora un segmento: nasce qui, come già
      // fa il primo salvataggio manuale — l'OCR non deve aspettare che
      // qualcuno scriva prima a mano.
      const target = segment ?? (await ensureSegment(detail.id, pageIndex, pageLabel));
      if (!segment) setSegment(target);
      await startOcrForPage({
        document: detail,
        segment: target,
        workspace: activeWorkspace,
        viewerRef,
        // La posizione nel libro contando dalla copertina, come nel titolo
        // della pagina: la numerazione stampata della biblioteca («3») non
        // corrisponde quasi mai.
        pageLabel: String(pageIndex + 1),
        image: ocrImage,
      });
      toast.success(t('transcription.assist.jobStarted'));
    } catch (err: unknown) {
      toast.error(t('transcription.assist.jobStartFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setOcrStarting(false);
    }
  };

  const save = useCallback(
    (text: string) => {
      // Incodato: parte solo a salvataggio precedente concluso, così legge
      // sempre l'ultima revisione davvero scritta e non ne collide il numero.
      const run = saveChainRef.current.then(async () => {
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
          if (revision) {
            // Il testo davvero persistito, non quello tentato: su collisione
            // la revisione restituita è quella dell'altro salvataggio, non la nostra.
            savedRef.current = revision.text;
            if (attemptRef.current === text) {
              setSaveState(revision.text === text ? 'saved' : 'error');
            }
            setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
          } else if (attemptRef.current === text) {
            savedRef.current = text;
            setSaveState('saved');
          }
        } catch {
          if (pageIndexRef.current === savingPage && attemptRef.current === text) setSaveState('error');
        }
      });
      saveChainRef.current = run;
      return run;
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

  /** Le frecce indipendenti del testo, fuori sincronia: stessa cautela di
   *  `handleViewerPageChange` per non perdere testo non salvato. La pagina
   *  raggiunta così non ha un'etichetta nota (non viene da un visore), va
   *  azzerata perché non resti quella della pagina lasciata. */
  const handleTextPageChange = (nextIndex: number) => {
    if (draft !== savedRef.current) void save(draft);
    setPageIndex(nextIndex);
    setPageLabel(null);
  };

  const handleVerify = async () => {
    if (!segment || !detail) return;
    setVerifying(true);
    try {
      const revision = await verifySegment(segment.id, detail.workspace_id);
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
    if (!segment || !detail) return;
    setVerifying(true);
    try {
      await unverifySegment(segment.id, detail.workspace_id);
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
  const isPagePending = loadingSegment || (synced && pendingStatus?.state === 'loading');
  // Questa pagina è dentro un lavoro di lettura in corso: il foglio si vela e
  // resta in sola lettura, perché scrivere su un testo che sta per essere
  // sostituito è lavoro buttato.
  const isPageReading = ocrActivity.isReading(segment?.id);
  // La prima pagina in lettura del documento, anche se non è quella aperta:
  // sfogliare avanti non deve far sparire il segnale.
  const readingPage = ocrActivity.pages[0] ?? null;
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

  /** Cambio fonte: se le due copie restano sincrone (allineate, o si torna
   *  alla principale) il visore che si monta è un altro componente — chiave
   *  diversa, stato interno nuovo — e senza una richiesta esplicita apre la
   *  sua prima pagina invece di quella che il testo sta mostrando. */
  const handleSourceChange = (source: 'main' | 'sibling') => {
    setActiveSource(source);
    const nextSynced = computeSyncState({
      activeSource: source,
      manualUnlinked,
      mainPageTotal: pageTotal,
      siblingPageCount,
    }).synced;
    if (nextSynced) setJumpRequest({ index: pageIndex, token: Date.now() });
  };

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
                onClick={() => handleSourceChange(source)}
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
              <EmptyState
                icon={<Images size={28} aria-hidden="true" />}
                message={t(displayedVersion ? 'transcription.viewerOpenFailed' : 'transcription.viewerUnavailable')}
              />
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
          {/* Niente più "spinner al posto di tutto": scambiare l'intera
              sezione a ogni cambio pagina smontava e rimontava intestazione
              e editor per una lettura locale che dura pochi millisecondi —
              uno scatto visibile per niente. La struttura resta, un velo la
              copre se e quando il caricamento si fa sentire davvero. */}
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
                      onClick={() => handleTextPageChange(Math.max(0, pageIndex - 1))}
                      title={t('transcription.textPrevPage')}
                    >
                      <ChevronLeft size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      disabled={synced || (pageTotal !== null && pageIndex >= pageTotal - 1)}
                      onClick={() => handleTextPageChange(pageTotal !== null ? Math.min(pageTotal - 1, pageIndex + 1) : pageIndex + 1)}
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
                      disabled={verifying || !segment || !detail || isPagePending || (!isVerified && !draft.trim())}
                      title={t(isVerified ? 'transcription.unverify' : 'transcription.verify')}
                      ariaPressed={isVerified}
                    >
                      {verifying ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    </IconButton>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {readingPage && (
                    <span
                      className="flex items-center gap-1.5 rounded-full bg-editorial-accent/10 px-2.5 py-1 text-xs text-editorial-accent"
                      role="status"
                    >
                      <Loader2 size={12} className="shrink-0 animate-spin" aria-hidden="true" />
                      {t('transcription.assist.readingPage', { page: readingPage.pageLabel })}
                    </span>
                  )}
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
                    onChange={(text) => { draftRef.current = text; setDraft(text); }}
                    markdownEnabled
                    readOnly={isVerified || isPageReading || isPagePending || Boolean(pagePendingError)}
                    fillHeight
                    textClassName="doc-content text-editorial-ink"
                    previewClassName="min-h-[280px] doc-content text-editorial-ink"
                    placeholder={t('transcription.textPlaceholder')}
                  />
                  <PagePendingOverlay
                    pending={isPagePending || isPageReading}
                    label={isPageReading && !isPagePending ? t('transcription.assist.readingInProgress') : undefined}
                    errorMessage={pagePendingError}
                  />
                </div>
              </div>
            </section>
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
          <TranscriptionInspector
            activeTab={activeTab}
            onTabChange={setActiveTab}
            collapsed={inspectorCollapsed}
            onCollapsedChange={toggleInspectorCollapsed}
            revisions={revisions}
            segment={segment}
            draft={draft}
            formatDate={formatDate}
            onRestore={(revisionId) => void handleRestore(revisionId)}
            pagePending={isPagePending}
            pagePendingError={pagePendingError}
            displayIndex={displayIndex}
            pageLabel={pageLabel}
            verified={isVerified}
            document={detail}
            workspace={activeWorkspace}
            viewerRef={viewerRef}
            ocrStarting={ocrStarting}
            ocrReading={isPageReading}
            pageTitleShort={String(displayIndex + 1)}
            onStartOcr={() => void handleStartOcr()}
            onDocumentOcrProviderChange={handleDocumentOcrProviderChange}
            onDocumentOcrModelChange={handleDocumentOcrModelChange}
            onDocumentOcrPromptChange={handleDocumentOcrPromptChange}
            ocrImage={ocrImage}
            onOcrImageModeChange={handleOcrImageModeChange}
          />
        </Panel>
      </Group>
    </div>
  );
}
