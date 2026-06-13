import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { useChunksStore } from '../../../stores/chunksStore';
import { useUiStore } from '../../../stores/uiStore';
import { useConfigStore } from '../../../stores/configStore';
import { useAnnotationsStore } from '../../../stores/annotationsStore';
import { useGlossaryHighlight, escapeHtml, type AnnotationAnchor } from '../../../hooks/useGlossaryHighlight';
import { useStageDiff } from '../../../hooks/useStageDiff';
import { highlightFootnoteMarkersHtml, highlightSuperscriptMarkersHtml } from '../../../utils/footnoteExtractor';

export function useDocumentViewState() {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const chunks = useChunksStore((state) => state.chunks);

  const {
    selectedChunkId,
    setSelectedChunkId,
    documentLayout,
    paneFocus,
    syncScrollEnabled,
    highlightsEnabled,
    searchQuery,
    focusedIssueQuery,
    focusedSourceIssueQuery,
    focusIsAnnotation,
  } = useUiStore(
    useShallow((state) => ({
      selectedChunkId: state.selectedChunkId,
      setSelectedChunkId: state.setSelectedChunkId,
      documentLayout: state.documentLayout,
      paneFocus: state.documentPaneFocus,
      syncScrollEnabled: state.syncScrollEnabled,
      highlightsEnabled: state.highlightsEnabled,
      searchQuery: state.searchQuery,
      focusedIssueQuery: state.focusedIssueQuery,
      focusedSourceIssueQuery: state.focusedSourceIssueQuery,
      focusIsAnnotation: state.focusIsAnnotation,
    })),
  );

  const pipelineTestChunkCount = useConfigStore((state) => state.pipelineTestChunkCount);
  const setPipelineTestChunkCount = useConfigStore((state) => state.setPipelineTestChunkCount);

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [showDiffMode, setShowDiffMode] = useState(false);
  const [diffPairKey, setDiffPairKey] = useState<string>('');
  const [sourcePaneSearch, setSourcePaneSearch] = useState('');
  const [translationPaneSearch, setTranslationPaneSearch] = useState('');

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

  const sourceDisplayText = currentChunk?.sourceDisplayText ?? '';
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

  // Diff mode is only available in translation-only pane
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
    setDiffPairKey((prev) =>
      prev && diffPairs.some((pair) => pair.key === prev) ? prev : diffPairs[0]!.key,
    );
  }, [diffPairs]);

  const hasGlossary = config.glossary.length > 0;
  const showHighlight = highlightsEnabled && hasGlossary;
  const sourceEffectiveSearch = sourcePaneSearch.trim() || (highlightsEnabled ? searchQuery.trim() : '');
  const translationEffectiveSearch = translationPaneSearch.trim() || (highlightsEnabled ? searchQuery.trim() : '');

  const annotationsByChunkId = useAnnotationsStore((s) => s.annotationsByChunkId);
  const currentChunkAnnotations = currentChunk ? (annotationsByChunkId.get(currentChunk.id) ?? []) : [];
  // Resolve each anchor to its first occurrence, sort by reading order and
  // number the markers [^1]..[^n] — matching the footnote numbers the preview
  // emits, so the write marker and the rendered footnote agree.
  const annotationAnchors = useMemo<AnnotationAnchor[]>(
    () =>
      currentChunkAnnotations
        .map((a) => ({ text: a.anchorText?.trim() ?? '', index: deferredStageContent.indexOf(a.anchorText?.trim() ?? '') }))
        .filter((a) => a.text !== '' && a.index !== -1)
        .sort((x, y) => x.index - y.index)
        .map((a, order) => ({ text: a.text, label: `[^${order + 1}]` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentChunkAnnotations.map((a) => `${a.id}:${a.anchorText ?? ''}`).join('|'), deferredStageContent],
  );

  const sourceHighlight = useGlossaryHighlight(
    paneFocus !== 'translation' ? sourceDisplayText : '',
    showHighlight && paneFocus !== 'translation' ? config.glossary : [],
    'source',
    sourceEffectiveSearch,
    focusedSourceIssueQuery ?? '',
  );
  const translationHighlight = useGlossaryHighlight(
    paneFocus !== 'source' ? deferredStageContent : '',
    showHighlight && paneFocus !== 'source' ? config.glossary : [],
    'translation',
    translationEffectiveSearch,
    focusIsAnnotation ? '' : (focusedIssueQuery ?? ''),
    annotationAnchors,
  );

  const activeDiffPair = diffPairs.find((pair) => pair.key === diffPairKey) ?? diffPairs[0] ?? null;
  const effectiveDiffStageIdA = activeDiffPair?.fromId ?? '';
  const effectiveDiffStageIdB = activeDiffPair?.toId ?? '';
  const diffTextA =
    effectiveDiffStageIdA === lastStageId
      ? (currentChunk?.currentDraft ?? '')
      : (currentChunk?.stageResults[effectiveDiffStageIdA]?.content ?? '');
  const diffTextB =
    effectiveDiffStageIdB === lastStageId
      ? (currentChunk?.currentDraft ?? '')
      : (currentChunk?.stageResults[effectiveDiffStageIdB]?.content ?? '');
  const stageDiff = useStageDiff(showDiffMode ? diffTextA : '', showDiffMode ? diffTextB : '');

  const sourceHighlightHtml = useMemo(() => {
    const hasSuperscriptMarkers = /\[[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(sourceDisplayText);
    const hasMarkdownMarkers = /(?<!\\)\[\^[^\]]+\]/.test(sourceDisplayText);
    const hasFootnoteMarkers = hasSuperscriptMarkers || hasMarkdownMarkers;
    const showGlossary = showHighlight && paneFocus !== 'translation';
    const hasSearch = !!sourceEffectiveSearch && paneFocus !== 'translation';
    const hasAuditFocus = !!focusedSourceIssueQuery;
    if (!showGlossary && !hasSearch && !hasAuditFocus && !hasFootnoteMarkers) return null;
    let html = showGlossary || hasSearch || hasAuditFocus ? sourceHighlight.html : escapeHtml(sourceDisplayText);
    if (hasSuperscriptMarkers) html = highlightSuperscriptMarkersHtml(html);
    if (hasMarkdownMarkers) html = highlightFootnoteMarkersHtml(html);
    return html;
  }, [sourceDisplayText, showHighlight, sourceEffectiveSearch, focusedSourceIssueQuery, paneFocus, sourceHighlight.html]);

  const translationHighlightHtml = useMemo(() => {
    const showBase =
      showHighlight || !!translationEffectiveSearch || !!focusedIssueQuery || annotationAnchors.length > 0;
    if (!showBase || !translationHighlight.html) return null;
    return translationHighlight.html;
  }, [showHighlight, translationEffectiveSearch, focusedIssueQuery, annotationAnchors.length, translationHighlight.html]);

  return {
    // Layout
    resolvedLayout,
    paneFocus,
    syncScrollEnabled,
    // Chunks
    chunks,
    currentIndex,
    currentChunk,
    // Stages
    enabledStages,
    lastStageId,
    isEditorialMode,
    selectedStageId,
    setSelectedStageId,
    effectiveSelectedStageId,
    isLastSelected,
    rawStageContent,
    // Diff
    showDiffMode,
    setShowDiffMode,
    diffPairKey,
    setDiffPairKey,
    diffPairs,
    activeDiffPair,
    stageDiff,
    // Search
    sourcePaneSearch,
    setSourcePaneSearch,
    translationPaneSearch,
    setTranslationPaneSearch,
    // Highlights
    showHighlight,
    sourceHighlightHtml,
    translationHighlight,
    translationHighlightHtml,
    translationEffectiveSearch,
    // Navigation
    setSelectedChunkId,
  };
}
