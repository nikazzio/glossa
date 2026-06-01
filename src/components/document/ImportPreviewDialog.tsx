import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Globe,
  Hash,
  Info,
  LayoutGrid,
  Merge,
  RotateCcw,
  Scissors,
  SplitSquareVertical,
  X,
  type LucideIcon,
} from 'lucide-react';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { findBestSplitIndex, trimSplitFragment } from '../../utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { usePipelineStore } from '../../stores/pipelineStore';
import { checkContextOverflow, estimateCharTokens } from '../../utils/tokenEstimate';
import { LANGUAGES } from '../../constants';
import { getSelectableModelIds, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { useUiStore } from '../../stores/uiStore';
import type { ModelProvider } from '../../types';
import { IconButton } from '../ui';

// ─── Types ───────────────────────────────────────────────────────────────────

// Each chunk is an array of paragraphs. This is the shared internal model
// for both the card view and the segment editor view.
type ParagraphChunks = string[][];

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

// ─── Utilities ───────────────────────────────────────────────────────────────

function toParagraphChunks(chunkTexts: string[]): ParagraphChunks {
  return chunkTexts.map((text) =>
    text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
  );
}

function countWords(paras: string[]): number {
  const text = paras.join(' ');
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// Derive a flat paragraph list and the set of boundary indices from ParagraphChunks.
// boundaryIndices contains the indices of paragraphs that start a new chunk (all except 0).
function toFlatModel(chunks: ParagraphChunks): { paragraphs: string[]; boundaries: Set<number> } {
  const paragraphs = chunks.flat();
  const boundaries = new Set<number>();
  let offset = 0;
  for (let i = 0; i < chunks.length - 1; i++) {
    offset += chunks[i].length;
    boundaries.add(offset);
  }
  return { paragraphs, boundaries };
}

// Reconstruct ParagraphChunks from a flat paragraph list and boundary set.
function fromFlatModel(paragraphs: string[], boundaries: Set<number>): ParagraphChunks {
  const chunks: ParagraphChunks = [];
  let current: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0 && boundaries.has(i)) {
      chunks.push(current);
      current = [];
    }
    current.push(paragraphs[i]);
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [[]];
}

// ─── Card sub-components ─────────────────────────────────────────────────────

const COLLAPSE_CHAR_THRESHOLD = 200;

interface ChunkCardProps {
  paras: string[];
  index: number;
  total: number;
  minWords: number;
  maxWords: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSplit: () => void;
  canSplit: boolean;
}

function ChunkCard({
  paras,
  index,
  total,
  minWords,
  maxWords,
  isExpanded,
  onToggleExpand,
  onSplit,
  canSplit,
}: ChunkCardProps) {
  const { t } = useTranslation();
  const text = paras.join('\n\n');
  const words = countWords(paras);
  const tooShort = minWords > 0 && words < minWords;
  const tooLong = maxWords > 0 && words > maxWords;
  const anomaly = tooShort || tooLong;
  const isLong = text.length > COLLAPSE_CHAR_THRESHOLD;

  const anomalyTitle = tooShort
    ? t('files.chunkTooShort', { words, min: minWords })
    : tooLong
    ? t('files.chunkTooLong', { words, max: maxWords })
    : '';

  return (
    <div
      className={`overflow-hidden rounded-[18px] border-y border-r transition-colors ${
        anomaly
          ? 'border-editorial-warning/60 bg-editorial-warning/5 border-l-4 border-l-editorial-warning'
          : 'border-editorial-border bg-editorial-bg border-l-4 border-l-editorial-accent/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-editorial-muted">
            {index + 1}
            <span className="font-normal opacity-50"> / {total}</span>
          </span>
          {anomaly && (
            <span title={anomalyTitle} className="shrink-0 cursor-help">
              <AlertTriangle size={12} className="text-editorial-warning" />
            </span>
          )}
          <span className={`text-xs font-mono tabular-nums ${anomaly ? 'text-editorial-warning' : 'text-editorial-muted'}`}>
            {words}w
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {canSplit && (
            <button
              type="button"
              onClick={onSplit}
              title={t('files.boundarySplit')}
              className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Scissors size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            disabled={!isLong}
            title={isExpanded ? t('files.collapseChunk') : t('files.expandChunk')}
            className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-default disabled:opacity-20"
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>
      <div className="px-4 pb-4 text-base leading-7 text-editorial-ink">
        {!isLong || isExpanded ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{text.slice(0, 180)}</p>
            <button
              type="button"
              onClick={onToggleExpand}
              className="my-2 block w-full rounded-lg border border-dashed border-editorial-border py-1 text-center text-xs text-editorial-muted transition-colors hover:border-editorial-ink/40 hover:text-editorial-ink focus:outline-none"
            >
              ··· {words}w — {t('files.expandChunk').toLowerCase()} ···
            </button>
            <p className="whitespace-pre-wrap">{text.slice(-120)}</p>
          </>
        )}
      </div>
    </div>
  );
}

interface BoundaryDividerProps {
  onGive: () => void;
  onTake: () => void;
  onMerge: () => void;
  canGive: boolean;
  canTake: boolean;
}

function BoundaryDivider({ onGive, onTake, onMerge, canGive, canTake }: BoundaryDividerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <div className="h-px flex-1 bg-editorial-border" />
      <button
        type="button"
        onClick={onTake}
        disabled={!canTake}
        title={t('files.boundaryTake')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp size={11} />
      </button>
      <button
        type="button"
        onClick={onMerge}
        title={t('files.boundaryMerge')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        <Merge size={11} />
      </button>
      <button
        type="button"
        onClick={onGive}
        disabled={!canGive}
        title={t('files.boundaryGive')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown size={11} />
      </button>
      <div className="h-px flex-1 bg-editorial-border" />
    </div>
  );
}

// ─── Segment editor sub-component ────────────────────────────────────────────

interface SegmentEditorProps {
  chunks: ParagraphChunks;
  minWords: number;
  maxWords: number;
  onAddBoundary: (paragraphIndex: number) => void;
  onRemoveBoundary: (paragraphIndex: number) => void;
  onSplitParagraph: (paragraphIndex: number) => void;
}

function SegmentEditor({
  chunks,
  minWords,
  maxWords,
  onAddBoundary,
  onRemoveBoundary,
  onSplitParagraph,
}: SegmentEditorProps) {
  const { t } = useTranslation();
  const [hoveredGap, setHoveredGap] = useState<number | null>(null);
  const [hoveredPara, setHoveredPara] = useState<number | null>(null);

  // Global start index for each chunk (used for event handler indices).
  const chunkStarts = useMemo(() => {
    const starts: number[] = [];
    let idx = 0;
    for (const chunk of chunks) {
      starts.push(idx);
      idx += chunk.length;
    }
    return starts;
  }, [chunks]);

  return (
    <div className="space-y-2 py-1">
      {chunks.map((paras, chunkIdx) => {
        const chunkWords = countWords(paras);
        const tooShort = minWords > 0 && chunkWords < minWords;
        const tooLong = maxWords > 0 && chunkWords > maxWords;
        const anomaly = tooShort || tooLong;
        const chunkStart = chunkStarts[chunkIdx];

        const anomalyTitle = tooShort
          ? t('files.chunkTooShort', { words: chunkWords, min: minWords })
          : tooLong
          ? t('files.chunkTooLong', { words: chunkWords, max: maxWords })
          : '';

        const accentLine = anomaly ? 'bg-editorial-warning/70' : 'bg-editorial-accent/60';
        const accentBorder = anomaly ? 'border-l-editorial-warning/70' : 'border-l-editorial-accent/50';
        const accentText = anomaly ? 'text-editorial-warning' : 'text-editorial-accent';
        const accentBadge = anomaly
          ? 'border-editorial-warning/60 bg-editorial-warning/10'
          : 'border-editorial-accent/50 bg-editorial-accent/10';

        return (
          <div key={chunkStart}>
            {/* Inter-chunk boundary divider (between chunks, not before first) */}
            {chunkIdx > 0 && (
              <div className="group relative flex items-center gap-3 py-2">
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
                <div
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${accentBadge} ${accentText}`}
                  title={anomaly ? anomalyTitle : undefined}
                >
                  {anomaly && <AlertTriangle size={10} />}
                  {t('pipeline.unit')} {chunkIdx + 1}
                  {anomaly && <span className="font-normal opacity-70">· {chunkWords}w</span>}
                </div>
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
                <button
                  type="button"
                  onClick={() => onRemoveBoundary(chunkStart)}
                  title={t('files.boundaryMerge')}
                  className="absolute -right-2 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted opacity-0 transition-all group-hover:opacity-100 hover:border-editorial-warning hover:text-editorial-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <Merge size={12} />
                </button>
              </div>
            )}

            {/* First chunk badge */}
            {chunkIdx === 0 && (
              <div
                className={`mb-2 flex items-center gap-3`}
                title={anomaly ? anomalyTitle : undefined}
              >
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
                <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${accentBadge} ${accentText}`}>
                  {anomaly && <AlertTriangle size={10} />}
                  {t('pipeline.unit')} 1
                  {anomaly && <span className="font-normal opacity-70">· {chunkWords}w</span>}
                </div>
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
              </div>
            )}

            {/* Chunk content with left accent bar */}
            <div className={`border-l-[3px] pl-4 ${accentBorder}`}>
              {paras.map((para, localIdx) => {
                const globalIdx = chunkStart + localIdx;
                const gapIdx = chunkStart + localIdx + 1;

                return (
                  <div key={chunkStart + localIdx}>
                    {/* Paragraph block */}
                    <div
                      className="group relative py-2 text-base leading-7 text-editorial-ink"
                      onMouseEnter={() => setHoveredPara(globalIdx)}
                      onMouseLeave={() => setHoveredPara(null)}
                    >
                      <p className="whitespace-pre-wrap pr-8">{para}</p>
                      {para.length > 200 && (
                        <button
                          type="button"
                          onClick={() => onSplitParagraph(globalIdx)}
                          title={t('files.boundarySplit')}
                          className={`absolute right-0 top-2 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-all hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${hoveredPara === globalIdx ? 'opacity-100' : 'opacity-0'}`}
                        >
                          <Scissors size={13} />
                        </button>
                      )}
                    </div>

                    {/* Intra-chunk gap — click to add a chunk boundary here */}
                    {localIdx < paras.length - 1 && (
                      <button
                        type="button"
                        className="group relative flex w-full cursor-pointer items-center gap-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        onMouseEnter={() => setHoveredGap(gapIdx)}
                        onMouseLeave={() => setHoveredGap(null)}
                        onClick={() => onAddBoundary(gapIdx)}
                        aria-label={t('files.boundaryAddHere')}
                        title={t('files.boundaryAddHere')}
                      >
                        <div className="h-px flex-1 bg-editorial-border/60 transition-colors group-hover:bg-editorial-border" />
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed text-xs font-bold transition-all ${hoveredGap === gapIdx ? 'border-editorial-ink text-editorial-ink' : 'border-editorial-border text-editorial-muted'}`}>
                          +
                        </div>
                        <div className="h-px flex-1 bg-editorial-border/60 transition-colors group-hover:bg-editorial-border" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
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
  const trapRef = useFocusTrap(true, onCancel);
  const [editorMode, setEditorMode] = useState<EditorMode>('cards');
  const { config } = usePipelineStore();
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  const chunkPresetShort = useUiStore((s) => s.chunkPresetShort);
  const chunkPresetMedium = useUiStore((s) => s.chunkPresetMedium);
  const chunkPresetLong = useUiStore((s) => s.chunkPresetLong);

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
    [useChunking, effectiveWordsPerChunk, markdownAware, activePresetWords, headingAware, carryTrailingShortBlocks, format, experimental, text],
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      ref={trapRef}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">

        {/* ── Unified header (filename + title + stats + controls) ───────── */}
        <div className="shrink-0 border-b border-editorial-border px-6 pb-4 pt-5">

          {/* Row 1: filename + mode toggle + close */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={15} className="shrink-0 text-editorial-muted" />
              <span className="truncate text-sm font-mono text-editorial-muted">{fileName}</span>
              {preview.experimental && (
                <span title={t('files.importExperimentalDocxMarkdown')} className="shrink-0 cursor-help">
                  <Info size={14} className="text-editorial-accent" />
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-0 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setEditorMode('cards')}
                  title={t('files.viewCards')}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'cards' ? 'bg-editorial-accent text-white' : 'text-editorial-muted hover:text-editorial-accent'}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('segments')}
                  title={t('files.viewSegments')}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'segments' ? 'bg-editorial-accent text-white' : 'text-editorial-muted hover:text-editorial-accent'}`}
                >
                  <SplitSquareVertical size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={onCancel}
                title={t('common.close')}
                aria-label={t('common.close')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Row 2: title */}
          <h2
            id="import-preview-title"
            className="mb-2 font-display text-2xl italic tracking-tight text-editorial-ink"
          >
            {t('files.importPreviewTitle')}
          </h2>

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
              <span className="ml-1" title={preview.warnings.map((w) => t(`files.importWarning.${w}`)).join('\n')}>
                <Info size={12} className="inline align-middle text-editorial-muted/60 cursor-help" />
              </span>
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
                  <button
                    key={words}
                    type="button"
                    onClick={() => handleWordsPerChunkChange(words)}
                    title={t(titleKey)}
                    className={`rounded-full border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-warning ${
                      activePresetWords === words
                        ? 'border-editorial-warning bg-editorial-warning/20 text-editorial-warning'
                        : 'border-editorial-warning/40 text-editorial-warning/60 hover:border-editorial-warning hover:text-editorial-warning hover:bg-editorial-warning/10'
                    }`}
                  >
                    <Icon size={14} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={recalculate}
                  title={t('files.recalculateHint')}
                  className="rounded-full border border-editorial-warning bg-editorial-warning/10 p-2 text-editorial-warning transition-colors hover:bg-editorial-warning/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-warning"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            )}

            {/* Ricalcola spento — nessuna modifica manuale */}
            {!hasManualEdits && (
              <button
                type="button"
                disabled
                title={t('files.recalculateHint')}
                className="ml-auto cursor-not-allowed rounded-full border border-editorial-border p-2 text-editorial-muted opacity-25 focus:outline-none"
              >
                <RotateCcw size={13} />
              </button>
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
                  className="w-32 rounded-[10px] border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none"
                  aria-label={t('pipeline.sourceLanguage')}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSwapLanguages}
                  title={t('pipeline.swapLanguages')}
                  aria-label={t('pipeline.swapLanguages')}
                  className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <ArrowLeftRight size={12} />
                </button>
                <select
                  value={targetLanguage}
                  onChange={(e) => handleTargetLanguageChange(e.target.value)}
                  className="w-32 rounded-[10px] border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none"
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
                  className="w-24 rounded-[10px] border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-bold uppercase outline-none focus:border-editorial-ink/40 appearance-none"
                  aria-label={t('pipeline.source')}
                >
                  {MODEL_PROVIDER_ORDER.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  disabled={availableModels.length === 0}
                  className="flex-1 min-w-0 rounded-[10px] border border-editorial-border bg-editorial-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40 appearance-none disabled:opacity-40"
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
            <div className="flex items-start gap-2 rounded-lg border border-editorial-warning/40 bg-editorial-warning/10 p-3 text-xs text-editorial-warning">
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
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-editorial-border px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-full bg-editorial-ink px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent"
              >
                {t('files.importConfirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
