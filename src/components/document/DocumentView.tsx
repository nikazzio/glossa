import {
  AlertTriangle,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  FlaskConical,
  Info,
  Languages,
  Loader2,
  Lock,
  Pencil,
  PanelLeft,
  PanelRight,
  Play,
  RotateCcw,
  ScanLine,
  Square,
  Wand2,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { confirm } from '../../stores/confirmStore';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { usePricingStore } from '../../stores/pricingStore';
import type { TranslationChunk } from '../../types';
import { indexPad } from '../../utils';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { CopyButton, MarkdownEditor, ProcessingLine } from '../common';
import { CostBreakdownPanel } from '../pipeline/CostBadge';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { escapeHtml, useGlossaryHighlight } from '../../hooks/useGlossaryHighlight';
import { highlightSuperscriptMarkersHtml } from '../../utils/footnoteExtractor';

interface DocumentViewProps {
  onRetranslateChunk: (chunkId: string) => void;
  onReauditChunk: (chunkId: string) => void;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
}


export function DocumentView({
  onRetranslateChunk,
  onReauditChunk,
  onRunPipeline,
  onCancelPipeline,
  onDryRun,
}: DocumentViewProps) {
  const { t } = useTranslation();
  const { config } = usePipelineStore();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const {
    chunks,
    isProcessing,
    cancelRequested,
    updateChunkDraft,
    updateChunkOriginalText,
    toggleChunkTranslationLock,
    toggleChunkSourceEditing,
  } = useChunksStore();

  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const {
    selectedChunkId,
    setSelectedChunkId,
    documentLayout,
    glossaryHighlightEnabled,
    pipelineMode,
    setPipelineMode,
    focusedChunkId,
    focusedIssueQuery,
    focusedIssueRequestId,
    clearFocusedIssue,
  } = useUiStore();

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [paneFocus, setPaneFocus] = useState<'both' | 'source' | 'translation'>('both');
  const [traceStageId, setTraceStageId] = useState<string | null>(null);
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string>('');

  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resolvedLayout =
    documentLayout === 'auto'
      ? viewportWidth >= 1500
        ? 'book'
        : 'standard'
      : documentLayout;

  const currentIndex = Math.max(
    0,
    chunks.findIndex((chunk) => chunk.id === selectedChunkId),
  );
  const currentChunk = chunks[currentIndex] ?? null;
  const enabledStages = config.stages.filter((s) => s.enabled);
  const lastStageId = enabledStages[enabledStages.length - 1]?.id ?? '';
  const isEditorialMode = enabledStages.length > 1;
  const deferredOriginalText = useDeferredValue(currentChunk?.originalText ?? '');
  const effectiveSelectedStageId = selectedStageId || lastStageId;
  const isLastSelected = effectiveSelectedStageId === lastStageId;
  const rawStageContent = isLastSelected
    ? (currentChunk?.currentDraft ?? '')
    : (currentChunk?.stageResults[effectiveSelectedStageId]?.content ?? '');
  const deferredStageContent = useDeferredValue(rawStageContent);

  useEffect(() => {
    if (!chunks.length) return;
    if (!selectedChunkId || !chunks.some((chunk) => chunk.id === selectedChunkId)) {
      setSelectedChunkId(chunks[0].id);
    }
  }, [chunks, selectedChunkId, setSelectedChunkId]);

  // Reset to last stage whenever the chunk changes
  useEffect(() => {
    setSelectedStageId(lastStageId);
  }, [currentChunk?.id, lastStageId]);

  // Hooks devono essere chiamati prima di qualsiasi return condizionale
  const hasGlossary = config.glossary.length > 0;
  const showHighlight = glossaryHighlightEnabled && hasGlossary;
  const sourceHighlight = useGlossaryHighlight(
    paneFocus !== 'translation' ? deferredOriginalText : '',
    showHighlight && paneFocus !== 'translation' ? config.glossary : [],
    'source',
  );
  const translationHighlight = useGlossaryHighlight(
    paneFocus !== 'source' ? deferredStageContent : '',
    showHighlight && paneFocus !== 'source' ? config.glossary : [],
    'translation',
  );

  const sourceHighlightHtml = useMemo(() => {
    const hasFootnoteMarkers = /\[[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(deferredOriginalText);
    const showGlossary = showHighlight && paneFocus !== 'translation';
    if (!showGlossary && !hasFootnoteMarkers) return null;
    const base = showGlossary ? sourceHighlight.html : escapeHtml(deferredOriginalText);
    return hasFootnoteMarkers ? highlightSuperscriptMarkersHtml(base) : base;
  }, [deferredOriginalText, showHighlight, paneFocus, sourceHighlight.html]);

  if (!currentChunk) {
    return (
      <section className="flex w-full items-center justify-center bg-editorial-bg p-10">
        <div className="max-w-xl text-center space-y-4">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-editorial-border bg-editorial-textbox/40">
            <FileText size={24} className="text-editorial-muted/60" />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.emptyLabel')}
          </div>
          <h2 className="font-display text-4xl italic tracking-tight text-editorial-ink">
            {t('document.emptyTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-editorial-muted">
            {t('document.emptyBody')}
          </p>
        </div>
      </section>
    );
  }

  const isBook = resolvedLayout === 'book';
  const prevChunk = chunks[currentIndex - 1];
  const nextChunk = chunks[currentIndex + 1];
  const sourceReadOnly =
    currentChunk.status === 'processing' ||
    (currentChunk.status === 'completed' && currentChunk.sourceEditable !== true);
  const sourceEditDisabled = currentChunk.status === 'processing';

  return (
    <section className="w-full bg-[#f7f3ec] overflow-y-auto min-h-0 h-full custom-scrollbar flex flex-col">
      <div className="mx-auto w-full max-w-[1720px] px-5 py-4 md:px-6 md:py-5 flex flex-col flex-1 min-h-0 gap-5">
        <div className="flex items-stretch gap-2 shrink-0">
          {/* Pannello run: striscia orizzontale compatta */}
          {onRunPipeline && onCancelPipeline && (
            <div className="flex items-center gap-2.5 shrink-0 rounded-[20px] border border-editorial-border bg-editorial-bg/90 px-4 py-3 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">

              {/* Toggle Test / Produzione — solo icone */}
              <div
                className={`flex rounded-full border border-editorial-border bg-editorial-textbox/40 p-0.5 ${completedCount > 0 ? 'opacity-40 pointer-events-none' : ''}`}
                aria-disabled={completedCount > 0}
                title={completedCount > 0 ? t('pipeline.modeLockedHint') : undefined}
              >
                <button
                  type="button"
                  onClick={() => setPipelineMode('test')}
                  disabled={completedCount > 0}
                  title={t('pipeline.modeTestHint')}
                  aria-label={t('pipeline.modeTest')}
                  className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    pipelineMode === 'test'
                      ? 'bg-editorial-bg text-editorial-ink shadow-sm'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  <FlaskConical size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineMode('production')}
                  disabled={completedCount > 0}
                  title={t('pipeline.modeProductionHint')}
                  aria-label={t('pipeline.modeProduction')}
                  className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    pipelineMode === 'production'
                      ? 'bg-editorial-bg text-editorial-charcoal shadow-sm'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  <Zap size={13} />
                </button>
              </div>

              <div className="h-6 w-px bg-editorial-border shrink-0" />

              {/* Cerchio avvio pipeline */}
              <div className="relative flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg/90">
                {isProcessing ? (
                  cancelRequested ? (
                    <button
                      type="button"
                      disabled
                      title={t('pipeline.stopping')}
                      aria-label={t('pipeline.stopping')}
                      className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted opacity-50 focus:outline-none"
                    >
                      <Loader2 size={20} className="animate-spin" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onCancelPipeline}
                      title={t('pipeline.stopPipeline')}
                      aria-label={t('pipeline.stopPipeline')}
                      className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-editorial-accent bg-editorial-bg text-editorial-accent transition-colors hover:bg-editorial-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    >
                      <Square size={17} fill="currentColor" />
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={pipelineMode === 'test' ? onDryRun : onRunPipeline}
                    title={t('pipeline.beginPipeline')}
                    aria-label={t('pipeline.beginPipeline')}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-editorial-charcoal text-white transition-colors hover:bg-editorial-charcoal/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                )}

                {/* Dot costi */}
                {costEstimate.stages.length > 0 && (
                  <div
                    className="absolute -bottom-1 -right-1"
                    onMouseEnter={() => setShowCostPanel(true)}
                    onMouseLeave={() => setShowCostPanel(false)}
                  >
                    <button
                      type="button"
                      onFocus={() => setShowCostPanel(true)}
                      onBlur={() => setShowCostPanel(false)}
                      aria-label={t('cost.breakdown')}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal hover:text-editorial-charcoal focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                    >
                      <Info size={9} />
                    </button>
                  </div>
                )}
                {showCostPanel && costEstimate.stages.length > 0 && (
                  <div
                    className="absolute left-0 top-full z-50 mt-2 w-64"
                    onMouseEnter={() => setShowCostPanel(true)}
                    onMouseLeave={() => setShowCostPanel(false)}
                  >
                    <CostBreakdownPanel estimate={costEstimate} />
                  </div>
                )}
              </div>

              <div className="h-6 w-px bg-editorial-border shrink-0" />

              {/* Ritraduzione chunk corrente — solo icona */}
              <button
                type="button"
                onClick={() => onRetranslateChunk(currentChunk.id)}
                disabled={isProcessing || !currentChunk.originalText.trim()}
                title={pipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')}
                aria-label={pipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')}
                className="rounded-full border border-editorial-border p-2.5 text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={15} />
              </button>

              {/* Rivaluta chunk — solo icona */}
              <button
                type="button"
                onClick={() => onReauditChunk(currentChunk.id)}
                disabled={isProcessing || !currentChunk.currentDraft}
                title={t('pipeline.reauditChunk')}
                aria-label={t('pipeline.reauditChunk')}
                className="rounded-full border border-editorial-border p-2.5 text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ScanLine size={15} />
              </button>
            </div>
          )}

          {/* Navigation bar */}
          <div className="flex-1 rounded-[22px] border border-editorial-border bg-editorial-bg/90 px-6 py-3 shadow-[0_16px_50px_rgba(26,26,26,0.05)] flex items-center">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">

            {/* Sinistra: navigazione chunk */}
            <div className="flex items-center gap-1.5 rounded-full border border-editorial-border bg-editorial-bg/70 px-2.5 py-1.5">
              <ChunkIconButton
                onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
                title={t('document.previousChunk')}
                disabled={!prevChunk}
              >
                <ChevronLeft size={16} />
              </ChunkIconButton>
              <span className="font-display text-xl italic text-editorial-accent shrink-0 min-w-[96px] text-center">
                {indexPad(currentIndex + 1)}/{indexPad(chunks.length)}
              </span>
              <ChunkIconButton
                onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
                title={t('document.nextChunk')}
                disabled={!nextChunk}
              >
                <ChevronRight size={16} />
              </ChunkIconButton>
            </div>

            {/* Centro: pannelli visualizzazione */}
            <div className="flex items-center gap-1">
              <ChunkIconButton
                onClick={() => setPaneFocus('both')}
                title={t('document.focusBoth')}
                active={paneFocus === 'both'}
                ariaPressed={paneFocus === 'both'}
              >
                <Columns2 size={18} />
              </ChunkIconButton>
              <ChunkIconButton
                onClick={() => setPaneFocus('source')}
                title={t('document.focusSource')}
                active={paneFocus === 'source'}
                ariaPressed={paneFocus === 'source'}
              >
                <PanelLeft size={18} />
              </ChunkIconButton>
              <ChunkIconButton
                onClick={() => setPaneFocus('translation')}
                title={t('document.focusTranslation')}
                active={paneFocus === 'translation'}
                ariaPressed={paneFocus === 'translation'}
              >
                <PanelRight size={18} />
              </ChunkIconButton>
            </div>

            {/* Destra: stati pipeline + modifica sorgente + blocca */}
            <div className="flex items-center gap-2">
              {config.stages
                .filter((stage) => stage.enabled)
                .map((stage) => {
                  const stageIcon: LucideIcon =
                    stage.role === 'refine' ? Pencil
                    : stage.role === 'format' ? FileText
                    : Languages;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setTraceStageId(stage.id)}
                      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      title={stage.name}
                      aria-label={stage.name}
                    >
                      <CompactStatusIndicator
                        status={currentChunk.stageResults[stage.id]?.status || 'idle'}
                        icon={stageIcon}
                      />
                    </button>
                  );
                })}
              <button
                type="button"
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                title={t('pipeline.audit')}
                aria-label={t('pipeline.audit')}
              >
                <CompactStatusIndicator
                  status={currentChunk.judgeResult.status}
                  icon={ScanLine}
                />
              </button>
              {currentChunk.status === 'completed' && (
                <ChunkIconButton
                  onClick={() => toggleChunkSourceEditing(currentChunk.id)}
                  title={currentChunk.sourceEditable ? t('document.disableSourceEditing') : t('document.enableSourceEditing')}
                  disabled={sourceEditDisabled}
                  active={currentChunk.sourceEditable === true}
                  ariaPressed={currentChunk.sourceEditable === true}
                >
                  <Pencil size={18} />
                </ChunkIconButton>
              )}
              <button
                type="button"
                onClick={() => toggleChunkTranslationLock(currentChunk.id)}
                disabled={!currentChunk.currentDraft?.trim()}
                title={
                  currentChunk.translationLocked
                    ? t('document.unlockTranslation')
                    : t('document.lockTranslation')
                }
                aria-pressed={currentChunk.translationLocked === true}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35 ${
                  currentChunk.translationLocked
                    ? 'border-editorial-success/40 bg-editorial-success/12 text-editorial-success'
                    : 'border-editorial-border bg-editorial-bg text-editorial-muted'
                }`}
              >
                <CheckCheck size={16} />
              </button>
            </div>

          </div>
          </div>
        </div>

        <div className={`grid gap-5 flex-1 min-h-0 auto-rows-fr ${paneFocus === 'both' ? (isBook ? '2xl:grid-cols-2' : 'grid-cols-1') : 'grid-cols-1'}`}>
          {paneFocus !== 'translation' && (
            <DocumentPage
              label={t('pipeline.originalSource')}
              eyebrow={t('document.leftPage')}
              readOnly={sourceReadOnly}
              statusBadge={currentChunk.status === 'completed' && currentChunk.sourceEditable !== true ? (
                <InlineStatusBadge tone="amber" icon={<Lock size={13} />} label={t('document.sourceLockedTitle')} />
              ) : null}
            >
              <MarkdownEditor
                value={currentChunk.originalText}
                onChange={(nextValue) => updateChunkOriginalText(currentChunk.id, nextValue)}
                markdownEnabled={config.markdownAware === true}
                disabled={currentChunk.status === 'processing'}
                readOnly={sourceReadOnly}
                fillHeight
                textClassName="text-[15px] leading-8 text-editorial-ink"
                previewClassName="min-h-[280px] text-[15px] leading-8 text-editorial-ink"
                highlightHtml={sourceHighlightHtml}
              />
            </DocumentPage>
          )}

          {paneFocus !== 'source' && (() => {
            const stageReadOnly = !isLastSelected || currentChunk.translationLocked === true;
            const stageActions = isEditorialMode ? (
              <div className="flex items-center gap-1">
                {enabledStages.map((s) => {
                  const Icon = s.role === 'refine' ? Wand2 : s.role === 'format' ? FileText : Languages;
                  const isActive = effectiveSelectedStageId === s.id;
                  const hasContent = s.id === lastStageId
                    ? true
                    : !!(currentChunk.stageResults[s.id]?.content);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStageId(s.id)}
                      title={t('document.viewStageResult', { stage: t(`pipeline.stageRole.${s.role ?? 'translation'}`) })}
                      aria-label={t('document.viewStageResult', { stage: t(`pipeline.stageRole.${s.role ?? 'translation'}`) })}
                      aria-pressed={isActive}
                      disabled={!hasContent}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30 ${
                        isActive
                          ? 'border-editorial-accent bg-editorial-accent text-white'
                          : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            ) : null;

            return (
              <DocumentPage
                label={t('pipeline.candidateTranslation')}
                eyebrow={t('document.rightPage')}
                subtitle={isEditorialMode ? t(`pipeline.stageRole.${enabledStages.find(s => s.id === effectiveSelectedStageId)?.role ?? 'translation'}`) : undefined}
                subtitleAction={rawStageContent ? <CopyButton text={rawStageContent} /> : undefined}
                actions={stageActions}
                statusBadge={currentChunk.translationStale ? (
                  <InlineStatusBadge tone="amber" icon={<AlertTriangle size={13} />} label={t('document.translationStaleBadge')} />
                ) : currentChunk.status === 'preview' ? (
                  <InlineStatusBadge tone="muted" icon={<FlaskConical size={13} />} />
                ) : currentChunk.translationLocked ? (
                  <InlineStatusBadge tone="emerald" icon={<CheckCheck size={13} />} label={t('document.translationLockedBadge')} />
                ) : null}
              >
                <MarkdownEditor
                  value={rawStageContent}
                  onChange={isLastSelected ? (nextValue) => updateChunkDraft(currentChunk.id, nextValue) : () => {}}
                  markdownEnabled={config.markdownAware === true}
                  readOnly={stageReadOnly}
                  fillHeight
                  textClassName="text-[15px] leading-8 text-editorial-ink"
                  previewClassName="min-h-[280px] text-[15px] leading-8 text-editorial-ink"
                  placeholder={isLastSelected ? t('pipeline.candidatePlaceholder') : ''}
                  highlightHtml={showHighlight ? translationHighlight.html : null}
                  focusQuery={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueQuery : null}
                  focusRequestId={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueRequestId : 0}
                  onFocusQueryHandled={isLastSelected ? clearFocusedIssue : undefined}
                />
              </DocumentPage>
            );
          })()}
        </div>

      </div>
      {traceStageId ? (
        <StageTraceDialog
          chunk={currentChunk}
          stage={config.stages.find((entry) => entry.id === traceStageId) ?? null}
          onClose={() => setTraceStageId(null)}
        />
      ) : null}
    </section>
  );
}

interface DocumentPageProps {
  label: string;
  eyebrow: string;
  subtitle?: string;
  subtitleAction?: React.ReactNode;
  readOnly?: boolean;
  highlighted?: boolean;
  titleMeta?: React.ReactNode;
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

function StageTraceDialog({
  chunk,
  stage,
  onClose,
}: {
  chunk: TranslationChunk;
  stage: ReturnType<typeof usePipelineStore.getState>['config']['stages'][number] | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onClose);
  const result = stage ? chunk.stageResults[stage.id] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-trace-title"
      ref={trapRef}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">
        <div className="shrink-0 border-b border-editorial-border px-6 py-5 md:px-8 md:py-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.stageTrace')}
          </div>
          <h3
            id="stage-trace-title"
            className="mt-2 font-display text-3xl italic tracking-tight text-editorial-ink"
          >
            {stage?.name ?? t('errors.unknownError')}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-editorial-muted">
            {result?.status ?? 'idle'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 custom-scrollbar">
          {result?.status === 'processing' || result?.status === 'retrying' ? (
            <div className="rounded-[22px] border border-editorial-border bg-editorial-textbox/35 p-5">
              <ProcessingLine />
            </div>
          ) : result?.status === 'error' ? (
            <div className="rounded-[22px] border border-editorial-accent/40 bg-editorial-textbox/40 p-5 text-sm leading-relaxed text-editorial-accent">
              {result.error || t('errors.unknownError')}
            </div>
          ) : result?.content ? (
            <pre className="whitespace-pre-wrap rounded-[22px] border border-editorial-border bg-editorial-bg p-5 text-sm leading-relaxed text-editorial-ink">
              {result.content}
            </pre>
          ) : (
            <div className="rounded-[22px] border border-editorial-border bg-editorial-bg p-5 text-sm text-editorial-muted">
              {t('document.noStageTrace')}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-editorial-border px-6 py-4 md:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentPage({
  label,
  eyebrow,
  subtitle,
  subtitleAction,
  readOnly = false,
  highlighted = false,
  titleMeta,
  statusBadge,
  actions,
  footer,
  children,
}: DocumentPageProps) {
  return (
    <section className={`relative rounded-[24px] bg-[#fffdf9] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_45px_rgba(74,50,17,0.08)] flex flex-col min-h-0 ${
      highlighted ? 'border border-editorial-accent ring-2 ring-editorial-accent/30' : 'border border-[#d8cfbf]'
    }`}>
      <div className="mb-4 shrink-0 flex items-center justify-between gap-4 border-b border-[#ede4d6] pb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {eyebrow}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[1.7rem] italic tracking-tight text-editorial-ink">
              {label}
            </h3>
            {statusBadge}
          </div>
          {subtitle && (
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-accent">
                {subtitle}
              </p>
              {subtitleAction}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {titleMeta}
          {actions}
        </div>
      </div>
      <div className={`flex flex-col flex-1 min-h-0 ${readOnly ? 'opacity-90' : ''}`}>
        {children}
      </div>
      {footer && (
        <div className="mt-3 pt-3 border-t border-[#ede4d6] shrink-0">
          {footer}
        </div>
      )}
    </section>
  );
}

function InlineStatusBadge({
  tone,
  icon,
  label,
}: {
  tone: 'amber' | 'emerald' | 'muted';
  icon: React.ReactNode;
  label?: string;
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-300/80 bg-amber-50 text-amber-900'
      : tone === 'emerald'
        ? 'border-emerald-300/80 bg-emerald-50 text-emerald-900'
        : 'border-editorial-border bg-editorial-textbox/60 text-editorial-muted';
  return (
    <span
      title={label}
      className={`inline-flex items-center rounded-full border ${label ? 'gap-1.5 px-2.5 py-1' : 'p-1.5'} ${toneClasses}`}
    >
      {icon}
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
      )}
    </span>
  );
}

function ChunkIconButton({
  onClick,
  children,
  title,
  disabled = false,
  active = false,
  ariaPressed,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  active?: boolean;
  ariaPressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={ariaPressed}
      disabled={disabled}
      className={`rounded-full border p-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-editorial-accent bg-editorial-accent text-white'
          : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
      }`}
    >
      {children}
    </button>
  );
}

const COMPACT_STATUS_TONE = {
  completed:
    'border-editorial-success/40 bg-editorial-success/12 text-editorial-success',
  processing:
    'border-editorial-warning/45 bg-editorial-warning/12 text-editorial-warning animate-pulse',
  error: 'border-editorial-accent/40 bg-editorial-accent/10 text-editorial-accent',
  retrying: 'border-amber-500/45 bg-amber-500/12 text-amber-600 animate-pulse',
  idle: 'border-editorial-border bg-editorial-bg text-editorial-muted',
} as const;

function CompactStatusIndicator({
  status,
  label,
  icon: Icon,
}: {
  status: string;
  label?: string;
  icon?: LucideIcon;
}) {
  const tone =
    status === 'completed' || status === 'processing' || status === 'error' || status === 'retrying'
      ? status
      : 'idle';

  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${COMPACT_STATUS_TONE[tone]}`}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon size={16} strokeWidth={1.9} />
      ) : (
        <span className="font-display text-[11px] italic tracking-[0.02em]">
          {label}
        </span>
      )}
    </span>
  );
}

function truncateChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 58) return normalized;
  return `${normalized.slice(0, 55)}...`;
}
