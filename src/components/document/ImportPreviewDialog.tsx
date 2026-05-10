import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Merge,
  RotateCcw,
  Scissors,
} from 'lucide-react';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { recommendChunkCount } from '../../utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Each chunk is represented as an array of paragraphs for boundary editing.
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
  onMinWordsChange: (value: number) => void;
  onMaxWordsChange: (value: number) => void;
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

function countParaChunkWords(paras: string[]): number {
  const text = paras.join(' ');
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
  const words = countParaChunkWords(paras);
  const tooShort = minWords > 0 && words < minWords;
  const tooLong = maxWords > 0 && words > maxWords;
  const anomaly = tooShort || tooLong;
  const isLong = text.length > COLLAPSE_CHAR_THRESHOLD;

  const headLabel = `${t('pipeline.unit')} ${index + 1}`;
  const totalLabel = `/ ${total}`;

  return (
    <div
      className={`rounded-[20px] border p-4 md:p-5 transition-colors ${
        anomaly
          ? 'border-editorial-warning/50 bg-editorial-warning/5'
          : 'border-editorial-border bg-editorial-bg'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
            {headLabel}
          </span>
          <span className="text-[10px] text-editorial-border">{totalLabel}</span>
          {anomaly && (
            <AlertTriangle size={11} className="shrink-0 text-editorial-warning" />
          )}
          <span
            className={`text-[10px] font-mono ${anomaly ? 'text-editorial-warning' : 'text-editorial-muted'}`}
          >
            {anomaly
              ? t('files.chunkWordCountAnomaly', { words })
              : t('files.chunkWordCount', { words })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {canSplit && (
            <button
              type="button"
              onClick={onSplit}
              title={t('files.boundarySplit')}
              className="flex items-center gap-1 rounded-full border border-editorial-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:border-editorial-ink/30 hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Scissors size={10} />
              <span className="hidden sm:inline">{t('files.boundarySplit')}</span>
            </button>
          )}
          {isLong && (
            <button
              type="button"
              onClick={onToggleExpand}
              title={isExpanded ? t('files.collapseChunk') : t('files.expandChunk')}
              className="flex items-center gap-1 rounded-full border border-editorial-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:border-editorial-ink/30 hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              <span className="hidden sm:inline">
                {isExpanded ? t('files.collapseChunk') : t('files.expandChunk')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="mt-3 text-sm leading-7 text-editorial-ink">
        {!isLong || isExpanded ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{text.slice(0, 200)}</p>
            <button
              type="button"
              onClick={onToggleExpand}
              className="my-2 block text-[10px] font-mono text-editorial-muted/70 transition-colors hover:text-editorial-muted focus:outline-none"
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
    <div className="flex items-center gap-2 px-2 py-0.5">
      <div className="h-px flex-1 bg-editorial-border/40" />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onTake}
          disabled={!canTake}
          title={t('files.boundaryTake')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-ink/30 hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          onClick={onMerge}
          title={t('files.boundaryMerge')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-ink/30 hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Merge size={11} />
        </button>
        <button
          type="button"
          onClick={onGive}
          disabled={!canGive}
          title={t('files.boundaryGive')}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-ink/30 hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronDown size={11} />
        </button>
      </div>
      <div className="h-px flex-1 bg-editorial-border/40" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  onMinWordsChange,
  onMaxWordsChange,
  onHeadingAwareChange,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);

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
  const chunkOptions = useMemo(() => ({
    useChunking,
    targetChunkCount: effectiveTargetChunkCount,
    markdownAware,
    minWords,
    maxWords,
    headingAware,
    format,
    experimental,
  }), [useChunking, effectiveTargetChunkCount, markdownAware, minWords, maxWords, headingAware, format, experimental]);

  const preview = useMemo(
    () => buildImportPreview(text, chunkOptions),
    [text, chunkOptions],
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

  // Reset expanded state when chunk count changes
  useEffect(() => {
    setExpandedChunks(new Set());
  }, [activeParaChunks.length]);

  // When settings change and there are no manual edits, the preview updates live.
  // When there are manual edits, only algorithmicParaChunks is recomputed but
  // activeParaChunks stays pinned to manualParaChunks.

  // ── Boundary operations ───────────────────────────────────────────────────
  const modifyChunks = useCallback(
    (modifier: (chunks: ParagraphChunks) => ParagraphChunks) => {
      setManualParaChunks((current) => modifier(current ?? algorithmicParaChunks));
    },
    [algorithmicParaChunks],
  );

  const giveLastParagraph = useCallback(
    (i: number) => {
      modifyChunks((chunks) => {
        if (i >= chunks.length - 1 || chunks[i].length < 2) return chunks;
        const next = chunks.map((c) => [...c]);
        const moved = next[i].pop()!;
        next[i + 1].unshift(moved);
        return next;
      });
    },
    [modifyChunks],
  );

  const takeFirstParagraph = useCallback(
    (i: number) => {
      modifyChunks((chunks) => {
        if (i >= chunks.length - 1 || chunks[i + 1].length < 2) return chunks;
        const next = chunks.map((c) => [...c]);
        const moved = next[i + 1].shift()!;
        next[i].push(moved);
        return next;
      });
    },
    [modifyChunks],
  );

  const mergeChunks = useCallback(
    (i: number) => {
      modifyChunks((chunks) => {
        if (i >= chunks.length - 1) return chunks;
        const next = chunks.map((c) => [...c]);
        const merged = [...next[i], ...next[i + 1]];
        next.splice(i, 2, merged);
        // Shift expanded indices after merge
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
    },
    [modifyChunks],
  );

  const splitChunk = useCallback(
    (i: number) => {
      modifyChunks((chunks) => {
        const paras = chunks[i];
        if (paras.length < 2) return chunks;
        const mid = Math.ceil(paras.length / 2);
        const first = paras.slice(0, mid);
        const second = paras.slice(mid);
        const next = chunks.map((c) => [...c]);
        next.splice(i, 1, first, second);
        // Shift expanded indices after split
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
    },
    [modifyChunks],
  );

  const recalculate = useCallback(() => {
    setManualParaChunks(null);
    setExpandedChunks(new Set());
  }, []);

  const toggleExpanded = useCallback((i: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  // ── Word-loss coherence check ─────────────────────────────────────────────
  const totalActiveWords = useMemo(
    () => activeParaChunks.reduce((sum, paras) => sum + countParaChunkWords(paras), 0),
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      aria-describedby="import-preview-filename"
      ref={trapRef}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">

        {/* Header */}
        <div className="shrink-0 border-b border-editorial-border px-6 py-5 md:px-8 md:py-6">
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('files.importPreviewLabel')}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2
                  id="import-preview-title"
                  className="font-display text-2xl italic tracking-tight text-editorial-ink md:text-3xl"
                >
                  {t('files.importPreviewTitle')}
                </h2>
                <p
                  id="import-preview-filename"
                  className="mt-2 break-all text-sm text-editorial-muted"
                >
                  {fileName}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 text-[11px] font-mono text-editorial-muted sm:grid-cols-3">
                <span>{t('pipeline.words')}: {preview.stats.words}</span>
                <span>{t('pipeline.paragraphs')}: {preview.stats.paragraphs}</span>
                <span>{t('document.chunkCounterCompact', { total: activeParaChunks.length })}</span>
              </div>
            </div>
            {preview.experimental && (
              <div className="rounded-2xl border border-editorial-accent/20 bg-editorial-accent/5 px-4 py-3 text-xs leading-relaxed text-editorial-ink">
                {t('files.importExperimentalDocxMarkdown')}
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {preview.warnings.map((warning) => (
                  <span
                    key={warning}
                    className="rounded-full border border-editorial-border bg-editorial-bg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted"
                  >
                    {t(`files.importWarning.${warning}`)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Settings strip */}
        <div className="shrink-0 border-b border-editorial-border bg-editorial-textbox/25 px-6 py-4 md:px-8">
          <div className="flex flex-wrap items-center gap-3">

            {/* Auto-segment toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useChunking}
                onChange={(e) => onUseChunkingChange(e.target.checked)}
                className="accent-editorial-ink"
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-ink">
                {t('pipeline.autoSegment')}
              </span>
            </label>

            {/* Heading-aware toggle (only for markdown) */}
            {markdownAware && (
              <label className={`flex items-center gap-2 cursor-pointer ${!useChunking ? 'opacity-40' : ''}`}>
                <input
                  type="checkbox"
                  checked={headingAware}
                  onChange={(e) => onHeadingAwareChange(e.target.checked)}
                  disabled={!useChunking}
                  className="accent-editorial-ink"
                />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-ink">
                  {t('pipeline.headingAware')}
                </span>
              </label>
            )}

            {/* Numeric inputs (only when chunking enabled) */}
            {useChunking && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted whitespace-nowrap">
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
                      const nextValue = Math.max(50, Number(e.target.value) || 700);
                      setWordsPerChunkInput(String(nextValue));
                      handleWordsPerChunkChange(nextValue);
                    }}
                    className="w-20 rounded-xl border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                    {t('files.minWordsPerChunk')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={minWords}
                    onChange={(e) => onMinWordsChange(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-xl border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                    {t('files.maxWordsPerChunk')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={maxWords}
                    onChange={(e) => onMaxWordsChange(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-xl border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs font-mono outline-none focus:border-editorial-ink/40"
                  />
                </div>
              </div>
            )}

            {/* Recalculate button — only visible when manual edits exist */}
            {hasManualEdits && (
              <button
                type="button"
                onClick={recalculate}
                title={t('files.recalculateHint')}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-editorial-warning/50 bg-editorial-warning/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-warning transition-colors hover:bg-editorial-warning/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-warning"
              >
                <RotateCcw size={11} />
                {t('files.recalculate')}
              </button>
            )}
          </div>
        </div>

        {/* Chunk list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 md:px-8 custom-scrollbar">
          {activeParaChunks.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-editorial-muted">
              {t('files.importCoherenceWarning', { pct: 100 })}
            </div>
          ) : (
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
                    onSplit={() => splitChunk(i)}
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
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-editorial-border px-6 py-4 md:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Coherence indicator */}
            {hasCoherenceIssue ? (
              <div className="flex items-center gap-2 text-xs text-editorial-warning">
                <AlertTriangle size={12} className="shrink-0" />
                {t('files.importCoherenceWarning', { pct: wordLossPct })}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-editorial-muted/60">
                <CheckCircle2 size={11} className="shrink-0" />
                {t('files.importCoherenceOk')}
                {hasManualEdits && (
                  <span className="ml-2 text-editorial-warning/80">· {t('files.manualEditsActive')}</span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-editorial-border px-5 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-full bg-editorial-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent"
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
