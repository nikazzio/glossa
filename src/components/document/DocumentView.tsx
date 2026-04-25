import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Pencil,
  RefreshCcw,
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
  indexPad,
  qualityLabelKey,
  qualityTone,
} from '../../utils';
import { CopyButton, ProcessingLine, StatusIndicator } from '../common';

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
    splitChunk,
    mergeChunkWithNext,
    unlockChunkForEdit,
  } = useChunksStore();
  const {
    selectedChunkId,
    setSelectedChunkId,
    documentLayout,
    setDocumentLayout,
  } = useUiStore();

  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );

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

  if (!currentChunk) {
    return (
      <section className="md:col-span-9 p-10 flex items-center justify-center bg-editorial-bg">
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

  return (
    <section className="md:col-span-9 bg-[#f7f3ec] overflow-y-auto max-h-[calc(100vh-140px)] custom-scrollbar">
      <div className="mx-auto max-w-[1500px] px-6 py-8 md:px-8 md:py-10 space-y-8">
        <div className="rounded-[28px] border border-editorial-border/80 bg-editorial-bg/90 shadow-[0_24px_80px_rgba(26,26,26,0.06)] backdrop-blur">
          <div className="flex flex-col gap-5 border-b border-editorial-border px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('document.headerLabel')}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl italic tracking-tight text-editorial-ink">
                  {t('document.readerTitle')}
                </h2>
                <span className="rounded-full border border-editorial-border bg-editorial-textbox/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                  {t('document.chunkCounter', {
                    current: currentIndex + 1,
                    total: chunks.length,
                  })}
                </span>
                <span className={`text-sm font-medium ${QUALITY_TONE_COLOR[chunkTone]}`}>
                  {currentQualityLabel}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-full border border-editorial-border bg-editorial-bg p-1">
                <button
                  type="button"
                  onClick={() => setDocumentLayout('standard')}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'standard'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  <Columns2 size={12} className="inline mr-1" />
                  {t('document.layoutStandard')}
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentLayout('auto')}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'auto'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  {t('document.layoutAuto')}
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentLayout('book')}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'book'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  <BookOpen size={12} className="inline mr-1" />
                  {t('document.layoutBook')}
                </button>
              </div>

              <button
                type="button"
                onClick={onRunAuditOnly}
                disabled={isProcessing || chunks.length === 0}
                className="rounded-full border border-editorial-border bg-editorial-bg px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-40"
              >
                <ScanLine size={12} className="inline mr-1" />
                {t('audit.reEvaluate')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-6 py-4 text-xs text-editorial-muted">
            <span>{t('document.chunksReady', { count: chunks.length })}</span>
            <span>•</span>
            <span>{t('document.completedCount', { count: completedCount })}</span>
            {compositeQuality && (
              <>
                <span>•</span>
                <span>{t('document.compositeQuality', { quality: t(qualityLabelKey(compositeQuality)) })}</span>
              </>
            )}
            <span>•</span>
            <span>
              {t('document.layoutResolved', {
                layout: isBook ? t('document.layoutBook') : t('document.layoutStandard'),
              })}
            </span>
          </div>
        </div>

        <div className="rounded-[24px] border border-editorial-border bg-editorial-bg/90 p-4 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('document.indexLabel')}
            </div>
            <div className="text-[10px] text-editorial-muted">
              {t('document.indexHint')}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {chunks.map((chunk, index) => {
              const rating =
                chunk.judgeResult.status === 'completed'
                  ? t(qualityLabelKey(chunk.judgeResult.rating))
                  : t(`pipeline.chunkStatus.${chunk.status}`);
              return (
                <button
                  key={chunk.id}
                  type="button"
                  onClick={() => setSelectedChunkId(chunk.id)}
                  className={`min-w-[132px] rounded-2xl border px-4 py-3 text-left transition-colors ${
                    chunk.id === currentChunk.id
                      ? 'border-editorial-ink bg-editorial-ink text-white'
                      : 'border-editorial-border bg-editorial-bg hover:border-editorial-ink/40'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-80">
                    {t('pipeline.unit')} {indexPad(index + 1)}
                  </div>
                  <div className="mt-2 text-[11px] font-medium leading-snug">
                    {truncateChunk(chunk.originalText)}
                  </div>
                  <div className="mt-3 text-[10px] opacity-75">{rating}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[24px] border border-editorial-border bg-editorial-bg/90 px-6 py-5 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => prevChunk && setSelectedChunkId(prevChunk.id)}
                disabled={!prevChunk}
                className="rounded-full border border-editorial-border px-3 py-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                aria-label={t('document.previousChunk')}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => nextChunk && setSelectedChunkId(nextChunk.id)}
                disabled={!nextChunk}
                className="rounded-full border border-editorial-border px-3 py-2 text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                aria-label={t('document.nextChunk')}
              >
                <ChevronRight size={16} />
              </button>
              <div>
                <div className="font-display text-2xl italic text-editorial-accent">
                  {t('pipeline.unit')} {indexPad(currentIndex + 1)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                  {t(`pipeline.chunkStatus.${currentChunk.status}`)}
                </div>
              </div>
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
                className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
              >
                <RotateCcw size={12} className="inline mr-1" />
                {t('pipeline.retranslateChunk')}
              </button>
              <button
                type="button"
                onClick={() => onReauditChunk(currentChunk.id)}
                disabled={isProcessing || !currentChunk.currentDraft}
                className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
              >
                <ScanLine size={12} className="inline mr-1" />
                {t('pipeline.reauditChunk')}
              </button>
              {currentChunk.status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => handleUnlockSource(currentChunk.id)}
                  disabled={isProcessing}
                  className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                >
                  <Pencil size={12} className="inline mr-1" />
                  {t('pipeline.unlockSource')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => splitChunk(currentChunk.id)}
                    disabled={isProcessing || currentChunk.originalText.trim().length < 2}
                    className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
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
                    className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
                  >
                    <Copy size={12} className="inline mr-1" />
                    {t('pipeline.mergeNext')}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3">
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

        {config.stages.filter((stage) => stage.enabled).length > 0 && (
          <div className="rounded-[24px] border border-editorial-border bg-editorial-bg/90 p-6 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('document.stageTrace')}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {config.stages
                .filter((stage) => stage.enabled)
                .map((stage) => {
                  const result = currentChunk.stageResults[stage.id];
                  if (!result || result.status === 'idle') return null;

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-2xl border p-5 ${
                        result.status === 'error'
                          ? 'border-editorial-accent/40 bg-editorial-textbox/40'
                          : 'border-editorial-border bg-editorial-bg'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-display text-lg italic text-editorial-accent">
                          {stage.name}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                          {result.status}
                        </span>
                      </div>
                      <div className="text-sm leading-7 text-editorial-ink">
                        {result.status === 'processing' ? (
                          <ProcessingLine />
                        ) : result.status === 'error' ? (
                          <div className="flex items-start gap-2 text-editorial-accent">
                            <AlertTriangle size={14} className="mt-1 shrink-0" />
                            <span className="font-mono text-xs">
                              {result.error || t('errors.unknownError')}
                            </span>
                          </div>
                        ) : (
                          result.content
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="rounded-[24px] border border-editorial-border bg-editorial-bg/90 p-6 shadow-[0_16px_50px_rgba(26,26,26,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('audit.title')}
              </div>
              <div className={`mt-2 font-display text-2xl italic ${QUALITY_TONE_COLOR[chunkTone]}`}>
                {currentQualityLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onReauditChunk(currentChunk.id)}
              disabled={isProcessing || !currentChunk.currentDraft}
              className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink disabled:opacity-30"
            >
              <RefreshCcw size={12} className="inline mr-1" />
              {t('pipeline.reauditChunk')}
            </button>
          </div>

          {currentChunk.judgeResult.status === 'error' && (
            <div className="rounded-2xl border border-editorial-accent/30 bg-editorial-textbox/40 p-4 text-sm text-editorial-accent">
              {currentChunk.judgeResult.error || t('audit.auditFailed')}
            </div>
          )}

          {currentChunk.judgeResult.status !== 'error' &&
            currentChunk.judgeResult.issues.length === 0 && (
              <div className="rounded-2xl border border-editorial-border bg-editorial-bg p-5 text-sm text-editorial-muted">
                {t('audit.noIssues')}
              </div>
            )}

          {currentChunk.judgeResult.issues.length > 0 && (
            <div className="space-y-4">
              {currentChunk.judgeResult.issues.map((issue, index) => (
                <div
                  key={`${issue.type}-${index}`}
                  className="rounded-2xl border border-editorial-border bg-editorial-bg p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                        issue.severity === 'high'
                          ? 'bg-editorial-accent text-white'
                          : 'bg-editorial-ink text-white'
                      }`}
                    >
                      {issue.type}
                    </span>
                  </div>
                  <p className="font-display text-lg italic leading-relaxed text-editorial-ink">
                    {issue.description}
                  </p>
                  {issue.suggestedFix && (
                    <div className="mt-3 border-l-2 border-editorial-accent pl-3 text-sm text-editorial-muted">
                      {t('audit.fix')}: {issue.suggestedFix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

function truncateChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 58) return normalized;
  return `${normalized.slice(0, 55)}...`;
}
