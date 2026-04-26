import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  RotateCcw,
  ScanLine,
  Scissors,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import {
  calculateCompositeQuality,
  findBestSplitIndex,
  indexPad,
  qualityLabelKey,
  qualityTone,
} from '../../utils';
import { buildSplitPreview } from '../../utils/documentWorkflow';
import { CopyButton, StatusIndicator } from '../common';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DocumentViewProps {
  onRetranslateChunk: (chunkId: string) => void;
  onReauditChunk: (chunkId: string) => void;
  onRunAuditOnly: () => void;
}

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export function DocumentView({
  onRetranslateChunk,
  onReauditChunk,
  onRunAuditOnly,
}: DocumentViewProps) {
  const { t } = useTranslation();
  const { config } = usePipelineStore();
  const {
    chunks,
    isProcessing,
    updateChunkDraft,
    updateChunkOriginalText,
    splitChunkAt,
    mergeChunkWithNext,
    unlockChunkForEdit,
  } = useChunksStore();
  const {
    selectedChunkId,
    setSelectedChunkId,
    documentLayout,
  } = useUiStore();

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [splitDraft, setSplitDraft] = useState<{ chunkId: string; splitAt: number } | null>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const currentQualityLabel = currentChunk
    ? t(qualityLabelKey(currentChunk.judgeResult.rating))
    : t('audit.ratingNone');

  const compositeQuality = useMemo(() => calculateCompositeQuality(chunks), [chunks]);
  const completedCount = chunks.filter((chunk) => chunk.status === 'completed').length;

  useEffect(() => {
    if (!chunks.length) return;
    if (!selectedChunkId || !chunks.some((chunk) => chunk.id === selectedChunkId)) {
      setSelectedChunkId(chunks[0].id);
    }
  }, [chunks, selectedChunkId, setSelectedChunkId]);

  const handleUnlockSource = async (chunkId: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmUnlockTitle'),
      message: t('pipeline.confirmUnlockMessage'),
      confirmLabel: t('pipeline.unlockSource'),
      danger: true,
    });
    if (ok) unlockChunkForEdit(chunkId);
  };

  const openSplitDialog = (chunkId: string, text: string) => {
    const initialSplitAt =
      findBestSplitIndex(text) ?? Math.max(1, Math.floor(text.length / 2));
    setSplitDraft({ chunkId, splitAt: initialSplitAt });
  };

  if (!currentChunk) {
    return (
      <section className="flex w-full items-center justify-center bg-editorial-bg p-10">
        <div className="max-w-xl text-center space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.emptyLabel')}
          </div>
          <h2 className="font-display text-4xl italic tracking-tight text-editorial-ink">
            {t('document.emptyTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-editorial-muted">
            {t('document.emptyBody')}
          </p>
        </div>
      </section>
    );
  }

  const isBook = resolvedLayout === 'book';
  const prevChunk = chunks[currentIndex - 1];
  const nextChunk = chunks[currentIndex + 1];
  const chunkTone = qualityTone(currentChunk.judgeResult.rating);

  const sourceWords = chunks.reduce(
    (acc, chunk) => acc + countWords(chunk.originalText),
    0,
  );
  const translatedWords = chunks.reduce(
    (acc, chunk) => acc + countWords(chunk.currentDraft || ''),
    0,
  );

  return (
    <section className="w-full bg-[#f7f3ec] overflow-y-auto min-h-0 h-full custom-scrollbar">
      <div className="mx-auto max-w-[1500px] px-6 py-6 md:px-8 md:py-8 space-y-6">
        <ProjectInfoPanel
          chunkCount={chunks.length}
          completedCount={completedCount}
          sourceWords={sourceWords}
          translatedWords={translatedWords}
          composite={compositeQuality ? t(qualityLabelKey(compositeQuality)) : null}
        />

        <div className="rounded-[24px] border border-editorial-border bg-editorial-bg/90 px-6 py-4 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <span className="font-display text-xl italic text-editorial-accent">
                {t('pipeline.unit')} {indexPad(currentIndex + 1)}
              </span>
              <span className={`text-sm font-medium ${QUALITY_TONE_COLOR[chunkTone]}`}>
                {currentQualityLabel}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                {t(`pipeline.chunkStatus.${currentChunk.status}`)}
              </span>
            </div>

            <div
              role="toolbar"
              aria-label={t('pipeline.chunkActions')}
              className="flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                onClick={() => onRetranslateChunk(currentChunk.id)}
                disabled={isProcessing || currentChunk.originalText.trim().length === 0}
                className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
              >
                <RotateCcw size={12} className="inline mr-1" />
                {t('pipeline.retranslateChunk')}
              </button>
              <button
                type="button"
                onClick={() => onReauditChunk(currentChunk.id)}
                disabled={isProcessing || !currentChunk.currentDraft}
                className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
              >
                <ScanLine size={12} className="inline mr-1" />
                {t('pipeline.reauditChunk')}
              </button>
              {currentChunk.status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => handleUnlockSource(currentChunk.id)}
                  disabled={isProcessing}
                  className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                >
                  <Pencil size={12} className="inline mr-1" />
                  {t('pipeline.unlockSource')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openSplitDialog(currentChunk.id, currentChunk.originalText)}
                    disabled={isProcessing || currentChunk.originalText.trim().length < 2}
                    className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                  >
                    <Scissors size={12} className="inline mr-1" />
                    {t('pipeline.splitChunk')}
                  </button>
                  <button
                    type="button"
                    onClick={() => mergeChunkWithNext(currentChunk.id)}
                    disabled={
                      isProcessing ||
                      currentIndex === chunks.length - 1 ||
                      chunks[currentIndex + 1]?.status === 'completed' ||
                      chunks[currentIndex + 1]?.status === 'processing'
                    }
                    className="rounded-full border border-editorial-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                  >
                    <Copy size={12} className="inline mr-1" />
                    {t('pipeline.mergeNext')}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            {config.stages
              .filter((stage) => stage.enabled)
              .map((stage, stageIndex) => (
                <StatusIndicator
                  key={stage.id}
                  status={currentChunk.stageResults[stage.id]?.status || 'idle'}
                  label={indexPad(stageIndex + 1)}
                />
              ))}
            <StatusIndicator status={currentChunk.judgeResult.status} label="Audit" />
          </div>
        </div>

        <div className={`grid gap-6 ${isBook ? '2xl:grid-cols-2' : 'grid-cols-1'}`}>
          <DocumentPage
            label={t('pipeline.originalSource')}
            eyebrow={t('document.leftPage')}
            readOnly={currentChunk.status === 'completed'}
          >
            <textarea
              value={currentChunk.originalText}
              onChange={(event) => updateChunkOriginalText(currentChunk.id, event.target.value)}
              disabled={isProcessing}
              readOnly={currentChunk.status === 'completed'}
              className="min-h-[420px] w-full resize-y bg-transparent text-[15px] leading-8 text-editorial-ink outline-none disabled:opacity-70 read-only:cursor-not-allowed"
            />
          </DocumentPage>

          <DocumentPage
            label={t('pipeline.candidateTranslation')}
            eyebrow={t('document.rightPage')}
            actions={<CopyButton text={currentChunk.currentDraft || ''} />}
          >
            <textarea
              value={currentChunk.currentDraft || ''}
              onChange={(event) => updateChunkDraft(currentChunk.id, event.target.value)}
              className="min-h-[420px] w-full resize-y bg-transparent text-[15px] leading-8 text-editorial-ink outline-none"
              placeholder={t('pipeline.candidatePlaceholder')}
            />
          </DocumentPage>
        </div>

        <nav
          aria-label={t('document.navigation')}
          className="flex items-center justify-between gap-4 rounded-[24px] border border-editorial-border bg-editorial-bg/90 px-6 py-4 shadow-[0_16px_50px_rgba(26,26,26,0.05)]"
        >
          <button
            type="button"
            onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
            disabled={!prevChunk}
            className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
            aria-label={t('document.previousChunk')}
          >
            <ChevronLeft size={14} />
            {t('document.previousChunk')}
          </button>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
            {t('document.chunkCounter', {
              current: currentIndex + 1,
              total: chunks.length,
            })}
          </div>
          <button
            type="button"
            onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
            disabled={!nextChunk}
            className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
            aria-label={t('document.nextChunk')}
          >
            {t('document.nextChunk')}
            <ChevronRight size={14} />
          </button>
        </nav>
      </div>
      {splitDraft && currentChunk.id === splitDraft.chunkId && (
        <SplitChunkDialog
          text={currentChunk.originalText}
          splitAt={splitDraft.splitAt}
          onSplitAtChange={(splitAt) => setSplitDraft((current) => (current ? { ...current, splitAt } : current))}
          onCancel={() => setSplitDraft(null)}
          onConfirm={() => {
            const didSplit = splitChunkAt(currentChunk.id, splitDraft.splitAt);
            if (didSplit) setSplitDraft(null);
          }}
        />
      )}
    </section>
  );
}

interface DocumentPageProps {
  label: string;
  eyebrow: string;
  readOnly?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function DocumentPage({
  label,
  eyebrow,
  readOnly = false,
  actions,
  children,
}: DocumentPageProps) {
  return (
    <section className="relative rounded-[28px] border border-[#d8cfbf] bg-[#fffdf9] px-8 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_45px_rgba(74,50,17,0.08)]">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-[#ede4d6] pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {eyebrow}
          </div>
          <h3 className="mt-2 font-display text-2xl italic tracking-tight text-editorial-ink">
            {label}
          </h3>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      <div className={readOnly ? 'opacity-90' : ''}>{children}</div>
    </section>
  );
}

function SplitChunkDialog({
  text,
  splitAt,
  onSplitAtChange,
  onCancel,
  onConfirm,
}: {
  text: string;
  splitAt: number;
  onSplitAtChange: (splitAt: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const preview = buildSplitPreview(text, splitAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-split-title"
      aria-describedby="manual-split-hint"
      ref={trapRef}
    >
      <div className="w-full max-w-5xl rounded-[28px] border border-editorial-border bg-editorial-bg p-6 shadow-[0_24px_80px_rgba(26,26,26,0.2)] md:p-8">
        <div className="border-b border-editorial-border pb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.manualSplitLabel')}
          </div>
          <h3
            id="manual-split-title"
            className="mt-2 font-display text-3xl italic tracking-tight text-editorial-ink"
          >
            {t('document.manualSplitTitle')}
          </h3>
          <p
            id="manual-split-hint"
            className="mt-2 text-sm leading-relaxed text-editorial-muted"
          >
            {t('document.manualSplitHint')}
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[22px] border border-editorial-border bg-editorial-textbox/35 p-5">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('pipeline.originalSource')}
            </div>
            <textarea
              value={text}
              readOnly
              onClick={(event) => onSplitAtChange(event.currentTarget.selectionStart)}
              onKeyUp={(event) => onSplitAtChange(event.currentTarget.selectionStart)}
              onSelect={(event) => onSplitAtChange(event.currentTarget.selectionStart)}
              className="min-h-[260px] w-full resize-none bg-transparent text-sm leading-7 text-editorial-ink outline-none"
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] border border-editorial-border bg-editorial-bg p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                {t('document.splitPreviewFirst')}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-editorial-ink">
                {preview.beforeText || '—'}
              </p>
            </div>
            <div className="rounded-[22px] border border-editorial-border bg-editorial-bg p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                {t('document.splitPreviewSecond')}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-editorial-ink">
                {preview.afterText || '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-editorial-border pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-editorial-border px-5 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!preview.isValid}
            className="rounded-full bg-editorial-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent disabled:opacity-40"
          >
            {t('document.manualSplitConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function truncateChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 58) return normalized;
  return `${normalized.slice(0, 55)}...`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface ProjectInfoPanelProps {
  chunkCount: number;
  completedCount: number;
  sourceWords: number;
  translatedWords: number;
  composite: string | null;
}

function ProjectInfoPanel({
  chunkCount,
  completedCount,
  sourceWords,
  translatedWords,
  composite,
}: ProjectInfoPanelProps) {
  const { t } = useTranslation();

  const items: Array<{ key: string; label: string; value: string }> = [
    {
      key: 'sourceWords',
      label: t('document.infoSourceWords'),
      value: sourceWords.toLocaleString(),
    },
    {
      key: 'translatedWords',
      label: t('document.infoTranslatedWords'),
      value: translatedWords.toLocaleString(),
    },
    {
      key: 'chunks',
      label: t('document.infoChunks'),
      value: `${completedCount} / ${chunkCount}`,
    },
  ];

  if (composite) {
    items.push({
      key: 'quality',
      label: t('document.infoQuality'),
      value: composite,
    });
  }

  return (
    <section
      aria-label={t('document.infoLabel')}
      className="rounded-[24px] border border-editorial-border bg-editorial-bg/90 px-6 py-4 shadow-[0_16px_50px_rgba(26,26,26,0.05)]"
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {item.label}
            </span>
            <span className="font-display text-2xl italic text-editorial-ink">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
