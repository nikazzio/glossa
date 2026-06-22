import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  FlaskConical,
  GitCompare,
  Languages,
  Lock,
  PanelLeft,
  PanelRight,
  Pencil,
  RotateCcw,
  ScanLine,
  Search,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { indexPad } from '../../utils';
import { CopyButton, HighlightedText, MarkdownEditor, DOC_FONT_SIZE_STEP_INDEX } from '../common';
import { IconButton, Tooltip, type IconButtonTone } from '../ui';
import { composeAnnotatedMarkdown } from '../../utils/annotationMarkdown';
import { restoreFootnoteMarkers } from '../../utils/footnoteExtractor';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePanelScrollSync } from '../../hooks/usePanelScrollSync';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { useDocumentViewState } from './hooks/useDocumentViewState';
import { StageTraceDialog } from './StageTraceDialog';
import { AnnotationContextMenu } from './AnnotationContextMenu';
import { PaneSearch } from './PaneSearch';
import { InlineStatusBadge } from './InlineStatusBadge';

const NOOP_CHANGE = () => {};

interface DocumentViewProps {
  onRetranslateChunk: (chunkId: string) => void;
  onImportDocument: () => void;
}

const STAGE_TONE_MAP: Record<string, IconButtonTone> = {
  completed: 'success',
  processing: 'running',
  retrying: 'running',
  error: 'accent',
  idle: 'muted',
};

function buildChunkMinimapLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  chunk: { status: string; translationLocked?: boolean },
  index: number,
  total: number,
  isCurrent: boolean,
  annotationCount: number,
): string {
  const parts = [
    `${t('document.chunkLabel')} ${index + 1}/${total}`,
    t(`pipeline.chunkStatus.${chunk.status}`),
  ];
  if (chunk.translationLocked) parts.push(t('document.translationLockedBadge'));
  if (annotationCount > 0) parts.push(t('annotations.badgeCount', { count: annotationCount }));
  if (isCurrent) parts.push(t('document.currentChunkBadge'));
  return parts.join(' · ');
}

interface DocumentPageProps {
  label: string;
  eyebrow: string;
  eyebrowMeta?: React.ReactNode;
  subtitle?: string;
  subtitleAction?: React.ReactNode;
  readOnly?: boolean;
  highlighted?: boolean;
  // Shell nuova (#291): pannello "a filo" — niente cornice arrotondata/ombra/beige,
  // riempie l'altezza; i due pannelli diventano bianchi adiacenti con un solo divisorio.
  flush?: boolean;
  titleMeta?: React.ReactNode;
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode | null;
  footer?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

function DocumentPage({
  label,
  eyebrow,
  eyebrowMeta,
  subtitle,
  subtitleAction,
  readOnly = false,
  highlighted = false,
  flush = false,
  titleMeta,
  statusBadge,
  actions,
  footer,
  searchValue,
  onSearchChange,
  searchLabel,
  scrollRef,
  children,
}: DocumentPageProps) {
  const { t } = useTranslation();
  const searchable = Boolean(onSearchChange && searchLabel);
  const [searchOpen, setSearchOpen] = useState(false);
  // Il campo resta aperto finché c'è una query attiva.
  const showSearch = searchable && (searchOpen || Boolean(searchValue));

  return (
    <section className={
      flush
        ? `relative bg-editorial-page px-6 py-5 flex flex-col flex-1 min-h-0 ${highlighted ? 'ring-2 ring-inset ring-editorial-accent/40' : ''}`
        : `relative rounded-[24px] bg-editorial-page px-6 py-5 shadow-[var(--inset-highlight-strong),var(--shadow-page-card)] flex flex-col min-h-0 ${
            highlighted ? 'border border-editorial-accent ring-2 ring-editorial-accent/30' : 'border border-editorial-divider'
          }`
    }>
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
            {searchable ? (
              <IconButton
                size="sm"
                tone={showSearch ? 'accent' : 'default'}
                onClick={() => setSearchOpen((open) => !open)}
                title={t('document.searchInPane')}
                ariaLabel={t('document.searchInPane')}
                ariaPressed={showSearch}
              >
                <Search size={13} />
              </IconButton>
            ) : null}
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
        {showSearch && onSearchChange && searchLabel ? (
          <PaneSearch
            value={searchValue ?? ''}
            onChange={onSearchChange}
            label={searchLabel}
            autoFocus
          />
        ) : null}
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

export function DocumentView({
  onRetranslateChunk: _onRetranslateChunk,
  onImportDocument,
}: DocumentViewProps) {
  const { t } = useTranslation();
  const { config } = usePipelineStore();
  const { currentProjectId, projects } = useProjectStore();
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const annotationsByChunkId = useAnnotationsStore((s) => s.annotationsByChunkId);
  const {
    updateChunkDraft,
    updateChunkOriginalText,
    restoreChunkSourceText,
    toggleChunkTranslationLock,
    toggleChunkSourceEditing,
  } = useChunksStore();
  usePhraseMemoryAutoSearch();

  const {
    traceStageId,
    setTraceStageId,
    focusedChunkId,
    focusedIssueQuery,
    focusedSourceIssueQuery,
    focusedIssueRequestId,
    setShowChunkDrawer,
    setPendingAnnotationAnchor,
    documentFontSize,
    useNewShell,
    setDocumentPaneFocus,
  } = useUiStore();

  const fontSizeStep = DOC_FONT_SIZE_STEP_INDEX[documentFontSize ?? 'md'];

  const [annotationMenu, setAnnotationMenu] = useState<{ x: number; y: number; text: string; chunkId: string } | null>(null);

  const {
    documentLayout,
    paneFocus,
    syncScrollEnabled,
    chunks,
    currentIndex,
    currentChunk,
    enabledStages,
    lastStageId,
    isEditorialMode,
    selectedStageId: _selectedStageId,
    setSelectedStageId,
    effectiveSelectedStageId,
    isLastSelected,
    rawStageContent,
    showDiffMode,
    setShowDiffMode,
    diffPairKey,
    setDiffPairKey,
    diffPairs,
    activeDiffPair,
    stageDiff,
    sourcePaneSearch,
    setSourcePaneSearch,
    translationPaneSearch,
    setTranslationPaneSearch,
    showHighlight,
    sourceHighlightHtml,
    translationHighlight,
    translationHighlightHtml,
    translationEffectiveSearch,
    setSelectedChunkId,
  } = useDocumentViewState();

  const { sourceRef: scrollSourceRef, translationRef: scrollTranslationRef } = usePanelScrollSync(
    paneFocus === 'both' && syncScrollEnabled,
  );

  const handleLockToggle = (chunk: typeof currentChunk) => {
    if (chunk) toggleChunkTranslationLock(chunk.id);
  };

  const currentProject = projects.find((project) => project.id === currentProjectId) ?? null;

  // The source display text carries bracketed superscript markers ([¹], …),
  // which are not GFM. Restore them to `[^id]` so the renderer links them to
  // the definitions and emits the footnote section in preview.
  const sourcePreviewValue = (() => {
    const footnotes = currentChunk?.footnotes;
    if (!footnotes?.length) return undefined;
    const body = restoreFootnoteMarkers(currentChunk!.sourceDisplayText, footnotes);
    const defs = footnotes.map((fn) => `[^${fn.id}]: ${fn.text}`).join('\n\n');
    return `${body}\n\n${defs}`;
  })();

  // Annotation notes are injected only at render time — the stored draft is
  // never mutated, so it cannot be corrupted by note insertion. Applies to the
  // final draft only (annotations anchor into the final translation).
  const translationPreviewValue = (() => {
    if (!currentChunk || !isLastSelected) return undefined;
    const annotations = annotationsByChunkId.get(currentChunk.id) ?? [];
    if (annotations.length === 0) return undefined;
    const composed = composeAnnotatedMarkdown(rawStageContent, annotations);
    return composed === rawStageContent ? undefined : composed;
  })();

  if (!currentChunk) {
    return (
      <section className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto bg-editorial-paper px-6 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted">
              <span>{activeWorkspace?.name ?? t('workspace.noActive')}</span>
              <span className="h-1 w-1 rounded-full bg-editorial-accent/60" aria-hidden="true" />
              <span>{t('document.projectHomeEyebrow')}</span>
          </div>
          <h2 className="mt-4 max-w-3xl font-display text-4xl italic tracking-tight text-editorial-ink md:text-5xl">
            {currentProject?.name ?? t('document.projectHomeTitle')}
          </h2>
          <p className="mt-3 text-sm text-editorial-muted">
            {t('document.projectHomeEmpty')}
          </p>

          <button
            type="button"
            onClick={onImportDocument}
            aria-label={t('document.projectHomeImport')}
            title={t('document.projectHomeImport')}
            className="group mt-8 flex w-full max-w-xl flex-col items-center rounded-[30px] border border-dashed border-editorial-border bg-editorial-bg/65 px-6 py-8 text-center shadow-[var(--inset-highlight)] transition-colors hover:border-editorial-accent/40 hover:bg-editorial-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-editorial-border bg-editorial-paper text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
              <FileText size={22} />
            </span>
            <span className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-editorial-muted transition-colors group-hover:text-editorial-accent">
              {t('document.projectHomeImport')}
            </span>
          </button>
        </div>
      </section>
    );
  }

  // Colonne in modalità "entrambi": la scelta layout comanda (book = affiancate,
  // standard = impilate); 'auto' affianca solo quando lo spazio REALE del documento
  // lo consente (container query, non viewport — la barra/fly-out riducono lo spazio).
  const bothColumnsClass =
    paneFocus !== 'both'
      ? 'grid-cols-1'
      : documentLayout === 'standard'
        ? 'grid-cols-1'
        : documentLayout === 'book'
          ? 'grid-cols-2'
          : '@[820px]:grid-cols-2';
  const prevChunk = chunks[currentIndex - 1];
  const nextChunk = chunks[currentIndex + 1];
  const sourceReadOnly =
    currentChunk.status === 'processing' ||
    currentChunk.sourceEditable !== true;
  const sourceEditDisabled = currentChunk.status === 'processing';

  // Pallini minimap dei frammenti, estratti per poterli mettere in linea fra le frecce
  // (shell nuova, barra di navigazione stretta) o su una riga sotto (shell vecchia).
  const chunkMinimapDots =
    chunks.length > 1
      ? chunks.map((chunk, idx) => {
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
          const chunkAnnotations = annotationsByChunkId.get(chunk.id) ?? [];
          const annotDotColor = chunkAnnotations.some((a) => a.type === 'problem')
            ? 'bg-editorial-accent'
            : chunkAnnotations.some((a) => a.type === 'doubt')
              ? 'bg-editorial-warning'
              : chunkAnnotations.length > 0
                ? 'bg-editorial-charcoal/70'
                : null;
          const buttonLabel = buildChunkMinimapLabel(t, chunk, idx, chunks.length, isCurrent, chunkAnnotations.length);
          const sizeClass = chunk.translationLocked
            ? isCurrent
              ? 'h-5 w-5'
              : 'h-4.5 w-4.5'
            : isCurrent
              ? 'h-4.5 w-4.5'
              : 'h-4 w-4';
          return (
            <Tooltip key={chunk.id} label={buttonLabel}>
              <button
                type="button"
                onClick={() => setSelectedChunkId(chunk.id)}
                aria-label={buttonLabel}
                aria-current={isCurrent ? 'true' : undefined}
                className={`relative shrink-0 rounded-full transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isCurrent
                    ? `${sizeClass} border border-editorial-charcoal/28 ${segmentTone} shadow-[var(--chunk-current-ring)]`
                    : `${sizeClass} ${segmentTone} hover:-translate-y-px hover:ring-1 hover:ring-editorial-charcoal/12`
                }`}
              >
                {chunk.translationLocked ? (
                  <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-editorial-success" />
                ) : null}
                {annotDotColor && (
                  <span className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${annotDotColor} ring-1 ring-editorial-bg`} />
                )}
              </button>
            </Tooltip>
          );
        })
      : null;

  return (
    <section className="w-full bg-editorial-paper overflow-y-auto min-h-0 h-full custom-scrollbar flex flex-col">
      <div className={`@container mx-auto w-full flex flex-col flex-1 min-h-0 ${useNewShell ? '' : 'max-w-[1720px] px-5 py-3 md:px-6 md:py-4 gap-5'}`}>
        <div className="shrink-0">
          {/* Navigation bar — shell nuova: a filo (border-b, niente card flottante) */}
          <div className={useNewShell
            ? 'w-full border-b border-editorial-border px-4 py-2.5'
            : 'w-full rounded-[20px] border border-editorial-border bg-editorial-bg/90 px-4 py-3 shadow-[var(--shadow-warm-sm)]'}>
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

              {useNewShell ? (
                // Barra di navigazione stretta: frecce + pallini al centro + conteggio compatto in linea.
                <div className="flex flex-1 min-w-0 items-center justify-center gap-2">
                  <IconButton
                    size="md"
                    onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
                    title={t('document.previousChunk')}
                    disabled={!prevChunk}
                  >
                    <ChevronLeft size={15} />
                  </IconButton>
                  {chunkMinimapDots ? (
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">{chunkMinimapDots}</div>
                  ) : null}
                  <IconButton
                    size="md"
                    onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
                    title={t('document.nextChunk')}
                    disabled={!nextChunk}
                  >
                    <ChevronRight size={15} />
                  </IconButton>
                  <span className="ml-1 shrink-0 font-mono text-xs font-bold tabular-nums text-editorial-muted">
                    {indexPad(currentIndex + 1)} / {indexPad(chunks.length)}
                  </span>
                </div>
              ) : (
                <>
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
                      <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted">
                        {t('document.chunkLabel')}
                      </div>
                      <div className="font-display text-[1.8rem] italic leading-none text-editorial-accent">
                        {indexPad(currentIndex + 1)}<span className="px-1 text-editorial-muted">/</span>{indexPad(chunks.length)}
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
                </>
              )}

              {/* Shell nuova (#291): gruppo Vista — fuoco pannelli + evidenziazioni + scroll.
                  Nella shell vecchia questi controlli vivono nella barra sinistra. */}
              {useNewShell && (
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="md"
                    tone={paneFocus === 'both' ? 'accent' : 'default'}
                    onClick={() => setDocumentPaneFocus('both')}
                    title={t('document.focusBoth')}
                    ariaPressed={paneFocus === 'both'}
                  >
                    <Columns2 size={14} />
                  </IconButton>
                  <IconButton
                    size="md"
                    tone={paneFocus === 'source' ? 'accent' : 'default'}
                    onClick={() => setDocumentPaneFocus('source')}
                    title={t('document.focusSource')}
                    ariaPressed={paneFocus === 'source'}
                  >
                    <PanelLeft size={14} />
                  </IconButton>
                  <IconButton
                    size="md"
                    tone={paneFocus === 'translation' ? 'accent' : 'default'}
                    onClick={() => setDocumentPaneFocus('translation')}
                    title={t('document.focusTranslation')}
                    ariaPressed={paneFocus === 'translation'}
                  >
                    <PanelRight size={14} />
                  </IconButton>
                </div>
              )}
            </div>

            {!useNewShell && chunkMinimapDots ? (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
                {chunkMinimapDots}
              </div>
            ) : null}
          </div>
        </div>

        <div className={
          useNewShell
            ? 'flex flex-1 min-h-0 divide-x divide-editorial-border'
            : `grid gap-5 flex-1 min-h-0 auto-rows-fr ${bothColumnsClass}`
        }>
          {paneFocus !== 'translation' && (
            <DocumentPage
              label={t('pipeline.originalSource')}
              eyebrow={t('document.leftPage')}
              flush={useNewShell}
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
              searchValue={sourcePaneSearch}
              onSearchChange={setSourcePaneSearch}
              searchLabel={t('document.searchInSource')}
              scrollRef={scrollSourceRef}
            >
              <MarkdownEditor
                identityKey={`${currentChunk.id}:source`}
                value={currentChunk.sourceDisplayText}
                onChange={(nextValue) => updateChunkOriginalText(currentChunk.id, nextValue)}
                markdownEnabled={config.markdownAware === true}
                disabled={currentChunk.status === 'processing'}
                readOnly={sourceReadOnly}
                fillHeight
                textClassName="doc-content text-editorial-ink"
                previewClassName="min-h-[280px] doc-content text-editorial-ink"
                highlightHtml={sourceHighlightHtml}
                previewValue={sourcePreviewValue}
                focusQuery={focusedChunkId === currentChunk.id ? focusedSourceIssueQuery : null}
                focusRequestId={focusedChunkId === currentChunk.id ? focusedIssueRequestId : 0}
                defaultTextSizeStep={fontSizeStep}
                useDocLineHeight
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
                flush={useNewShell}
                eyebrowMeta={currentChunk.status === 'preview' ? (
                  <Tooltip label={t('document.chunkPreviewBadge')}>
                    <span aria-label={t('document.chunkPreviewBadge')} className="inline-flex items-center text-editorial-muted">
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
                searchValue={translationPaneSearch}
                onSearchChange={setTranslationPaneSearch}
                searchLabel={t('document.searchInTranslation')}
                scrollRef={scrollTranslationRef}
              >
                <div
                  className="flex flex-col flex-1 min-h-0"
                  onContextMenu={(e) => {
                    const text = window.getSelection()?.toString().trim() ?? '';
                    if (!text) return;
                    e.preventDefault();
                    setAnnotationMenu({ x: e.clientX, y: e.clientY, text, chunkId: currentChunk.id });
                  }}
                >
                  {showDiffMode ? (
                    <div data-scroll-sync="true" className="flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                      <HighlightedText
                        html={stageDiff.html}
                        className="doc-content text-editorial-ink min-h-[280px]"
                      />
                    </div>
                  ) : (
                    <MarkdownEditor
                      identityKey={`${currentChunk.id}:candidate:${effectiveSelectedStageId}`}
                      value={rawStageContent}
                      onChange={isLastSelected ? (nextValue) => updateChunkDraft(currentChunk.id, nextValue) : NOOP_CHANGE}
                      markdownEnabled={config.markdownAware === true}
                      readOnly={stageReadOnly}
                      fillHeight
                      textClassName="doc-content text-editorial-ink"
                      previewClassName="min-h-[280px] doc-content text-editorial-ink"
                      placeholder={isLastSelected ? t('pipeline.candidatePlaceholder') : ''}
                      highlightHtml={translationHighlightHtml}
                      previewValue={translationPreviewValue}
                      focusQuery={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueQuery : null}
                      focusRequestId={isLastSelected && focusedChunkId === currentChunk.id ? focusedIssueRequestId : 0}
                      defaultTextSizeStep={fontSizeStep}
                      useDocLineHeight
                    />
                  )}
                </div>
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
      {annotationMenu ? (
        <AnnotationContextMenu
          x={annotationMenu.x}
          y={annotationMenu.y}
          onAddAnnotation={() => {
            setPendingAnnotationAnchor({ chunkId: annotationMenu.chunkId, text: annotationMenu.text });
            setShowChunkDrawer(true, 'notes');
          }}
          onClose={() => setAnnotationMenu(null)}
        />
      ) : null}
    </section>
  );
}
