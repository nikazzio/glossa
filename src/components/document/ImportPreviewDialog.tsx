import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutGrid,
  Merge,
  RotateCcw,
  Scissors,
  SplitSquareVertical,
} from 'lucide-react';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { findBestSplitIndex, recommendChunkCount, trimSplitFragment } from '../../utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// ─── Types ───────────────────────────────────────────────────────────────────

// Each chunk is an array of paragraphs. This is the shared internal model
// for both the card view and the segment editor view.
type ParagraphChunks = string[][];

interface ImportPreviewDialogProps {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
  minWords: number;
  maxWords: number;
  headingAware: boolean;
  markdownAware?: boolean;
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
  onUseChunkingChange: (value: boolean) => void;
  onTargetChunkCountChange: (value: number) => void;
  onHeadingAwareChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: (manualChunks?: string[]) => void;
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

const COLLAPSE_CHAR_THRESHOLD = 400;

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

  return (
    <div
      className={`rounded-[18px] border transition-colors ${
        anomaly
          ? 'border-editorial-warning/50 bg-editorial-warning/5'
          : 'border-editorial-border bg-editorial-bg'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
            {index + 1}
            <span className="font-normal opacity-50"> / {total}</span>
          </span>
          {anomaly && <AlertTriangle size={10} className="shrink-0 text-editorial-warning" />}
          <span className={`text-[10px] font-mono tabular-nums ${anomaly ? 'text-editorial-warning' : 'text-editorial-muted'}`}>
            {words}w
          </span>
        </div>
        <div className="flex items-center gap-1">
          {canSplit && (
            <button
              type="button"
              onClick={onSplit}
              title={t('files.boundarySplit')}
              className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Scissors size={11} />
            </button>
          )}
          {isLong && (
            <button
              type="button"
              onClick={onToggleExpand}
              title={isExpanded ? t('files.collapseChunk') : t('files.expandChunk')}
              className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
      </div>
      <div className="px-4 pb-4 text-base leading-7 text-editorial-ink">
        {!isLong || isExpanded ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{text.slice(0, 200)}</p>
            <button
              type="button"
              onClick={onToggleExpand}
              className="my-1.5 block font-mono text-[10px] text-editorial-muted/50 transition-colors hover:text-editorial-muted focus:outline-none"
            >
              ··· {words}w ···
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
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp size={11} />
      </button>
      <button
        type="button"
        onClick={onMerge}
        title={t('files.boundaryMerge')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        <Merge size={11} />
      </button>
      <button
        type="button"
        onClick={onGive}
        disabled={!canGive}
        title={t('files.boundaryGive')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
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
  const { paragraphs, boundaries } = useMemo(() => toFlatModel(chunks), [chunks]);
  const [hoveredGap, setHoveredGap] = useState<number | null>(null);
  const [hoveredPara, setHoveredPara] = useState<number | null>(null);

  // Compute which chunk each paragraph belongs to (for word count badges).
  const chunkIndexForPara = useMemo(() => {
    const result: number[] = [];
    let chunkIdx = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      if (i > 0 && boundaries.has(i)) chunkIdx++;
      result.push(chunkIdx);
    }
    return result;
  }, [paragraphs, boundaries]);

  return (
    <div className="space-y-0">
      {paragraphs.map((para, i) => {
        const isBoundaryBefore = i > 0 && boundaries.has(i);
        const chunkIdx = chunkIndexForPara[i];
        const chunkWords = countWords(chunks[chunkIdx] ?? [para]);
        const tooShort = minWords > 0 && chunkWords < minWords;
        const tooLong = maxWords > 0 && chunkWords > maxWords;
        const anomaly = tooShort || tooLong;
        const isLastInChunk = i === paragraphs.length - 1 || boundaries.has(i + 1);
        const isFirstInChunk = i === 0 || boundaries.has(i);

        return (
          <div key={i}>
            {/* Chunk boundary marker or inter-paragraph gap */}
            {i > 0 && (
              isBoundaryBefore ? (
                /* Active chunk boundary */
                <div className="group relative flex items-center gap-2 py-2">
                  <div className={`h-0.5 flex-1 rounded-full ${anomaly ? 'bg-editorial-warning/60' : 'bg-editorial-accent/50'}`} />
                  <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${anomaly ? 'border-editorial-warning/60 bg-editorial-warning/10 text-editorial-warning' : 'border-editorial-accent/50 bg-editorial-accent/10 text-editorial-accent'}`}>
                    {anomaly && <AlertTriangle size={9} />}
                    {t('pipeline.unit')} {chunkIdx + 1}
                    {anomaly && <span className="font-normal opacity-70">· {chunkWords}w</span>}
                  </div>
                  <div className={`h-0.5 flex-1 rounded-full ${anomaly ? 'bg-editorial-warning/60' : 'bg-editorial-accent/50'}`} />
                  <button
                    type="button"
                    onClick={() => onRemoveBoundary(i)}
                    title={t('files.boundaryMerge')}
                    className="absolute -right-2 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted opacity-0 transition-all group-hover:opacity-100 hover:border-editorial-warning hover:text-editorial-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Merge size={11} />
                  </button>
                </div>
              ) : (
                /* Non-boundary gap — hover to add boundary */
                <div
                  className="group relative flex cursor-pointer items-center gap-2 py-1"
                  onMouseEnter={() => setHoveredGap(i)}
                  onMouseLeave={() => setHoveredGap(null)}
                  onClick={() => onAddBoundary(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onAddBoundary(i)}
                  title={t('files.boundaryAddHere')}
                >
                  <div className="h-px flex-1 bg-editorial-border/50 transition-colors group-hover:bg-editorial-border" />
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed text-xs transition-all ${hoveredGap === i ? 'border-editorial-ink text-editorial-ink' : 'border-editorial-border text-editorial-muted'}`}>
                    +
                  </div>
                  <div className="h-px flex-1 bg-editorial-border/50 transition-colors group-hover:bg-editorial-border" />
                </div>
              )
            )}

            {/* Paragraph block */}
            <div
              className="group relative rounded-xl px-4 py-3 text-base leading-7 text-editorial-ink transition-colors hover:bg-editorial-textbox/25"
              onMouseEnter={() => setHoveredPara(i)}
              onMouseLeave={() => setHoveredPara(null)}
            >
              <p className="whitespace-pre-wrap pr-8">{para}</p>
              {/* Split paragraph button — only when meaningful */}
              {para.length > 200 && (
                <button
                  type="button"
                  onClick={() => onSplitParagraph(i)}
                  title={t('files.boundarySplit')}
                  className={`absolute right-2 top-3 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-all hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${hoveredPara === i ? 'opacity-100' : 'opacity-0'}`}
                >
                  <Scissors size={11} />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Last chunk badge */}
      {paragraphs.length > 0 && (() => {
        const lastChunkIdx = chunks.length - 1;
        const lastChunkWords = countWords(chunks[lastChunkIdx] ?? []);
        const tooShort = minWords > 0 && lastChunkWords < minWords;
        const tooLong = maxWords > 0 && lastChunkWords > maxWords;
        const anomaly = tooShort || tooLong;
        return (
          <div className="flex items-center gap-2 pt-1.5">
            <div className={`h-0.5 flex-1 rounded-full ${anomaly ? 'bg-editorial-warning/60' : 'bg-editorial-accent/50'}`} />
            <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${anomaly ? 'border-editorial-warning/60 bg-editorial-warning/10 text-editorial-warning' : 'border-editorial-accent/50 bg-editorial-accent/10 text-editorial-accent'}`}>
              {anomaly && <AlertTriangle size={9} />}
              {t('pipeline.unit')} {lastChunkIdx + 1}
              {anomaly && <span className="font-normal opacity-70">· {lastChunkWords}w</span>}
            </div>
            <div className={`h-0.5 flex-1 rounded-full ${anomaly ? 'bg-editorial-warning/60' : 'bg-editorial-accent/50'}`} />
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type EditorMode = 'cards' | 'segments';

export function ImportPreviewDialog({
  fileName,
  text,
  useChunking,
  targetChunkCount,
  minWords,
  maxWords,
  headingAware,
  markdownAware = false,
  format,
  experimental,
  onUseChunkingChange,
  onTargetChunkCountChange,
  onHeadingAwareChange,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const [editorMode, setEditorMode] = useState<EditorMode>('cards');

  // ── Settings: words-per-chunk ↔ targetChunkCount sync ─────────────────────
  const totalWords = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  }, [text]);

  useEffect(() => {
    if (targetChunkCount === 0) {
      onTargetChunkCountChange(recommendChunkCount(text, 700));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveTargetChunkCount = targetChunkCount > 0
    ? targetChunkCount
    : recommendChunkCount(text, 700);

  const derivedWordsPerChunk = effectiveTargetChunkCount > 0
    ? Math.round(totalWords / effectiveTargetChunkCount)
    : 700;

  const [wordsPerChunkInput, setWordsPerChunkInput] = useState(String(derivedWordsPerChunk));
  const isUserEditing = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isUserEditing.current) {
      setWordsPerChunkInput(String(derivedWordsPerChunk));
    }
  }, [derivedWordsPerChunk]);

  const handleWordsPerChunkChange = (value: number) => {
    onTargetChunkCountChange(recommendChunkCount(text, Math.max(50, value)));
  };

  const handleWordsPerChunkInputChange = (raw: string) => {
    isUserEditing.current = true;
    setWordsPerChunkInput(raw);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const parsed = Number(raw);
    if (parsed >= 50) {
      debounceTimer.current = setTimeout(() => {
        handleWordsPerChunkChange(parsed);
      }, 350);
    }
  };

  // ── Algorithmic chunk computation ──────────────────────────────────────────
  const preview = useMemo(
    () => buildImportPreview(text, {
      useChunking,
      targetChunkCount: effectiveTargetChunkCount,
      markdownAware,
      minWords,
      maxWords,
      headingAware,
      format,
      experimental,
    }),
    [useChunking, effectiveTargetChunkCount, markdownAware, minWords, maxWords, headingAware, format, experimental, text],
  );

  const algorithmicParaChunks = useMemo(
    () => toParagraphChunks(preview.chunks.map((c) => c.text)),
    [preview.chunks],
  );

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

  const splitChunkAtMid = useCallback((i: number, paraChunks: ParagraphChunks) => {
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
    if (hasManualEdits) {
      onConfirm(activeParaChunks.map((paras) => paras.join('\n\n')));
    } else {
      onConfirm();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const chunkCountLabel = `${activeParaChunks.length} ${t('pipeline.unitsReady')}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      ref={trapRef}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-editorial-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <FileText size={15} className="shrink-0 text-editorial-muted" />
                <span className="truncate text-sm font-mono text-editorial-muted">{fileName}</span>
              </div>
              <h2
                id="import-preview-title"
                className="font-display text-2xl italic tracking-tight text-editorial-ink"
              >
                {t('files.importPreviewTitle')}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-mono text-editorial-muted">
                <span>{preview.stats.words}w</span>
                <span>·</span>
                <span>{preview.stats.paragraphs} {t('pipeline.paragraphs').toLowerCase()}</span>
                <span>·</span>
                <span className={hasManualEdits ? 'text-editorial-warning/80' : ''}>
                  {chunkCountLabel}
                  {hasManualEdits && ` · ${t('files.manualEditsActive')}`}
                </span>
              </div>
            </div>

            {/* Mode toggle — app-consistent pill style */}
            <div className="flex shrink-0 items-center gap-0 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => setEditorMode('cards')}
                title={t('files.viewCards')}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'cards' ? 'bg-editorial-ink text-white' : 'text-editorial-muted hover:text-editorial-ink'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('segments')}
                title={t('files.viewSegments')}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${editorMode === 'segments' ? 'bg-editorial-ink text-white' : 'text-editorial-muted hover:text-editorial-ink'}`}
              >
                <SplitSquareVertical size={16} />
              </button>
            </div>
          </div>

          {/* Warnings */}
          {(preview.experimental || preview.warnings.length > 0) && (
            <div className="mt-3 space-y-2">
              {preview.experimental && (
                <div className="rounded-2xl border border-editorial-accent/20 bg-editorial-accent/5 px-4 py-2.5 text-xs leading-relaxed text-editorial-ink">
                  {t('files.importExperimentalDocxMarkdown')}
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.warnings.map((w) => (
                    <span key={w} className="rounded-full border border-editorial-border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                      {t(`files.importWarning.${w}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Settings strip ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-editorial-border bg-editorial-textbox/20 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-5">
            {/* Auto-segment */}
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={useChunking}
                onChange={(e) => onUseChunkingChange(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-editorial-ink"
              />
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-editorial-ink">
                {t('pipeline.autoSegment')}
              </span>
            </label>

            {/* Heading-aware (only for markdown) */}
            {markdownAware && (
              <label className={`flex cursor-pointer items-center gap-2.5 ${!useChunking ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox"
                  checked={headingAware}
                  onChange={(e) => onHeadingAwareChange(e.target.checked)}
                  disabled={!useChunking}
                  className="h-4 w-4 cursor-pointer accent-editorial-ink"
                />
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-editorial-ink">
                  {t('pipeline.headingAware')}
                </span>
              </label>
            )}

            {/* Words per chunk */}
            {useChunking && (
              <div className="flex items-center gap-2.5">
                <label className="whitespace-nowrap text-xs font-bold uppercase tracking-[0.15em] text-editorial-muted">
                  {t('files.wordsPerChunk')}
                </label>
                <input
                  type="number"
                  min={50}
                  step={50}
                  value={wordsPerChunkInput}
                  onChange={(e) => handleWordsPerChunkInputChange(e.target.value)}
                  onBlur={(e) => {
                    if (debounceTimer.current) clearTimeout(debounceTimer.current);
                    isUserEditing.current = false;
                    const next = Math.max(50, Number(e.target.value) || 700);
                    setWordsPerChunkInput(String(next));
                    handleWordsPerChunkChange(next);
                  }}
                  className="w-20 rounded-xl border border-editorial-border bg-editorial-bg px-3 py-1.5 text-sm font-mono outline-none focus:border-editorial-ink/40"
                />
              </div>
            )}

            {/* Recalculate — shown when manual edits are active */}
            {hasManualEdits && (
              <button
                type="button"
                onClick={recalculate}
                title={t('files.recalculateHint')}
                className="ml-auto rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Content area ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 custom-scrollbar">
          {editorMode === 'cards' ? (
            <div className="flex flex-col gap-0">
              {activeParaChunks.map((paras, i) => (
                <div key={i}>
                  <ChunkCard
                    paras={paras}
                    index={i}
                    total={activeParaChunks.length}
                    minWords={minWords}
                    maxWords={maxWords}
                    isExpanded={expandedChunks.has(i)}
                    onToggleExpand={() => toggleExpanded(i)}
                    onSplit={() => splitChunkAtMid(i, activeParaChunks)}
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
              ))}
            </div>
          ) : (
            <SegmentEditor
              chunks={activeParaChunks}
              minWords={minWords}
              maxWords={maxWords}
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
