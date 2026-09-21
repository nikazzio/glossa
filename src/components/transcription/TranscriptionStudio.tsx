import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileInput,
  History,
  Images,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Sparkles,
  User,
} from 'lucide-react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MarkdownEditor } from '../common';
import { IconButton, InspectorShell, Spinner } from '../ui';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useDebounce } from '../../hooks/useDebounce';
import { useUiStore } from '../../stores/uiStore';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import {
  addSegment,
  listRevisions,
  listSegments,
  restoreRevision,
  saveSegmentText,
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

function clampWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

interface TranscriptionStudioProps {
  documentId: string;
  workspaceId: string | null;
  onBack: () => void;
}

/**
 * Studio di trascrizione (#388): visore a sinistra (segnaposto finché non
 * arriva #221), testo al centro, strumenti a destra. Un solo segmento per
 * documento per ora — più pagine/segmenti arrivano con l'ancoraggio alle
 * pagine (#221/#220), lo schema li supporta già.
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
  const [activeTab, setActiveTab] = useState<'history' | 'assist'>('history');
  const [textMenuOpen, setTextMenuOpen] = useState(false);

  const debouncedDraft = useDebounce(draft, SAVE_DELAY_MS);
  const savedRef = useRef('');
  const attemptRef = useRef<string | null>(null);

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

  const loadSegment = useCallback(async () => {
    setLoadingSegment(true);
    try {
      const segments = await listSegments(documentId);
      const first = segments[0] ?? (await addSegment(documentId, 0));
      const history = await listRevisions(first.id);
      setSegment(first);
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
  }, [documentId, t]);

  useEffect(() => { void loadSegment(); }, [loadSegment]);

  const save = useCallback(
    async (text: string) => {
      if (!segment) return;
      attemptRef.current = text;
      setSaveState('saving');
      try {
        const revision = await saveSegmentText(segment.id, text, 'user');
        savedRef.current = text;
        if (attemptRef.current === text) setSaveState('saved');
        if (revision) setRevisions((current) => [revision, ...current.filter((r) => r.id !== revision.id)]);
      } catch {
        if (attemptRef.current === text) setSaveState('error');
      }
    },
    [segment],
  );

  useEffect(() => {
    if (loadingSegment) return;
    if (debouncedDraft === savedRef.current) return;
    if (attemptRef.current === debouncedDraft) return;
    void save(debouncedDraft);
  }, [debouncedDraft, save, loadingSegment]);

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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-panel">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-editorial-border px-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton size="sm" onClick={onBack} title={t('transcription.backToCatalogue')}>
            <ArrowLeft size={15} />
          </IconButton>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base italic text-editorial-ink">
              {detail?.title ?? t('areas.transcriptions.title')}
            </h1>
          </div>
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
          className="flex min-w-0 flex-col border-r border-editorial-border bg-surface-panel"
        >
          {/* Il visore delle pagine arriva con #221: stessa colonna, stesso
              spazio già predisposto, oggi vuota. */}
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-editorial-muted">
            <span className="flex flex-col items-center gap-2">
              <Images size={28} className="text-editorial-muted/60" aria-hidden="true" />
              {t('transcription.viewerComingSoon')}
            </span>
          </div>
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

        <Panel id="transcription-text" minSize={TEXT_MIN} className="flex min-w-0 flex-1 flex-col bg-editorial-paper">
          {loadingSegment ? (
            <Spinner size={14} label={t('common.loading')} className="flex h-full items-center justify-center gap-2 text-xs text-editorial-muted" />
          ) : (
            // Stessa struttura della pagina sorgente/traduzione dello Studio di
            // traduzione (intestazione con eyebrow/titolo/lucchetto a sinistra,
            // stato e comandi a destra, poi il riquadro di testo): non un
            // componente condiviso — è privato in quel file — ma la stessa
            // forma, per restare la stessa esperienza in entrambi gli Studio.
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editorial-bg px-12 py-8">
              <div className="mb-6 shrink-0 border-b border-editorial-divider-soft pb-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-muted">
                  {t('transcription.paneEyebrow')}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate font-display text-[1.7rem] italic tracking-tight text-editorial-ink">
                      {segment?.label ?? t('transcription.paneLabel')}
                    </h3>
                    <IconButton
                      size="sm"
                      tone={isVerified ? 'success' : 'muted'}
                      onClick={() => void (isVerified ? handleUnverify() : handleVerify())}
                      disabled={verifying || !segment || (!isVerified && !draft.trim())}
                      title={t(isVerified ? 'transcription.unverify' : 'transcription.verify')}
                      ariaPressed={isVerified}
                    >
                      {verifying ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                    </IconButton>
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
              </div>
              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-editorial-border/50 bg-editorial-page px-7 py-4 shadow-[var(--shadow-page-card)]">
                <MarkdownEditor
                  identityKey={segment?.id ?? documentId}
                  flatToolbar
                  menuOpen={textMenuOpen}
                  onMenuOpenChange={setTextMenuOpen}
                  value={draft}
                  onChange={setDraft}
                  markdownEnabled
                  readOnly={isVerified}
                  fillHeight
                  textClassName="doc-content text-editorial-ink"
                  previewClassName="min-h-[280px] doc-content text-editorial-ink"
                  placeholder={t('transcription.textPlaceholder')}
                />
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
            tabs={[
              {
                id: 'assist',
                label: t('transcription.tabs.assist'),
                icon: <Sparkles size={13} />,
                disabled: true,
              },
              { id: 'history', label: t('transcription.tabs.history'), icon: <History size={13} /> },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'history' | 'assist')}
            panelIcon={<History size={15} />}
            panelLabel={t('transcription.inspectorPanelTitle')}
            collapsed={inspectorCollapsed}
            onCollapsedChange={toggleInspectorCollapsed}
          >
            {activeTab === 'history' ? (
              <div className="flex flex-col gap-2 p-3">
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
                          >
                            <RotateCcw size={12} />
                          </IconButton>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </InspectorShell>
        </Panel>
      </Group>
    </div>
  );
}
