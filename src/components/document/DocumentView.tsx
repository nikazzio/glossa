import { AlertTriangle, CircleCheck, FileText, GitCompare, Languages, Pencil, Search, SlidersHorizontal, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { HighlightedText, MarkdownEditor, DOC_FONT_SIZE_STEP_INDEX } from '../common';
import { IconButton, Tooltip } from '../ui';
import { DocumentPage } from './DocumentPage';
import { ProjectSaveButton } from './ProjectSaveButton';
import { ChunkStrip } from './ChunkStrip';
import { SearchTab } from './SearchTab';
import { StageStatusRow } from './StageStatusRow';
import {
  approveTranslation,
  withdrawTranslationApproval,
} from '../../services/translationRevisionsService';
import { logger } from '../../utils/logger';
import { composeAnnotatedMarkdown } from '../../utils/annotationMarkdown';
import { restoreFootnoteMarkers } from '../../utils/footnoteExtractor';
import { usePhraseMemoryAutoSearch } from '../../hooks/usePhraseMemoryAutoSearch';
import { usePanelScrollSync } from '../../hooks/usePanelScrollSync';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { useDocumentViewState } from './hooks/useDocumentViewState';
import { StageTraceDialog } from './StageTraceDialog';
import { AnnotationContextMenu } from './AnnotationContextMenu';
import { DocumentViewOptionsMenu } from './DocumentViewControls';
import { InlineStatusBadge } from './InlineStatusBadge';

const NOOP_CHANGE = () => {};
const DOCUMENT_SEARCH_TOGGLE_ID = 'document-search-toggle';

interface DocumentViewProps {
  onRetranslateChunk: (chunkId: string) => void;
  onImportDocument: () => void;
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
    setStudioTab,
    setShowInsightPanel,
    setPendingAnnotationAnchor,
    documentFontSize,
    setDocumentPaneFocus,
  } = useUiStore();

  const fontSizeStep = DOC_FONT_SIZE_STEP_INDEX[documentFontSize ?? 'md'];

  const [annotationMenu, setAnnotationMenu] = useState<{ x: number; y: number; text: string; chunkId: string } | null>(null);
  // Shell nuova (#291): menu controlli testo, uno per pannello (sorgente / traduzione).
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);
  const [documentSearchOpen, setDocumentSearchOpen] = useState(false);

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

  /**
   * Approvare e ritirare l'approvazione sono **fatti** che restano nel
   * registro: la revisione approvata si conserva anche quando viene
   * superata, perché «approvata e poi corretta» dice qualcosa che «approvata»
   * da sola non dice.
   *
   * La registrazione non deve poter impedire il gesto: se fallisce, il blocco
   * si mette lo stesso e il motivo finisce nel registro tecnico.
   */
  const handleLockToggle = (chunk: typeof currentChunk) => {
    if (!chunk) return;
    const approving = !chunk.translationLocked;
    toggleChunkTranslationLock(chunk.id);
    const recorded = approving
      ? approveTranslation(chunk.id, chunk.translationDisplayText, activeWorkspace?.id ?? null)
      : withdrawTranslationApproval(chunk.id, activeWorkspace?.id ?? null);
    void recorded.catch((error: unknown) => {
      logger.warn('translation.approval.not_recorded', {
        chunkId: chunk.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
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
          <div className="flex flex-wrap items-center justify-center gap-2 text-caption font-bold uppercase tracking-section text-editorial-muted">
              <span>{activeWorkspace?.name ?? t('workspace.noActive')}</span>
              <span className="h-1 w-1 rounded-full bg-editorial-border" aria-hidden="true" />
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
            className="group mt-8 flex w-full max-w-xl flex-col items-center rounded-lg border border-dashed border-editorial-border bg-surface-panel px-6 py-8 text-center transition-colors hover:border-editorial-accent hover:bg-surface-hover/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-editorial-border bg-editorial-paper text-editorial-muted transition-colors group-hover:border-editorial-accent group-hover:text-editorial-accent">
              <FileText size={22} />
            </span>
            <span className="mt-3 text-caption font-bold uppercase tracking-section text-editorial-muted transition-colors group-hover:text-editorial-accent">
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
  /** «Comando — motivo» quando è spento, come negli altri Studi. */
  const blockedTitle = (command: string, reason: string | null) =>
    reason ? t('transcription.commandBlocked', { command, reason }) : command;

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
    <section className="w-full overflow-y-auto min-h-0 h-full custom-scrollbar flex flex-col bg-surface-panel">
      <div className="@container mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="shrink-0">
          {/* Alta come l'intestazione della colonna degli strumenti, così le
              due righe partono allineate. */}
          <div className="w-full h-14 flex items-center gap-5 border-b border-editorial-border px-4">
            <ChunkStrip chunks={chunks} currentIndex={currentIndex} onSelect={setSelectedChunkId} />
            <StageStatusRow />
            <span className="flex shrink-0 items-center gap-1">
              <IconButton
                size="sm"
                tone={documentSearchOpen ? 'accent' : 'default'}
                onClick={() => setDocumentSearchOpen((open) => !open)}
                title={t('document.searchInDocument')}
                ariaPressed={documentSearchOpen}
                id={DOCUMENT_SEARCH_TOGGLE_ID}
                tooltipSide="bottom"
              >
                <Search size={14} />
              </IconButton>
              <DocumentViewOptionsMenu />
            </span>
          </div>
          {/* La ricerca in tutto il documento si apre sotto la fila, sopra i
              fogli: i risultati portano al frammento senza chiuderla. */}
          {documentSearchOpen && (
            <div className="flex h-80 flex-col border-b border-editorial-border">
              <SearchTab
                panelId="document-search-panel"
                labelledBy={DOCUMENT_SEARCH_TOGGLE_ID}
                chunks={chunks}
                currentChunkId={currentChunk.id}
                onSelectChunk={setSelectedChunkId}
                onClose={() => setDocumentSearchOpen(false)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-editorial-border">
          {paneFocus !== 'translation' && (
            <DocumentPage
              label={t('pipeline.originalSource')}
              eyebrow={t('document.leftPage')}
              readOnly={sourceReadOnly}
              actions={
                <div className="flex items-center gap-1">
                  <IconButton
                    size="lg"
                    tone={currentChunk.sourceEditable === true ? 'accent' : 'default'}
                    onClick={() => toggleChunkSourceEditing(currentChunk.id)}
                    title={blockedTitle(
                      currentChunk.sourceEditable ? t('document.disableSourceEditing') : t('document.enableSourceEditing'),
                      sourceEditDisabled ? t('document.reasonChunkProcessing') : null,
                    )}
                    disabled={sourceEditDisabled}
                    ariaPressed={currentChunk.sourceEditable === true}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  {paneFocus === 'source' && <ProjectSaveButton />}
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
            const verifyBlockedReason = currentChunk.status === 'processing'
              ? t('document.reasonChunkProcessing')
              : !currentChunk.translationDisplayText.trim()
                ? t('document.reasonNoTranslation')
                : null;
            const verifyToggle = (
              <IconButton
                size="sm"
                tone={currentChunk.translationLocked ? 'success' : 'default'}
                title={blockedTitle(
                  currentChunk.translationLocked ? t('document.unlockTranslation') : t('document.lockTranslation'),
                  verifyBlockedReason,
                )}
                onClick={() => handleLockToggle(currentChunk)}
                disabled={verifyBlockedReason !== null}
                ariaPressed={currentChunk.translationLocked === true}
              >
                <CircleCheck size={14} />
              </IconButton>
            );
            const hasStageContent = (s: (typeof enabledStages)[number]) =>
              s.id === lastStageId
                ? !!currentChunk.translationDisplayText.trim()
                : !!currentChunk.stageResults[s.id]?.content;
            const hasAnyStageContent = enabledStages.some(hasStageContent);
            const stageButtons = enabledStages.map((s) => {
              const Icon = s.role === 'refine' ? Wand2 : s.role === 'format' ? FileText : Languages;
              const isActive = effectiveSelectedStageId === s.id;
              const hasContent = hasStageContent(s);
              return (
                <IconButton
                  key={s.id}
                  size="xs"
                  tooltipSide="left"
                  tone={isActive && !showDiffMode ? 'accent' : 'default'}
                  onClick={() => setSelectedStageId(s.id)}
                  title={blockedTitle(
                    t('document.viewStageResult', { stage: t(`pipeline.stageRole.${s.role ?? 'translation'}`) }),
                    showDiffMode ? t('document.reasonDiffOn') : !hasContent ? t('document.reasonStageNotRun') : null,
                  )}
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
                  size="xs"
                  tooltipSide="left"
                  tone={isActive ? 'accent' : 'default'}
                  onClick={() => setDiffPairKey(pair.key)}
                  title={blockedTitle(`${pair.fromName} → ${pair.toName}`, showDiffMode ? null : t('document.reasonDiffOff'))}
                  disabled={!showDiffMode}
                  ariaPressed={isActive}
                >
                  <DiffIcon size={14} />
                </IconButton>
              );
            });
            const stageRail = isEditorialMode ? (
              <>
                {stageButtons}
                <span className="my-1 h-px w-4 bg-rule" aria-hidden="true" />
                <IconButton
                  size="xs"
                  tooltipSide="left"
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
                  title={blockedTitle(
                    showDiffMode ? t('document.diffModeDisable') : t('document.diffModeEnable'),
                    hasAnyStageContent ? null : t('document.reasonNoStageRun'),
                  )}
                  disabled={!hasAnyStageContent}
                  ariaPressed={showDiffMode}
                >
                  <GitCompare size={14} />
                </IconButton>
                {diffButtons}
              </>
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
                actions={<ProjectSaveButton />}
                sideRail={stageRail}
                textMenuButton={!showDiffMode ? renderTextMenuButton(translationMenuOpen, () => setTranslationMenuOpen((open) => !open)) : null}
                statusBadge={
                  <span className="flex items-center gap-2">
                    {verifyToggle}
                    {currentChunk.translationStale && (
                      <InlineStatusBadge tone="amber" icon={<AlertTriangle size={13} />} label={t('document.translationStaleBadge')} />
                    )}
                  </span>
                }
                searchValue={translationPaneSearch}
                onSearchChange={setTranslationPaneSearch}
                searchLabel={t('document.searchInTranslation')}
                scrollRef={scrollTranslationRef}
              >
                <div
                  className="flex flex-col flex-1 min-h-0 min-w-0"
                  onContextMenu={(e) => {
                    const text = window.getSelection()?.toString().trim() ?? '';
                    if (!text) return;
                    e.preventDefault();
                    setAnnotationMenu({ x: e.clientX, y: e.clientY, text, chunkId: currentChunk.id });
                  }}
                >
                  {showDiffMode ? (
                    <div data-scroll-sync="true" className="flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
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
            setShowInsightPanel(true);
            setPendingAnnotationAnchor({ chunkId: annotationMenu.chunkId, text: annotationMenu.text });
            setStudioTab('notes');
          }}
          onClose={() => setAnnotationMenu(null)}
        />
      ) : null}
    </section>
  );
}
