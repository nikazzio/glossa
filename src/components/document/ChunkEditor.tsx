import { AlertTriangle, ChevronDown, ChevronUp, Merge, Scissors } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ParagraphChunks, countWords } from '../../utils/paragraphChunks';

const COLLAPSE_CHAR_THRESHOLD = 200;
const PREVIEW_HEAD_CHARS = Math.round(COLLAPSE_CHAR_THRESHOLD * 0.9);
const PREVIEW_TAIL_CHARS = 120;

// ─── ChunkCard ────────────────────────────────────────────────────────────────

export interface ChunkCardProps {
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

export function ChunkCard({
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
            <span data-tooltip={anomalyTitle} className="shrink-0 cursor-help">
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
              data-tooltip={t('files.boundarySplit')}
              className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Scissors size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            disabled={!isLong}
            data-tooltip={isExpanded ? t('files.collapseChunk') : t('files.expandChunk')}
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
            <p className="whitespace-pre-wrap">{text.slice(0, PREVIEW_HEAD_CHARS)}</p>
            <button
              type="button"
              onClick={onToggleExpand}
              className="my-2 block w-full rounded-lg border border-dashed border-editorial-border py-1 text-center text-xs text-editorial-muted transition-colors hover:border-editorial-ink/40 hover:text-editorial-ink focus:outline-none"
            >
              ··· {words}w — {t('files.expandChunk').toLowerCase()} ···
            </button>
            <p className="whitespace-pre-wrap">{text.slice(-PREVIEW_TAIL_CHARS)}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BoundaryDivider ──────────────────────────────────────────────────────────

export interface BoundaryDividerProps {
  onGive: () => void;
  onTake: () => void;
  onMerge: () => void;
  canGive: boolean;
  canTake: boolean;
}

export function BoundaryDivider({ onGive, onTake, onMerge, canGive, canTake }: BoundaryDividerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <div className="h-px flex-1 bg-editorial-border" />
      <button
        type="button"
        onClick={onTake}
        disabled={!canTake}
        data-tooltip={t('files.boundaryTake')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp size={11} />
      </button>
      <button
        type="button"
        onClick={onMerge}
        data-tooltip={t('files.boundaryMerge')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        <Merge size={11} />
      </button>
      <button
        type="button"
        onClick={onGive}
        disabled={!canGive}
        data-tooltip={t('files.boundaryGive')}
        className="rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown size={11} />
      </button>
      <div className="h-px flex-1 bg-editorial-border" />
    </div>
  );
}

// ─── SegmentEditor ────────────────────────────────────────────────────────────

export interface SegmentEditorProps {
  chunks: ParagraphChunks;
  minWords: number;
  maxWords: number;
  onAddBoundary: (paragraphIndex: number) => void;
  onRemoveBoundary: (paragraphIndex: number) => void;
  onSplitParagraph: (paragraphIndex: number) => void;
}

export function SegmentEditor({
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
            {chunkIdx > 0 && (
              <div className="group relative flex items-center gap-3 py-2">
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
                <div
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${accentBadge} ${accentText}`}
                  data-tooltip={anomaly ? anomalyTitle : undefined}
                >
                  {anomaly && <AlertTriangle size={10} />}
                  {t('pipeline.unit')} {chunkIdx + 1}
                  {anomaly && <span className="font-normal opacity-70">· {chunkWords}w</span>}
                </div>
                <div className={`h-[2px] flex-1 rounded-full ${accentLine}`} />
                <button
                  type="button"
                  onClick={() => onRemoveBoundary(chunkStart)}
                  data-tooltip={t('files.boundaryMerge')}
                  className="absolute -right-2 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted opacity-0 transition-all group-hover:opacity-100 hover:border-editorial-warning hover:text-editorial-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <Merge size={12} />
                </button>
              </div>
            )}

            {chunkIdx === 0 && (
              <div
                className="mb-2 flex items-center gap-3"
                data-tooltip={anomaly ? anomalyTitle : undefined}
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

            <div className={`border-l-[3px] pl-4 ${accentBorder}`}>
              {paras.map((para, localIdx) => {
                const globalIdx = chunkStart + localIdx;
                const gapIdx = chunkStart + localIdx + 1;

                return (
                  <div key={chunkStart + localIdx}>
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
                          data-tooltip={t('files.boundarySplit')}
                          className={`absolute right-0 top-2 rounded-full border border-editorial-border bg-editorial-bg p-1 text-editorial-muted transition-all hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${hoveredPara === globalIdx ? 'opacity-100' : 'opacity-0'}`}
                        >
                          <Scissors size={13} />
                        </button>
                      )}
                    </div>

                    {localIdx < paras.length - 1 && (
                      <button
                        type="button"
                        className="group relative flex w-full cursor-pointer items-center gap-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        onMouseEnter={() => setHoveredGap(gapIdx)}
                        onMouseLeave={() => setHoveredGap(null)}
                        onClick={() => onAddBoundary(gapIdx)}
                        aria-label={t('files.boundaryAddHere')}
                        data-tooltip={t('files.boundaryAddHere')}
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
