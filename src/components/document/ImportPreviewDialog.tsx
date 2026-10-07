import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Cpu,
  FileText,
  Hash,
  Info,
  LayoutGrid,
  RotateCcw,
  Scissors,
  SplitSquareVertical,
  type LucideIcon,
} from 'lucide-react';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { findBestSplitIndex, trimSplitFragment } from '../../utils';
import { usePipelineStore } from '../../stores/pipelineStore';
import { checkContextOverflow, estimateCharTokens } from '../../utils/tokenEstimate';
import { getSelectableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider, WorkLanguages } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useLanguageCatalog } from '../../hooks/useLanguageCatalog';
import { useWorkLanguageSuggestions } from '../../hooks/useWorkLanguageSuggestions';
import { WorkLanguagesFields } from '../languages/WorkLanguagesFields';
import { ChoiceDots, CommandRule, Dialog, DialogCancelButton, DialogConfirmButton, IconButton, SectionLabel, Select, Tooltip, type ChoiceDotsOption } from '../ui';
import { ChunkCard, BoundaryDivider, SegmentEditor } from './ChunkEditor';
import { type ParagraphChunks, toParagraphChunks, countWords, toFlatModel, fromFlatModel } from '../../utils/paragraphChunks';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImportDialogPipelineConfig = {
  languages: WorkLanguages;
  provider: ModelProvider;
  model: string;
};

interface ImportPreviewDialogProps {
  fileName: string;
  text: string;
  useChunking: boolean;
  wordsPerChunk: number;
  headingAware: boolean;
  carryTrailingShortBlocks: boolean;
  markdownAware?: boolean;
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
  onUseChunkingChange: (value: boolean) => void;
  onWordsPerChunkChange: (value: number) => void;
  onHeadingAwareChange: (value: boolean) => void;
  onCarryTrailingShortBlocksChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: (manualChunks?: string[], pipelineConfig?: ImportDialogPipelineConfig) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

type EditorMode = 'cards' | 'segments';

export function ImportPreviewDialog({
  fileName,
  text,
  useChunking,
  wordsPerChunk,
  headingAware,
  carryTrailingShortBlocks,
  markdownAware = false,
  format,
  experimental,
  onUseChunkingChange,
  onWordsPerChunkChange,
  onHeadingAwareChange,
  onCarryTrailingShortBlocksChange,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const [editorMode, setEditorMode] = useState<EditorMode>('cards');
  const { config, workLanguages } = usePipelineStore();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id ?? null);
  const languageCatalog = useLanguageCatalog();
  const { usedCodes, bookLanguageCode } = useWorkLanguageSuggestions(languageCatalog, workspaceId, currentProjectId);
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const chunkPresetShort = useConfigStore((s) => s.chunkPresetShort);
  const chunkPresetMedium = useConfigStore((s) => s.chunkPresetMedium);
  const chunkPresetLong = useConfigStore((s) => s.chunkPresetLong);

  const stage0 = config.stages[0];
  const [languages, setLanguages] = useState<WorkLanguages>(workLanguages);
  // La lingua del libro riempie una partenza vuota una volta sola: poi decide chi importa.
  const bookLanguageApplied = useRef(false);
  useEffect(() => {
    if (bookLanguageApplied.current || !bookLanguageCode) return;
    bookLanguageApplied.current = true;
    setLanguages((prev) => (prev.source.code ? prev : { ...prev, source: { ...prev.source, code: bookLanguageCode } }));
  }, [bookLanguageCode]);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>(stage0?.provider ?? 'openai');
  const [selectedModel, setSelectedModel] = useState<string>(stage0?.model ?? '');
  const getProviderModels = useCallback(
    (provider: ModelProvider) => getSelectableModelIds(provider, ollamaModels),
    [ollamaModels],
  );

  const availableModels = getProviderModels(selectedProvider);

  const handleProviderChange = (provider: ModelProvider) => {
    setSelectedProvider(provider);
    const models = getProviderModels(provider);
    setSelectedModel(models[0] ?? '');
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
  };

  // ── Settings: words-per-chunk presets ────────────────────────────────────
  const effectiveWordsPerChunk = wordsPerChunk || chunkPresetMedium;

  const handleWordsPerChunkChange = (value: number) => {
    onWordsPerChunkChange(Math.max(50, value));
  };

  const CHUNK_PRESETS: { words: number; titleKey: string; Icon: LucideIcon }[] = [
    { words: chunkPresetShort, titleKey: 'files.chunkShortTitle', Icon: AlignLeft },
    { words: chunkPresetMedium, titleKey: 'files.chunkMediumTitle', Icon: AlignCenter },
    { words: chunkPresetLong, titleKey: 'files.chunkLongTitle', Icon: AlignJustify },
  ];

  const activePresetWords = CHUNK_PRESETS.reduce<number>((nearest, p) =>
    Math.abs(effectiveWordsPerChunk - p.words) < Math.abs(effectiveWordsPerChunk - nearest)
      ? p.words
      : nearest,
    CHUNK_PRESETS[0].words,
  );

  const effectiveMinWords = Math.round(activePresetWords * 0.5);
  const effectiveMaxWords = Math.round(activePresetWords * 1.5);

  // ── Algorithmic chunk computation ──────────────────────────────────────────
  const preview = useMemo(
    () => buildImportPreview(text, {
      useChunking,
      targetWordsPerChunk: effectiveWordsPerChunk,
      markdownAware,
      minWords: effectiveMinWords,
      maxWords: effectiveMaxWords,
      headingAware,
      carryTrailingShortBlocks,
      format,
      experimental,
    }),
    [useChunking, effectiveWordsPerChunk, markdownAware, effectiveMinWords, effectiveMaxWords, headingAware, carryTrailingShortBlocks, format, experimental, text],
  );

  const algorithmicParaChunks = useMemo(
    () => toParagraphChunks(preview.chunks.map((c) => c.text)),
    [preview.chunks],
  );

  const contextWarning = useMemo(() => {
    if (!useChunking) return null;
    const longestChunk = preview.chunks.reduce(
      (a, b) => (estimateCharTokens(a.text) >= estimateCharTokens(b.text) ? a : b),
      { text: '' },
    );
    const activeModels = [
      ...config.stages
        .filter((s) => s.enabled)
        .map((s) => ({
          provider: stage0 && s.id === stage0.id ? selectedProvider : s.provider,
          model: stage0 && s.id === stage0.id ? selectedModel : s.model,
          numCtx: s.providerOptions?.ollama?.numCtx,
        })),
      {
        provider: config.judgeProvider,
        model: config.judgeModel,
        numCtx: config.reviewProviderOptions?.ollama?.numCtx,
      },
    ];
    const allPrompts = [
      ...config.stages.filter((s) => s.enabled).map((s) => s.prompt),
      config.judgePrompt,
      ...(config.coherencePrompt ? [config.coherencePrompt] : []),
    ];
    const maxPrompt = allPrompts.reduce((a, b) =>
      estimateCharTokens(a) >= estimateCharTokens(b) ? a : b, '',
    );
    return checkContextOverflow(longestChunk.text, maxPrompt, activeModels);
  }, [preview.chunks, useChunking, config, selectedProvider, selectedModel, stage0]);

  // ── Manual boundary editing state ─────────────────────────────────────────
  const [manualParaChunks, setManualParaChunks] = useState<ParagraphChunks | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const activeParaChunks = manualParaChunks ?? algorithmicParaChunks;
  const hasManualEdits = manualParaChunks !== null;

  useEffect(() => {
    setExpandedChunks(new Set());
  }, [activeParaChunks.length]);

  // ── Shared mutation helper ─────────────────────────────────────────────────
  const modifyChunks = useCallback(
    (modifier: (chunks: ParagraphChunks) => ParagraphChunks) => {
      setManualParaChunks((current) => modifier(current ?? algorithmicParaChunks));
    },
    [algorithmicParaChunks],
  );

  // ── Card-view boundary operations ─────────────────────────────────────────
  const giveLastParagraph = useCallback((i: number) => {
    modifyChunks((chunks) => {
      if (i >= chunks.length - 1 || chunks[i].length < 2) return chunks;
      const next = chunks.map((c) => [...c]);
      next[i + 1].unshift(next[i].pop()!);
      return next;
    });
  }, [modifyChunks]);

  const takeFirstParagraph = useCallback((i: number) => {
    modifyChunks((chunks) => {
      if (i >= chunks.length - 1 || chunks[i + 1].length < 2) return chunks;
      const next = chunks.map((c) => [...c]);
      next[i].push(next[i + 1].shift()!);
      return next;
    });
  }, [modifyChunks]);

  const mergeChunks = useCallback((i: number) => {
    modifyChunks((chunks) => {
      if (i >= chunks.length - 1) return chunks;
      const next = chunks.map((c) => [...c]);
      const merged = [...next[i], ...next[i + 1]];
      next.splice(i, 2, merged);
      setExpandedChunks((prev) => {
        const updated = new Set<number>();
        prev.forEach((idx) => {
          if (idx < i) updated.add(idx);
          else if (idx === i || idx === i + 1) updated.add(i);
          else updated.add(idx - 1);
        });
        return updated;
      });
      return next;
    });
  }, [modifyChunks]);

  const splitChunkAtMid = useCallback((i: number) => {
    modifyChunks((chunks) => {
      const paras = chunks[i];
      if (paras.length < 2) return chunks;
      const mid = Math.ceil(paras.length / 2);
      const next = chunks.map((c) => [...c]);
      next.splice(i, 1, paras.slice(0, mid), paras.slice(mid));
      setExpandedChunks((prev) => {
        const updated = new Set<number>();
        prev.forEach((idx) => {
          if (idx < i) updated.add(idx);
          else if (idx === i) { updated.add(i); updated.add(i + 1); }
          else updated.add(idx + 1);
        });
        return updated;
      });
      return next;
    });
  }, [modifyChunks]);

  // ── Segment-editor boundary operations ────────────────────────────────────
  const addBoundaryAt = useCallback((paragraphIndex: number) => {
    modifyChunks((chunks) => {
      const { paragraphs, boundaries } = toFlatModel(chunks);
      const next = new Set(boundaries);
      next.add(paragraphIndex);
      return fromFlatModel(paragraphs, next);
    });
  }, [modifyChunks]);

  const removeBoundaryAt = useCallback((paragraphIndex: number) => {
    modifyChunks((chunks) => {
      const { paragraphs, boundaries } = toFlatModel(chunks);
      const next = new Set(boundaries);
      next.delete(paragraphIndex);
      return fromFlatModel(paragraphs, next);
    });
  }, [modifyChunks]);

  const splitParagraphAt = useCallback((paragraphIndex: number) => {
    modifyChunks((chunks) => {
      const { paragraphs, boundaries } = toFlatModel(chunks);
      const para = paragraphs[paragraphIndex];
      const splitIdx = findBestSplitIndex(para, { markdownAware });
      if (splitIdx === null) return chunks;
      const first = trimSplitFragment(para.slice(0, splitIdx));
      const second = trimSplitFragment(para.slice(splitIdx));
      if (!first || !second) return chunks;
      // Insert split paragraph and shift boundaries
      const newParagraphs = [
        ...paragraphs.slice(0, paragraphIndex),
        first,
        second,
        ...paragraphs.slice(paragraphIndex + 1),
      ];
      const newBoundaries = new Set<number>();
      boundaries.forEach((idx) => {
        newBoundaries.add(idx <= paragraphIndex ? idx : idx + 1);
      });
      // Add a boundary between the two new paragraphs
      newBoundaries.add(paragraphIndex + 1);
      return fromFlatModel(newParagraphs, newBoundaries);
    });
  }, [modifyChunks, markdownAware]);

  const recalculate = useCallback(() => {
    setManualParaChunks(null);
    setExpandedChunks(new Set());
  }, []);

  const toggleExpanded = useCallback((i: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }, []);

  // ── Coherence check ───────────────────────────────────────────────────────
  const totalActiveWords = useMemo(
    () => activeParaChunks.reduce((sum, paras) => sum + countWords(paras), 0),
    [activeParaChunks],
  );
  const wordLossPct = preview.stats.words > 0
    ? Math.round(Math.abs(preview.stats.words - totalActiveWords) / preview.stats.words * 100)
    : 0;
  const hasCoherenceIssue = wordLossPct > 2;

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const pipelineConfig: ImportDialogPipelineConfig = {
      languages,
      provider: selectedProvider,
      model: selectedModel,
    };
    if (hasManualEdits) {
      onConfirm(activeParaChunks.map((paras) => paras.join('\n\n')), pipelineConfig);
    } else {
      onConfirm(undefined, pipelineConfig);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const viewOptions: ChoiceDotsOption<EditorMode>[] = [
    { value: 'cards', label: t('files.viewCards'), content: <LayoutGrid size={11} /> },
    { value: 'segments', label: t('files.viewSegments'), content: <SplitSquareVertical size={11} /> },
  ];

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}
      title={t('files.importPreviewTitle')}
      eyebrow={fileName}
      icon={<FileText size={20} />}
      closeLabel={t('common.close')}
      compact
      widthClassName="max-w-6xl"
      panelClassName="h-[90vh]"
      bodyClassName="min-h-0 p-0"
      headerActions={preview.experimental ? (
        <Tooltip label={t('files.importExperimentalDocxMarkdown')}>
          <span className="shrink-0 cursor-help"><Info size={14} className="text-editorial-accent" /></span>
        </Tooltip>
      ) : null}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {hasCoherenceIssue ? (
            <div className="flex items-center gap-2 text-sm text-editorial-warning">
              <AlertTriangle size={13} className="shrink-0" />
              {t('files.importCoherenceWarning', { pct: wordLossPct })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-editorial-muted">
              <CheckCircle2 size={13} className="shrink-0" />
              {t('files.importCoherenceOk')}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogCancelButton onClick={onCancel}>{t('common.cancel')}</DialogCancelButton>
            <DialogConfirmButton onClick={handleConfirm}>{t('files.importConfirm')}</DialogConfirmButton>
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* Colonna delle impostazioni: scorre per conto suo, l'anteprima resta a tutta altezza. */}
        <aside className="w-96 shrink-0 space-y-6 overflow-y-auto border-r border-rule px-6 py-5 custom-scrollbar">
          <WorkLanguagesFields catalog={languageCatalog} value={languages} onChange={setLanguages} usedCodes={usedCodes} />

          <section className="space-y-2">
            <SectionLabel icon={Cpu} label={t('files.importModelLabel')} />
            <div className="flex items-center gap-1.5">
              <Select
                value={selectedProvider}
                onChange={(value) => handleProviderChange(value as ModelProvider)}
                options={LLM_PROVIDER_ORDER.map((p) => ({ value: p, label: p }))}
                className="w-28 font-bold uppercase"
                ariaLabel={t('pipeline.source')}
              />
              <Select
                value={selectedModel}
                onChange={handleModelChange}
                disabled={availableModels.length === 0}
                className="min-w-0 flex-1 font-mono"
                ariaLabel={t('pipeline.stageModelLabel')}
                options={
                  availableModels.length === 0
                    ? [{ value: '', label: t('ollama.noModels') }]
                    : availableModels.map((m) => ({ value: m, label: m }))
                }
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel icon={Scissors} label={t('files.importSegmentationLabel')} />
            <div className="flex flex-wrap items-center gap-1">
              <IconButton
                size="md"
                tone={useChunking ? 'accent' : 'default'}
                onClick={() => onUseChunkingChange(!useChunking)}
                title={t('pipeline.autoSegment')}
                ariaPressed={useChunking}
              >
                <Scissors size={14} />
              </IconButton>
              {markdownAware && (
                <IconButton
                  size="md"
                  tone={headingAware && useChunking ? 'accent' : 'default'}
                  onClick={() => useChunking && onHeadingAwareChange(!headingAware)}
                  title={t('pipeline.headingAware')}
                  disabled={!useChunking}
                  ariaPressed={headingAware && useChunking}
                >
                  <Hash size={14} />
                </IconButton>
              )}
              <IconButton
                size="md"
                tone={carryTrailingShortBlocks && useChunking ? 'accent' : 'default'}
                onClick={() => useChunking && onCarryTrailingShortBlocksChange(!carryTrailingShortBlocks)}
                title={t('pipeline.trailingShortBlocks')}
                disabled={!useChunking}
                ariaPressed={carryTrailingShortBlocks && useChunking}
              >
                <ArrowLeftRight size={14} />
              </IconButton>
              {useChunking && <CommandRule />}
              {/* Preset — stessa posizione sempre, si colora d'avviso se ci sono modifiche a mano */}
              {useChunking && CHUNK_PRESETS.map(({ words, titleKey, Icon }) => (
                <IconButton
                  key={words}
                  size="md"
                  tone={activePresetWords === words ? (hasManualEdits ? 'warning' : 'accent') : 'default'}
                  onClick={() => handleWordsPerChunkChange(words)}
                  title={hasManualEdits ? `${t(titleKey)} — ${t('files.recalculateHint')}` : t(titleKey)}
                  ariaPressed={activePresetWords === words}
                >
                  <Icon size={14} />
                </IconButton>
              ))}
              {/* Ricalcola — sempre nello stesso punto, attivo solo con modifiche a mano */}
              <IconButton
                size="md"
                tone={hasManualEdits ? 'warning' : 'default'}
                disabled={!hasManualEdits}
                onClick={recalculate}
                title={t('files.recalculateHint')}
              >
                <RotateCcw size={13} />
              </IconButton>
            </div>
          </section>
        </aside>

        {/* Anteprima dei frammenti */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-rule px-6 py-3">
            <p className="whitespace-nowrap font-mono text-xs text-editorial-muted">
              {preview.stats.words.toLocaleString()} {t('pipeline.words').toLowerCase()}
              {' · '}
              {preview.stats.paragraphs} {t('pipeline.paragraphs').toLowerCase()}
              {' · '}
              <span className={hasManualEdits ? 'text-editorial-warning' : ''}>
                {activeParaChunks.length} {t('pipeline.statsSegmentsUnit')}
              </span>
              {hasManualEdits && (
                <span className="ml-2 italic text-editorial-warning">{t('files.manualEditsActive')}</span>
              )}
              {preview.warnings.length > 0 && (
                <Tooltip label={preview.warnings.map((w) => t(`files.importWarning.${w}`)).join('\n')}>
                  <span className="ml-1">
                    <Info size={12} className="inline cursor-help align-middle text-editorial-muted/60" />
                  </span>
                </Tooltip>
              )}
            </p>
            <ChoiceDots options={viewOptions} value={editorMode} onChange={setEditorMode} ariaLabel={t('files.importViewLabel')} />
          </div>

          {contextWarning && (
            <div className="shrink-0 px-6 pt-3">
              <div className="flex items-start gap-2 border-y border-editorial-warning/40 bg-editorial-warning/10 py-3 text-xs text-editorial-warning">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-editorial-warning" />
                <span>
                  {t('pipeline.contextOverflowWarning', {
                    tokens: contextWarning.estimatedTokens.toLocaleString(),
                    model: contextWarning.modelId,
                    window: contextWarning.contextWindow.toLocaleString(),
                  })}
                </span>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
            {editorMode === 'cards' ? (
              <div className="flex flex-col gap-0">
                {activeParaChunks.map((paras, i) => {
                  const chunkStart = activeParaChunks.slice(0, i).reduce((sum, c) => sum + c.length, 0);
                  return (
                    <div key={chunkStart}>
                      <ChunkCard
                        paras={paras}
                        index={i}
                        total={activeParaChunks.length}
                        minWords={effectiveMinWords}
                        maxWords={effectiveMaxWords}
                        isExpanded={expandedChunks.has(i)}
                        onToggleExpand={() => toggleExpanded(i)}
                        onSplit={() => splitChunkAtMid(i)}
                        canSplit={paras.length >= 2}
                      />
                      {i < activeParaChunks.length - 1 && (
                        <BoundaryDivider
                          onGive={() => giveLastParagraph(i)}
                          onTake={() => takeFirstParagraph(i)}
                          onMerge={() => mergeChunks(i)}
                          canGive={paras.length >= 2}
                          canTake={activeParaChunks[i + 1].length >= 2}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <SegmentEditor
                chunks={activeParaChunks}
                minWords={effectiveMinWords}
                maxWords={effectiveMaxWords}
                onAddBoundary={addBoundaryAt}
                onRemoveBoundary={removeBoundaryAt}
                onSplitParagraph={splitParagraphAt}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
