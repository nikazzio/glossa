import {
  AlertTriangle,
  FileText,
  GitCompare,
  Languages,
  Lock,
  Pencil,
  ScanLine,
  Search,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useOperationLogStore } from '../../stores/operationLogStore';
import { HighlightedText, MarkdownEditor, DOC_FONT_SIZE_STEP_INDEX } from '../common';
import { IconButton, Tooltip, Popover, ScopeBreakdownCarousel, type IconButtonTone } from '../ui';
import { composeAnnotatedMarkdown } from '../../utils/annotationMarkdown';
import { restoreFootnoteMarkers } from '../../utils/footnoteExtractor';
import { summarizeChunkUsage, formatUsd } from '../../utils/operationLogStats';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePanelScrollSync } from '../../hooks/usePanelScrollSync';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { useDocumentViewState } from './hooks/useDocumentViewState';
import { StageTraceDialog } from './StageTraceDialog';
import { AnnotationContextMenu } from './AnnotationContextMenu';
import { PaneSearch } from './PaneSearch';
import { DocumentViewControls } from './DocumentViewControls';
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
  error: 'danger',
  idle: 'muted',
};

function buildChunkMinimapLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  chunk: {
    status: string;
    translationLocked?: boolean;
    translationStale?: boolean;
  },
  index: number,
  total: number,
  isCurrent: boolean,
  annotationCount: number,
  unresolvedIssueCount: number,
): string {
  const parts = [
    `${t('document.chunkLabel')} ${index + 1}/${total}`,
    t(`pipeline.chunkStatus.${chunk.status}`),
  ];
  if (chunk.translationLocked) parts.push(t('document.translationLockedBadge'));
  if (annotationCount > 0) parts.push(t('annotations.badgeCount', { count: annotationCount }));
  if (unresolvedIssueCount > 0) parts.push(t('audit.issuesCount', { count: unresolvedIssueCount }));
  if (chunk.translationStale) parts.push(t('document.translationStaleBadge'));
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
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode | null;
  // Pulsante che apre il menu controlli testo, in fila con le azioni pagina.
  textMenuButton?: React.ReactNode;
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
  statusBadge,
  actions,
  textMenuButton,
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

  const searchToggle = searchable ? (
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
  ) : null;

  return (
    <section className={`relative bg-editorial-bg px-12 py-8 flex flex-col flex-1 min-h-0 ${
      highlighted ? 'ring-2 ring-inset ring-editorial-accent/40' : ''
    }`}>
      {/* Header: riga unica allineata al titolo — controlli pagina + pulsante menu testo a destra. */}
      <div className="shrink-0 mb-6 border-b border-editorial-divider-soft pb-4">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-muted">
            {eyebrow}
          </div>
          {eyebrowMeta}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-display text-[1.7rem] italic tracking-tight text-editorial-ink">
              {label}
            </h3>
            {statusBadge}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {searchToggle}
            {actions}
            {(searchToggle || actions) && textMenuButton && (
              <span className="h-4 w-px bg-editorial-border/60" aria-hidden="true" />
            )}
            {textMenuButton}
          </div>
        </div>
        {subtitle && (
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-accent">
              {subtitle}
            </p>
            {subtitleAction}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-editorial-border/50 bg-editorial-page px-7 py-4 shadow-[var(--shadow-page-card)] ${readOnly ? 'opacity-90' : ''}`}
      >
        {showSearch && onSearchChange && searchLabel ? (
          <PaneSearch
            value={searchValue ?? ''}
            onChange={onSearchChange}
            label={searchLabel}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- si apre da un'azione esplicita dell'utente (mostra ricerca)
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
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const operationLogEntries = useOperationLogStore((s) => s.entries);
  const {
    updateChunkDraft,
    updateChunkSourceText,
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
    setChunkRailTab,
    setProjectContextCollapsed,
    setPendingAnnotationAnchor,
    documentFontSize,
    setDocumentPaneFocus,
  } = useUiStore();

  const fontSizeStep = DOC_FONT_SIZE_STEP_INDEX[documentFontSize ?? 'md'];

  const [annotationMenu, setAnnotationMenu] = useState<{ x: number; y: number; text: string; chunkId: string } | null>(null);
  // Shell nuova (#291): menu controlli testo, uno per pannello (sorgente / traduzione).
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);

  // Minimap frammenti: tiene sempre in vista il pallino del frammento corrente,
  // anche quando la riga è scrollata altrove o il documento ha molti frammenti.
  const currentDotRef = useRef<HTMLButtonElement | null>(null);

  const {
    paneFocus,
    syncScrollEnabled,
    chunks,
    currentIndex,
    currentChunk,
    enabledStages,
    lastStageId,
    isEditorialMode,
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
    sourceHighlightHtml,
    translationHighlightHtml,
    setSelectedChunkId,
  } = useDocumentViewState();

  const { sourceRef: scrollSourceRef, translationRef: scrollTranslationRef } = usePanelScrollSync(
    paneFocus === 'both' && syncScrollEnabled,
  );

  useEffect(() => {
    currentDotRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentChunk?.id]);

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
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-editorial-muted">
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

          <Tooltip label={t('document.projectHomeImport')} className="w-full max-w-xl">
          <button
            type="button"
            onClick={onImportDocument}
            aria-label={t('document.projectHomeImport')}
            className="group mt-8 flex w-full max-w-xl flex-col items-center rounded-[30px] border border-dashed border-editorial-border bg-editorial-bg/65 px-6 py-8 text-center shadow-[var(--inset-highlight)] transition-colors hover:border-editorial-accent/40 hover:bg-editorial-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-editorial-border bg-editorial-paper text-editorial-muted transition-colors group-hover:border-editorial-accent/45 group-hover:text-editorial-accent">
              <FileText size={22} />
            </span>
            <span className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-editorial-muted transition-colors group-hover:text-editorial-accent">
              {t('document.projectHomeImport')}
            </span>
          </button>
          </Tooltip>
        </div>
      </section>
    );
  }

  const sourceReadOnly =
    currentChunk.status === 'processing' ||
    currentChunk.sourceEditable !== true;
  const sourceEditDisabled = currentChunk.status === 'processing';

  // Pallini minimap dei frammenti, estratti per poterli mettere in linea fra le frecce
  // (shell nuova, barra di navigazione stretta) o su una riga sotto (shell vecchia).
  const chunkMinimapDots =
    chunks.length > 1
      ? chunks.map((chunk, idx) => {
          const statusDotClass =
            chunk.status === 'completed'
              ? 'h-1.5 w-1.5 rounded-full bg-editorial-success'
              : chunk.status === 'error'
                ? 'h-2 w-2 rounded-[2px] bg-editorial-danger'
                : chunk.status === 'processing'
                  ? 'h-1 w-2.5 rounded-full bg-editorial-running animate-pulse'
                  : 'h-2.5 w-2.5 rounded-full border border-editorial-border bg-transparent';
          const isCurrent = idx === currentIndex;
          const chunkAnnotations = annotationsByChunkId.get(chunk.id) ?? [];
          const unresolvedIssueCount = chunk.judgeResult.status === 'completed'
            ? chunk.judgeResult.issues.filter((issue) => !issue.resolved && !issue.rejected).length
            : 0;
          const annotDotColor = chunkAnnotations.some((a) => a.type === 'problem')
            ? 'bg-editorial-danger'
            : chunkAnnotations.some((a) => a.type === 'doubt')
              ? 'bg-editorial-warning'
              : chunkAnnotations.length > 0
                ? 'bg-editorial-charcoal/70'
                : null;
          const buttonLabel = buildChunkMinimapLabel(
            t,
            chunk,
            idx,
            chunks.length,
            isCurrent,
            chunkAnnotations.length,
            unresolvedIssueCount,
          );
          return (
            <Tooltip key={chunk.id} label={buttonLabel}>
              <button
                type="button"
                ref={isCurrent ? currentDotRef : undefined}
                onClick={() => setSelectedChunkId(chunk.id)}
                aria-label={buttonLabel}
                aria-current={isCurrent ? 'true' : undefined}
                className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-150 ease-out hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-editorial-border bg-surface-elevated">
                  <span aria-hidden="true" className={statusDotClass} />
                </span>
                {unresolvedIssueCount > 0 && <span aria-hidden="true" className="absolute left-1 top-1 h-2 w-2 rounded-full bg-editorial-danger ring-1 ring-editorial-page" />}
                {annotDotColor && (
                  <span aria-hidden="true" className={`absolute right-1 top-1 h-2 w-2 rounded-full ${annotDotColor} ring-1 ring-editorial-page`} />
                )}
                {chunk.translationLocked && <span aria-hidden="true" className="absolute bottom-1 left-1 h-2 w-2 rounded-full bg-editorial-success ring-1 ring-editorial-page" />}
                {chunk.translationStale && <span aria-hidden="true" className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-editorial-running ring-1 ring-editorial-page" />}
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[3.5px] border-b-[4.5px] border-x-transparent border-b-editorial-accent"
                  />
                )}
              </button>
            </Tooltip>
          );
        })
      : null;

  // Token/costo del frammento corrente, sommati su tutti gli stage/passaggi —
  // niente nome modello: la pipeline può usarne più di uno per lo stesso frammento.
  const currentChunkUsage = summarizeChunkUsage(operationLogEntries, currentChunk.id, pricingOverrides);
  const currentChunkTokens = currentChunkUsage.total.totalInput + currentChunkUsage.total.totalOutput;
  const hasCurrentChunkUsage = currentChunkTokens > 0 || currentChunkUsage.total.totalUsd !== null;

  // Stati pipeline (icone con tone di stato) — condivisi fra shell vecchia e nuova.
  const stageStatusButtons = (
    <div className="flex flex-wrap items-center gap-1.5">
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
  );

  // Pulsante unico che apre il menu controlli testo, in fila con le azioni pagina.
  const renderTextMenuButton = (open: boolean, toggle: () => void) => (
    <IconButton
      size="lg"
      tone={open ? 'accent' : 'default'}
      onClick={toggle}
      title={t('editor.textMenu')}
      ariaPressed={open}
    >
      <SlidersHorizontal size={14} />
    </IconButton>
  );

  return (
    <section className="w-full overflow-y-auto min-h-0 h-full custom-scrollbar flex flex-col bg-editorial-page">
      <div className="@container mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="shrink-0">
          {/* Barra di navigazione a filo (border-b, allineata alle testate dei pannelli
              laterali). Stati del chunk sopra, minimap pallini sotto; a destra token/costo
              del frammento corrente (spazio altrimenti vuoto — #296 follow-up). */}
          <div className="w-full h-28 flex items-stretch gap-5 border-b border-editorial-border bg-editorial-page px-6 py-2">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              {stageStatusButtons}
              {chunkMinimapDots ? (
                <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible custom-scrollbar py-1.5">
                  {chunkMinimapDots}
                </div>
              ) : null}
            </div>
            {hasCurrentChunkUsage && (
              <Popover
                side="bottom"
                align="end"
                className="w-72 px-3"
                trigger={
                  <div className="flex shrink-0 items-center gap-6 border-l border-editorial-border pl-5 cursor-default">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
                        {t('pipeline.unit')}
                      </span>
                      <span className="font-display text-base italic text-editorial-ink tabular-nums">
                        {currentIndex + 1}<span className="text-editorial-muted">/{chunks.length}</span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
                        {t('header.tokenCount')}
                      </span>
                      <span className="font-display text-base italic text-editorial-ink tabular-nums">
                        {currentChunkTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-editorial-muted">
                        {t('header.estimatedCost')}
                      </span>
                      <span className="font-display text-base italic text-editorial-accent tabular-nums">
                        {formatUsd(currentChunkUsage.total.totalUsd)}
                      </span>
                    </div>
                  </div>
                }
              >
                {currentChunkUsage.scopeBreakdown.length > 0 ? (
                  <ScopeBreakdownCarousel entries={currentChunkUsage.scopeBreakdown} title={t('cost.breakdown')} />
                ) : (
                  <p className="py-4 text-center text-xs text-editorial-muted">{t('cost.unknown')}</p>
                )}
              </Popover>
            )}
            {/* Terza colonna della barra: i comandi di vista del testo, allineati
                al centro come il blocco di token e costo e separati dallo stesso
                bordo. Stanno qui e non nella barra di stato perché agiscono su
                ciò che hanno sotto, e perché la barra di stato deve avere la
                stessa forma in ogni sezione. */}
            <div className="flex shrink-0 items-center border-l border-editorial-border pl-5">
              <DocumentViewControls />
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-editorial-border">
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
                </div>
              }
              searchValue={sourcePaneSearch}
              onSearchChange={setSourcePaneSearch}
              searchLabel={t('document.searchInSource')}
              textMenuButton={renderTextMenuButton(sourceMenuOpen, () => setSourceMenuOpen((open) => !open))}
              scrollRef={scrollSourceRef}
            >
              <MarkdownEditor
                identityKey={`${currentChunk.id}:source`}
                flatToolbar
                menuOpen={sourceMenuOpen}
                onMenuOpenChange={setSourceMenuOpen}
                value={currentChunk.sourceDisplayText}
                onChange={(nextValue) => updateChunkSourceText(currentChunk.id, nextValue)}
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
                disabled={!currentChunk.translationDisplayText.trim()}
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
                    // Il confronto richiede la sola traduzione (spazio pieno): se siamo su
                    // entrambi/sorgente, ci porta lì e accende il diff in un colpo solo.
                    if (paneFocus !== 'translation') {
                      setDocumentPaneFocus('translation');
                      setShowDiffMode(true);
                      return;
                    }
                    setShowDiffMode(!showDiffMode);
                  }}
                  title={showDiffMode ? t('document.diffModeDisable') : t('document.diffModeEnable')}
                  ariaPressed={showDiffMode}
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
                subtitle={
                  showDiffMode && activeDiffPair
                    ? `${activeDiffPair.fromName} → ${activeDiffPair.toName}`
                    : undefined
                }
                actions={stageActions}
                textMenuButton={!showDiffMode ? renderTextMenuButton(translationMenuOpen, () => setTranslationMenuOpen((open) => !open)) : null}
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
                      flatToolbar
                      menuOpen={translationMenuOpen}
                      onMenuOpenChange={setTranslationMenuOpen}
                      copyText={rawStageContent}
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
            setProjectContextCollapsed(false);
            setPendingAnnotationAnchor({ chunkId: annotationMenu.chunkId, text: annotationMenu.text });
            setChunkRailTab('notes');
          }}
          onClose={() => setAnnotationMenu(null)}
        />
      ) : null}
    </section>
  );
}
