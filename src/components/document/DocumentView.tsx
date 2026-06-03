import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  GitCompare,
  Languages,
  Lock,
  Pencil,
  RotateCcw,
  ScanLine,
  Wand2,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import type { TranslationChunk } from '../../types';
import { indexPad } from '../../utils';
import { CopyButton, HighlightedText, MarkdownEditor, ProcessingLine } from '../common';
import { IconButton, Tooltip, type IconButtonTone } from '../ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { escapeHtml, useGlossaryHighlight } from '../../hooks/useGlossaryHighlight';
import { usePanelScrollSync } from '../../hooks/usePanelScrollSync';
import { useStageDiff } from '../../hooks/useStageDiff';
import { highlightSuperscriptMarkersHtml } from '../../utils/footnoteExtractor';

const NOOP_CHANGE = () => {};

interface DocumentViewProps {
  onRetranslateChunk: (chunkId: string) => void;
}

const STAGE_TONE_MAP: Record<string, IconButtonTone> = {
  completed: 'success',
  processing: 'running',
  retrying: 'running',
  error: 'accent',
  idle: 'muted',
};


export function DocumentView({ onRetranslateChunk }: DocumentViewProps) {
  const { t } = useTranslation();
  const { config } = usePipelineStore();
  const {
    chunks,
    updateChunkDraft,
    updateChunkOriginalText,
    restoreChunkSourceText,
    toggleChunkTranslationLock,
    toggleChunkSourceEditing,
  } = useChunksStore();
  usePhraseMemoryAutoSearch();

  const handleLockToggle = (chunk: TranslationChunk) => {
    toggleChunkTranslationLock(chunk.id);
  };

  const {
    selectedChunkId,
    setSelectedChunkId,
    documentLayout,
    documentPaneFocus: paneFocus,
    syncScrollEnabled,
    highlightsEnabled,
    searchQuery,
    pipelineTestChunkCount,
    setPipelineTestChunkCount,
    focusedChunkId,
    focusedIssueQuery,
    focusedIssueRequestId,
    traceStageId,
    setTraceStageId,
  } = useUiStore();

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [showDiffMode, setShowDiffMode] = useState(false);
  const [diffPairKey, setDiffPairKey] = useState<string>('');

  const { sourceRef: scrollSourceRef, translationRef: scrollTranslationRef } = usePanelScrollSync(
    paneFocus === 'both' && syncScrollEnabled,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (chunks.length > 0 && pipelineTestChunkCount > chunks.length) {
      setPipelineTestChunkCount(chunks.length);
    }
  }, [chunks.length, pipelineTestChunkCount, setPipelineTestChunkCount]);

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
  const enabledStages = useMemo(() => config.stages.filter((s) => s.enabled), [config.stages]);
  const lastStageId = enabledStages[enabledStages.length - 1]?.id ?? '';
  const isEditorialMode = enabledStages.length > 1;
  const deferredSourceText = useDeferredValue(currentChunk?.sourceDisplayText ?? '');
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

  // Diff mode is only available in translation-only pane.
  useEffect(() => {
    if (paneFocus !== 'translation') setShowDiffMode(false);
  }, [paneFocus]);

  const diffPairs = useMemo(() => {
    return enabledStages.slice(0, -1).map((stage, index) => {
      const nextStage = enabledStages[index + 1];
      return {
        key: `${stage.id}::${nextStage.id}`,
        fromId: stage.id,
        toId: nextStage.id,
        fromName: stage.name,
        toName: nextStage.id === lastStageId ? t('document.finalDraft') : nextStage.name,
      };
    });
  }, [enabledStages, lastStageId, t]);

  useEffect(() => {
    if (diffPairs.length === 0) {
      setDiffPairKey('');
      return;
    }
    setDiffPairKey((prev) => (
      prev && diffPairs.some((pair) => pair.key === prev)
        ? prev
        : diffPairs[0]!.key
    ));
  }, [diffPairs]);

  // Hooks devono essere chiamati prima di qualsiasi return condizionale
  const hasGlossary = config.glossary.length > 0;
  const showHighlight = highlightsEnabled && hasGlossary;
  const sourceHighlight = useGlossaryHighlight(
    paneFocus !== 'translation' ? deferredSourceText : '',
    showHighlight && paneFocus !== 'translation' ? config.glossary : [],
    'source',
    highlightsEnabled ? searchQuery : '',
  );
  const translationHighlight = useGlossaryHighlight(
    paneFocus !== 'source' ? deferredStageContent : '',
    showHighlight && paneFocus !== 'source' ? config.glossary : [],
    'translation',
    highlightsEnabled ? searchQuery : '',
    focusedIssueQuery ?? '',
  );

  const activeDiffPair = diffPairs.find((pair) => pair.key === diffPairKey) ?? diffPairs[0] ?? null;
  const effectiveDiffStageIdA = activeDiffPair?.fromId ?? '';
  const effectiveDiffStageIdB = activeDiffPair?.toId ?? '';
  const diffTextA = effectiveDiffStageIdA === lastStageId
    ? (currentChunk?.currentDraft ?? '')
    : (currentChunk?.stageResults[effectiveDiffStageIdA]?.content ?? '');
  const diffTextB = effectiveDiffStageIdB === lastStageId
    ? (currentChunk?.currentDraft ?? '')
    : (currentChunk?.stageResults[effectiveDiffStageIdB]?.content ?? '');
  const stageDiff = useStageDiff(showDiffMode ? diffTextA : '', showDiffMode ? diffTextB : '');

  const sourceHighlightHtml = useMemo(() => {
    const hasFootnoteMarkers = /\[[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(deferredSourceText);
    const showGlossary = showHighlight && paneFocus !== 'translation';
    const hasSearch = highlightsEnabled && !!searchQuery.trim() && paneFocus !== 'translation';
    if (!showGlossary && !hasSearch && !hasFootnoteMarkers) return null;
    const base = (showGlossary || hasSearch) ? sourceHighlight.html : escapeHtml(deferredSourceText);
    return hasFootnoteMarkers ? highlightSuperscriptMarkersHtml(base) : base;
  }, [deferredSourceText, showHighlight, highlightsEnabled, searchQuery, paneFocus, sourceHighlight.html]);

  if (!currentChunk) {
    return (
      <section className="flex w-full flex-col items-center justify-center bg-editorial-paper overflow-y-auto min-h-0 flex-1 px-8 py-16">
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* Brand mark */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-editorial-border/60 bg-editorial-bg shadow-[0_4px_20px_rgba(26,26,26,0.06)]">
            <FileText size={20} className="text-editorial-accent" />
          </div>

          {/* Label */}
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.emptyLabel')}
          </div>

          {/* Headline */}
          <h2 className="mb-4 text-center font-display text-5xl italic tracking-tight text-editorial-ink">
            {t('document.emptyTitle')}
          </h2>

          {/* Body */}
          <p className="mb-12 max-w-md text-center text-sm leading-relaxed text-editorial-muted">
            {t('document.emptyBody')}
          </p>

          {/* Dashboard placeholder cards */}
          <div className="grid w-full grid-cols-3 gap-3">
            {([
              { key: 'pipeline',     icon: Languages, label: t('document.emptyCardPipeline') },
              { key: 'translations', icon: Zap,       label: t('document.emptyCardTranslations') },
              { key: 'quality',      icon: Wand2,     label: t('document.emptyCardQuality') },
            ] as const).map(({ key, icon: Icon, label }) => (
              <div
                key={key}
                className="flex flex-col items-center gap-3 rounded-[20px] border border-editorial-border/60 bg-editorial-bg/70 px-5 py-6 text-center"
              >
                <Icon size={18} className="text-editorial-muted/40" />
                <div className="font-display text-3xl italic text-editorial-ink/20">—</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted/50">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const isBook = resolvedLayout === 'book';
  const prevChunk = chunks[currentIndex - 1];
  const nextChunk = chunks[currentIndex + 1];
  const sourceReadOnly =
    currentChunk.status === 'processing' ||
    currentChunk.sourceEditable !== true;
  const sourceEditDisabled = currentChunk.status === 'processing';

  return (
    <section className="w-full bg-editorial-paper overflow-y-auto min-h-0 h-full custom-scrollbar flex flex-col">
      <div className="mx-auto w-full max-w-[1720px] px-5 py-3 md:px-6 md:py-4 flex flex-col flex-1 min-h-0 gap-5">
        <div className="shrink-0">
          {/* Navigation bar */}
          <div className="w-full rounded-[20px] border border-editorial-border bg-editorial-bg/90 px-4 py-3 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
            <div className="flex items-center gap-x-4 gap-y-2">
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {enabledStages.map((stage) => {
                  const Icon: LucideIcon =
                    stage.role === 'refine' ? Pencil
                    : stage.role === 'format' ? FileText
                    : Languages;
                  const stageTone = STAGE_TONE_MAP[currentChunk.stageResults[stage.id]?.status ?? 'idle'] ?? 'muted';
                  return (
                    <IconButton
                      key={stage.id}
                      size="md"
                      tone={stageTone}
                      title={stage.name}
                      onClick={() => setTraceStageId(traceStageId === stage.id ? null : stage.id)}
                    >
                      <Icon size={12} strokeWidth={1.9} />
                    </IconButton>
                  );
                })}
                <IconButton
                  size="md"
                  tone={STAGE_TONE_MAP[currentChunk.judgeResult.status ?? 'idle'] ?? 'muted'}
                  title={t('pipeline.audit')}
                  onClick={() => setTraceStageId(traceStageId === '_judge' ? null : '_judge')}
                >
                  <ScanLine size={12} strokeWidth={1.9} />
                </IconButton>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <IconButton
                  size="lg"
                  onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
                  title={t('document.previousChunk')}
                  disabled={!prevChunk}
                >
                  <ChevronLeft size={16} />
                </IconButton>
                <div className="min-w-[7.5rem] text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted/75">
                    {t('document.chunkLabel')}
                  </div>
                  <div className="font-display text-[1.8rem] italic leading-none text-editorial-accent">
                    {indexPad(currentIndex + 1)}<span className="px-1 text-editorial-muted/55">/</span>{indexPad(chunks.length)}
                  </div>
                </div>
                <IconButton
                  size="lg"
                  onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
                  title={t('document.nextChunk')}
                  disabled={!nextChunk}
                >
                  <ChevronRight size={16} />
                </IconButton>
              </div>
              <div className="flex-1" />

            </div>

            {chunks.length > 1 && (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
                {chunks.map((chunk, idx) => {
                  const segmentTone =
                    chunk.status === 'completed'
                      ? 'bg-editorial-success/18 shadow-[inset_0_0_0_1px_rgba(58,122,101,0.16)]'
                      : chunk.status === 'preview'
                        ? 'bg-editorial-charcoal/22 shadow-[inset_0_0_0_1px_rgba(58,122,114,0.12)]'
                        : chunk.status === 'error'
                          ? 'bg-editorial-accent/22 shadow-[inset_0_0_0_1px_rgba(200,112,94,0.18)]'
                          : chunk.status === 'processing'
                            ? 'bg-editorial-running/24 animate-pulse shadow-[inset_0_0_0_1px_rgba(196,155,42,0.22)]'
                            : 'bg-editorial-border/40';
                  const isCurrent = idx === currentIndex;
                  const sizeClass = chunk.translationLocked
                    ? (isCurrent ? 'h-4.5 w-4.5' : 'h-4 w-4')
                    : (isCurrent ? 'h-4 w-4' : 'h-3 w-3');
                  return (
                    <Tooltip key={chunk.id} label={`${idx + 1}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedChunkId(chunk.id)}
                        aria-label={`${idx + 1}`}
                        className={`relative shrink-0 rounded-full transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                          isCurrent
                            ? `${sizeClass} border border-editorial-charcoal/28 ${segmentTone} shadow-[0_0_0_1px_rgba(255,255,255,0.28)]`
                            : `${sizeClass} ${segmentTone} hover:-translate-y-px hover:ring-1 hover:ring-editorial-charcoal/12`
                        }`}
                      >
                        {chunk.translationLocked ? (
                          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-editorial-success" />
                        ) : null}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={`grid gap-5 flex-1 min-h-0 auto-rows-fr ${paneFocus === 'both' ? (isBook ? '2xl:grid-cols-2' : 'grid-cols-1') : 'grid-cols-1'}`}>
          {paneFocus !== 'translation' && (
            <DocumentPage
              label={t('pipeline.originalSource')}
              eyebrow={t('document.leftPage')}
              readOnly={sourceReadOnly}
              statusBadge={sourceReadOnly && currentChunk.status !== 'processing' ? (
                <InlineStatusBadge tone="amber" icon={<Lock size={13} />} ariaLabel={t('document.sourceLockedTitle')} />
              ) : null}
              actions={
                <div className="flex items-center gap-1">
                  <IconButton
                    size="lg"
                    tone={currentChunk.sourceEditable === true ? 'accent' : 'default'}
                    onClick={() => toggleChunkSourceEditing(currentChunk.id)}
                    title={currentChunk.sourceEditable ? t('document.disableSourceEditing') : t('document.enableSourceEditing')}
                    disabled={sourceEditDisabled}
                    ariaPressed={currentChunk.sourceEditable === true}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  {currentChunk.sourceDisplayText !== currentChunk.originalText && (
                    <IconButton
                      size="lg"
                      onClick={() => restoreChunkSourceText(currentChunk.id)}
                      title={t('document.restoreSourceText')}
                      disabled={sourceEditDisabled}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  )}
                </div>
              }
              scrollRef={scrollSourceRef}
            >
              <MarkdownEditor
                value={currentChunk.sourceDisplayText}
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
            const lockToggle = (
              <IconButton
                size="sm"
                tone={currentChunk.translationLocked ? 'success' : 'muted'}
                title={currentChunk.translationLocked ? t('document.unlockTranslation') : t('document.lockTranslation')}
                onClick={() => handleLockToggle(currentChunk)}
                disabled={!currentChunk.currentDraft?.trim()}
                ariaPressed={currentChunk.translationLocked === true}
              >
                <Lock size={13} />
              </IconButton>
            );
            const stageButtons = enabledStages.map((s) => {
              const Icon = s.role === 'refine' ? Wand2 : s.role === 'format' ? FileText : Languages;
              const isActive = effectiveSelectedStageId === s.id;
              const hasContent = s.id === lastStageId
                ? true
                : !!(currentChunk.stageResults[s.id]?.content);
              return (
                <IconButton
                  key={s.id}
                  size="lg"
                  tone={isActive && !showDiffMode ? 'accent' : 'default'}
                  onClick={() => setSelectedStageId(s.id)}
                  title={t('document.viewStageResult', { stage: t(`pipeline.stageRole.${s.role ?? 'translation'}`) })}
                  disabled={!hasContent || showDiffMode}
                  ariaPressed={isActive && !showDiffMode}
                >
                  <Icon size={14} />
                </IconButton>
              );
            });
            const diffButtons = diffPairs.map((pair) => {
              const isActive = pair.key === diffPairKey && showDiffMode;
              const fromStage = enabledStages.find((s) => s.id === pair.fromId);
              const DiffIcon = fromStage?.role === 'refine' ? Wand2 : fromStage?.role === 'format' ? FileText : Languages;
              return (
                <IconButton
                  key={pair.key}
                  size="lg"
                  tone={isActive ? 'accent' : 'default'}
                  onClick={() => setDiffPairKey(pair.key)}
                  title={`${pair.fromName} → ${pair.toName}`}
                  disabled={!showDiffMode}
                  ariaPressed={isActive}
                >
                  <DiffIcon size={14} />
                </IconButton>
              );
            });
            const stageActions = isEditorialMode ? (
              <div className="flex items-center gap-1">
                {stageButtons}
                <span className="mx-1 h-4 w-px bg-editorial-border/60" aria-hidden="true" />
                <IconButton
                  size="lg"
                  tone={showDiffMode ? 'accent' : 'default'}
                  onClick={() => {
                    if (paneFocus !== 'translation') return;
                    setShowDiffMode(!showDiffMode);
                  }}
                  title={showDiffMode ? t('document.diffModeDisable') : t('document.diffModeEnable')}
                  ariaPressed={showDiffMode}
                  disabled={paneFocus !== 'translation'}
                >
                  <GitCompare size={14} />
                </IconButton>
                {diffButtons}
              </div>
            ) : null;

            return (
              <DocumentPage
                label={t('pipeline.candidateTranslation')}
                eyebrow={t('document.rightPage')}
                eyebrowMeta={currentChunk.status === 'preview' ? (
                  <Tooltip label={t('document.chunkPreviewBadge')}>
                    <span aria-label={t('document.chunkPreviewBadge')} className="inline-flex items-center text-editorial-muted/70">
                      <FlaskConical size={11} />
                    </span>
                  </Tooltip>
                ) : null}
                subtitle={
                  showDiffMode && activeDiffPair
                    ? `${activeDiffPair.fromName} → ${activeDiffPair.toName}`
                    : undefined
                }
                titleMeta={rawStageContent ? <CopyButton text={rawStageContent} /> : null}
                actions={stageActions}
                statusBadge={currentChunk.translationStale ? (
                  <InlineStatusBadge tone="amber" icon={<AlertTriangle size={13} />} label={t('document.translationStaleBadge')} />
                ) : lockToggle}
                scrollRef={scrollTranslationRef}
              >
                {showDiffMode ? (
                  <div className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <HighlightedText
                      html={stageDiff.html}
                      className="text-[15px] leading-8 text-editorial-ink min-h-[280px]"
                    />
                  </div>
                ) : (
                  <MarkdownEditor
                    value={rawStageContent}
                    onChange={isLastSelected ? (nextValue) => updateChunkDraft(currentChunk.id, nextValue) : NOOP_CHANGE}
                    markdownEnabled={config.markdownAware === true}
                    readOnly={stageReadOnly}
                    fillHeight
                    textClassName="text-[15px] leading-8 text-editorial-ink"
                    previewClassName="min-h-[280px] text-[15px] leading-8 text-editorial-ink"
                    placeholder={isLastSelected ? t('pipeline.candidatePlaceholder') : ''}
                    highlightHtml={(showHighlight || (highlightsEnabled && !!searchQuery.trim()) || !!focusedIssueQuery) ? translationHighlight.html : null}
                    focusQuery={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueQuery : null}
                    focusRequestId={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueRequestId : 0}
                  />
                )}
              </DocumentPage>
            );
          })()}
        </div>

      </div>
      {traceStageId ? (
        <StageTraceDialog
          chunk={currentChunk}
          stage={config.stages.find((entry) => entry.id === traceStageId) ?? null}
          isJudge={traceStageId === '_judge'}
          onClose={() => setTraceStageId(null)}
        />
      ) : null}
    </section>
  );
}

interface DocumentPageProps {
  label: string;
  eyebrow: string;
  eyebrowMeta?: React.ReactNode;
  subtitle?: string;
  subtitleAction?: React.ReactNode;
  readOnly?: boolean;
  highlighted?: boolean;
  titleMeta?: React.ReactNode;
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode | null;
  footer?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

function StageTraceDialog({
  chunk,
  stage,
  isJudge = false,
  onClose,
}: {
  chunk: TranslationChunk;
  stage: ReturnType<typeof usePipelineStore.getState>['config']['stages'][number] | null;
  isJudge?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onClose);
  const result = isJudge ? chunk.judgeResult : stage ? chunk.stageResults[stage.id] : null;
  const dialogTitle = isJudge ? t('pipeline.audit') : (stage?.name ?? t('errors.unknownError'));

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
            {dialogTitle}
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
  eyebrowMeta,
  subtitle,
  subtitleAction,
  readOnly = false,
  highlighted = false,
  titleMeta,
  statusBadge,
  actions,
  footer,
  scrollRef,
  children,
}: DocumentPageProps) {
  return (
    <section className={`relative rounded-[24px] bg-editorial-page px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_45px_rgba(74,50,17,0.08)] flex flex-col min-h-0 ${
      highlighted ? 'border border-editorial-accent ring-2 ring-editorial-accent/30' : 'border border-editorial-divider'
    }`}>
      {/* Header con altezza minima fissa per allineare il corpo testo tra i due pannelli */}
      <div className="mb-4 shrink-0 flex items-start justify-between gap-4 border-b border-editorial-divider-soft pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {eyebrow}
            </div>
            {eyebrowMeta}
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
        <div className="shrink-0 flex items-center gap-2 pt-1 ml-6">
          {titleMeta}
          {titleMeta && actions && (
            <span className="h-4 w-px bg-editorial-border/60" aria-hidden="true" />
          )}
          {actions}
        </div>
      </div>
      <div ref={scrollRef} className={`flex flex-col flex-1 min-h-0 ${readOnly ? 'opacity-90' : ''}`}>
        {children}
      </div>
      {footer && (
        <div className="mt-3 pt-3 border-t border-editorial-divider-soft shrink-0">
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
  ariaLabel,
}: {
  tone: 'amber' | 'emerald' | 'muted';
  icon: React.ReactNode;
  label?: string;
  ariaLabel?: string;
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink'
      : tone === 'emerald'
        ? 'border-editorial-success/50 bg-editorial-success/8 text-editorial-success'
        : 'border-editorial-border bg-editorial-textbox/60 text-editorial-muted';
  return (
    <Tooltip label={label ?? ariaLabel}>
      <span
        aria-label={ariaLabel ?? label}
        className={`inline-flex items-center rounded-full border ${label ? 'gap-1.5 px-2.5 py-1' : 'p-1.5'} ${toneClasses}`}
      >
        {icon}
        {label && (
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
        )}
      </span>
    </Tooltip>
  );
}
