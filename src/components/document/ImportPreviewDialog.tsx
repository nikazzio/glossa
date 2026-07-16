import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Globe,
  Hash,
  Info,
  LayoutGrid,
  RotateCcw,
  Scissors,
  SplitSquareVertical,
  X,
  type LucideIcon,
} from 'lucide-react';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { findBestSplitIndex, trimSplitFragment } from '../../utils';
import * as RadixDialog from '@radix-ui/react-dialog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { checkContextOverflow, estimateCharTokens } from '../../utils/tokenEstimate';
import { LANGUAGES } from '../../constants';
import { getSelectableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider } from '../../types';
import { IconButton, DialogConfirmButton, DialogCancelButton, Tooltip } from '../ui';
import { ChunkCard, BoundaryDivider, SegmentEditor } from './ChunkEditor';
import { type ParagraphChunks, toParagraphChunks, countWords, toFlatModel, fromFlatModel } from '../../utils/paragraphChunks';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImportDialogPipelineConfig = {
  sourceLanguage: string;
  targetLanguage: string;
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
  const { config } = usePipelineStore();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const chunkPresetShort = useConfigStore((s) => s.chunkPresetShort);
  const chunkPresetMedium = useConfigStore((s) => s.chunkPresetMedium);
  const chunkPresetLong = useConfigStore((s) => s.chunkPresetLong);

  const stage0 = config.stages[0];
  const [sourceLanguage, setSourceLanguage] = useState<string>(config.sourceLanguage);
  const [targetLanguage, setTargetLanguage] = useState<string>(config.targetLanguage);
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

  const handleSourceLanguageChange = (lang: string) => {
    setSourceLanguage(lang);
  };

  const handleTargetLanguageChange = (lang: string) => {
    setTargetLanguage(lang);
  };

  const handleSwapLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
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
      sourceLanguage,
      targetLanguage,
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

  return (
    <RadixDialog.Root open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[200] bg-editorial-ink/30 backdrop-blur-sm" />
        <RadixDialog.Content
          aria-labelledby="import-preview-title"
          className="fixed left-1/2 top-1/2 z-[200] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-editorial-border bg-editorial-bg shadow-[var(--shadow-modal)]">

        {/* ── Unified header (filename + title + stats + controls) ───────── */}
        <div className="shrink-0 border-b border-editorial-border px-6 pb-4 pt-5">

          {/* Row 1: filename + mode toggle + close */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={15} className="shrink-0 text-editorial-muted" />
              <span className="truncate text-sm font-mono text-editorial-muted">{fileName}</span>
              {preview.experimental && (
                <Tooltip label={t('files.importExperimentalDocxMarkdown')}>
                  <span className="shrink-0 cursor-help">
                    <Info size={14} className="text-editorial-accent" />
                  </span>
                </Tooltip>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-0 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
                <Tooltip label={t('files.viewCards')}>
                  <button
                    type="button"
                    onClick={() => setEditorMode('cards')}
                    aria-label={t('files.viewCards')}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'cards' ? 'bg-editorial-accent text-white' : 'text-editorial-muted hover:text-editorial-accent'}`}
                  >
                    <LayoutGrid size={16} />
                  </button>
                </Tooltip>
                <Tooltip label={t('files.viewSegments')}>
                  <button
                    type="button"
                    onClick={() => setEditorMode('segments')}
                    aria-label={t('files.viewSegments')}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'segments' ? 'bg-editorial-accent text-white' : 'text-editorial-muted hover:text-editorial-accent'}`}
                  >
                    <SplitSquareVertical size={16} />
                  </button>
                </Tooltip>
              </div>
              <Tooltip label={t('common.close')}>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label={t('common.close')}
                  className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <X size={16} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Row 2: title */}
          <RadixDialog.Title asChild>
            <h2
              id="import-preview-title"
              className="mb-2 font-display text-2xl italic tracking-tight text-editorial-ink"
            >
              {t('files.importPreviewTitle')}
            </h2>
          </RadixDialog.Title>

          {/* Row 3: stats */}
          <p className="mb-4 text-xs font-mono text-editorial-muted whitespace-nowrap">
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
                  <Info size={12} className="inline align-middle text-editorial-muted/60 cursor-help" />
                </span>
              </Tooltip>
            )}
          </p>

          {/* Separator */}
          <div className="mb-4 h-px bg-editorial-border" />

          {/* Row 4: controls — icon buttons */}
          <div className="flex flex-wrap items-center gap-2">

            {/* Auto-segment toggle — icon button */}
            <IconButton
              size="md"
              tone={useChunking ? 'accent' : 'default'}
              onClick={() => onUseChunkingChange(!useChunking)}
              title={t('pipeline.autoSegment')}
              ariaPressed={useChunking}
            >
              <Scissors size={14} />
            </IconButton>

            {/* Heading-aware toggle — icon button (markdown only) */}
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

            {/* Separator — solo in stato normale */}
            {useChunking && !hasManualEdits && (
              <span className="select-none text-editorial-border">·</span>
            )}

            {/* Preset inline — solo in stato normale */}
            {useChunking && !hasManualEdits && CHUNK_PRESETS.map(({ words, titleKey, Icon }) => (
              <IconButton
                key={words}
                size="md"
                tone={activePresetWords === words ? 'accent' : 'default'}
                onClick={() => handleWordsPerChunkChange(words)}
                title={t(titleKey)}
                ariaPressed={activePresetWords === words}
              >
                <Icon size={14} />
              </IconButton>
            ))}

            {/* Con modifiche manuali: preset + ricalcola raggruppati a destra in warning */}
            {useChunking && hasManualEdits && (
              <div className="ml-auto flex items-center gap-1.5">
                {CHUNK_PRESETS.map(({ words, titleKey, Icon }) => (
                  <Tooltip key={words} label={t(titleKey)}>
                    <button
                      type="button"
                      onClick={() => handleWordsPerChunkChange(words)}
                      aria-label={t(titleKey)}
                      className={`rounded-full border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-warning ${
                        activePresetWords === words
                          ? 'border-editorial-warning bg-editorial-warning/20 text-editorial-warning'
                          : 'border-editorial-warning/40 text-editorial-warning/60 hover:border-editorial-warning hover:text-editorial-warning hover:bg-editorial-warning/10'
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  </Tooltip>
                ))}
                <Tooltip label={t('files.recalculateHint')}>
                  <button
                    type="button"
                    onClick={recalculate}
                    aria-label={t('files.recalculateHint')}
                    className="rounded-full border border-editorial-warning bg-editorial-warning/10 p-2 text-editorial-warning transition-colors hover:bg-editorial-warning/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-warning"
                  >
                    <RotateCcw size={13} />
                  </button>
                </Tooltip>
              </div>
            )}

            {/* Ricalcola spento — nessuna modifica manuale */}
            {!hasManualEdits && (
              <Tooltip label={t('files.recalculateHint')}>
                <button
                  type="button"
                  disabled
                  aria-label={t('files.recalculateHint')}
                  className="ml-auto cursor-not-allowed rounded-full border border-editorial-border p-2 text-editorial-muted opacity-25 focus:outline-none"
                >
                  <RotateCcw size={13} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Row 5: pipeline setup — language pair + model */}
          <div className="mt-3 pt-3 border-t border-editorial-border/60">
            <div className="grid grid-cols-[1.25rem_1fr] gap-y-2.5 gap-x-2 items-center">
              {/* Language pair */}
              <Globe size={11} className="text-editorial-accent shrink-0" />
              <div className="flex items-center gap-1.5">
                <select
                  value={sourceLanguage}
                  onChange={(e) => handleSourceLanguageChange(e.target.value)}
                  className="w-32 rounded-md border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none"
                  aria-label={t('pipeline.sourceLanguage')}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                  ))}
                </select>
                <Tooltip label={t('pipeline.swapLanguages')}>
                  <button
                    type="button"
                    onClick={handleSwapLanguages}
                    aria-label={t('pipeline.swapLanguages')}
                    className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <ArrowLeftRight size={12} />
                  </button>
                </Tooltip>
                <select
                  value={targetLanguage}
                  onChange={(e) => handleTargetLanguageChange(e.target.value)}
                  className="w-32 rounded-md border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none"
                  aria-label={t('pipeline.targetLanguage')}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                  ))}
                </select>
              </div>
              {/* Model */}
              <Cpu size={11} className="text-editorial-accent shrink-0" />
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedProvider}
                  onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
                  className="w-24 rounded-md border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-bold uppercase outline-none focus:border-editorial-ink/40 appearance-none"
                  aria-label={t('pipeline.source')}
                >
                  {LLM_PROVIDER_ORDER.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={availableModels.length === 0}
                  className="flex-1 min-w-0 rounded-md border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none disabled:opacity-40"
                  aria-label={t('pipeline.stageModelLabel')}
                >
                  {availableModels.length === 0 ? (
                    <option value="">{t('ollama.noModels')}</option>
                  ) : (
                    availableModels.map((m) => <option key={m} value={m}>{m}</option>)
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Context overflow warning ──────────────────────────────────────── */}
        {contextWarning && (
          <div className="shrink-0 px-6 pb-2">
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

        {/* ── Content area ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 custom-scrollbar">
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

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-editorial-border px-6 py-4">
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
        </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
