import { Trash2, AlertTriangle, Pencil, RotateCcw, ScanLine, Highlighter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { StatusIndicator, ProcessingLine, CopyButton, MarkdownEditor } from '../common';
import { estimateTextStats, indexPad, recommendChunkCount } from '../../utils';
import { confirm } from '../../stores/confirmStore';
import { useGlossaryHighlight } from '../../hooks/useGlossaryHighlight';
import type { GlossaryEntry, TranslationChunk } from '../../types';

function ChunkSourceText({
  chunk,
  glossary,
  showHighlight,
  isProcessing,
  onUpdate,
}: {
  chunk: TranslationChunk;
  glossary: GlossaryEntry[];
  showHighlight: boolean;
  isProcessing: boolean;
  onUpdate: (text: string) => void;
}) {
  const { html } = useGlossaryHighlight(chunk.originalText, glossary, 'source');
  return (
    <MarkdownEditor
      value={chunk.originalText}
      onChange={onUpdate}
      markdownEnabled={usePipelineStore.getState().config.markdownAware === true}
      disabled={isProcessing}
      readOnly={chunk.status === 'completed'}
      minHeightClassName="min-h-[120px]"
      textClassName="border border-editorial-border bg-editorial-textbox/60 p-4 text-xs font-mono leading-relaxed text-editorial-ink"
      previewClassName="min-h-[120px] text-xs leading-relaxed text-editorial-ink"
      highlightHtml={showHighlight && chunk.status !== 'completed' ? html : null}
    />
  );
}

function ChunkDraftText({
  chunk,
  glossary,
  showHighlight,
  onUpdate,
  placeholder,
}: {
  chunk: TranslationChunk;
  glossary: GlossaryEntry[];
  showHighlight: boolean;
  onUpdate: (text: string) => void;
  placeholder: string;
}) {
  const { html } = useGlossaryHighlight(chunk.currentDraft ?? '', glossary, 'translation');
  return (
    <MarkdownEditor
      value={chunk.currentDraft || ''}
      onChange={onUpdate}
      markdownEnabled={usePipelineStore.getState().config.markdownAware === true}
      minHeightClassName="min-h-[100px]"
      textClassName="border border-editorial-border bg-editorial-bg/50 p-4 text-sm font-sans leading-relaxed text-editorial-ink"
      previewClassName="min-h-[100px] text-sm leading-relaxed text-editorial-ink"
      placeholder={placeholder}
      highlightHtml={showHighlight ? html : null}
    />
  );
}

interface ProductionStreamProps {
  onRetranslateChunk: (chunkId: string) => void;
  onReauditChunk: (chunkId: string) => void;
}

export function ProductionStream({
  onRetranslateChunk,
  onReauditChunk,
}: ProductionStreamProps) {
  const {
    inputText,
    setInputText,
    config,
    setConfig,
  } = usePipelineStore();
  const {
    chunks,
    isProcessing,
    generateChunks,
    loadDocument,
    clearChunks,
    updateChunkDraft,
    updateChunkOriginalText,
    splitChunk,
    mergeChunkWithNext,
    unlockChunkForEdit,
  } = useChunksStore();
  const { glossaryHighlightEnabled, setGlossaryHighlightEnabled } = useUiStore();
  const { t } = useTranslation();
  const stats = estimateTextStats(inputText);
  const recommendedChunks = recommendChunkCount(inputText);
  const hasGlossary = config.glossary.length > 0;
  const showHighlight = glossaryHighlightEnabled && hasGlossary;

  const handleClearStream = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmClearTitle'),
      message: t('pipeline.confirmClearMessage'),
      confirmLabel: t('pipeline.clearStream'),
      danger: true,
    });
    if (ok) clearChunks();
  };

  const handleUnlockSource = async (chunkId: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmUnlockTitle'),
      message: t('pipeline.confirmUnlockMessage'),
      confirmLabel: t('pipeline.unlockSource'),
      danger: true,
    });
    if (ok) unlockChunkForEdit(chunkId);
  };

  return (
    <section className="col-span-1 md:col-span-6 bg-editorial-bg p-8 overflow-y-auto min-h-0 h-full border-r border-editorial-border custom-scrollbar">
      <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-10">
        <h2 className="font-display text-sm uppercase tracking-wider inline-block">{t('pipeline.productionStream')}</h2>
        <div className="flex items-center gap-3">
          {hasGlossary && (
            <button
              type="button"
              onClick={() => setGlossaryHighlightEnabled(!glossaryHighlightEnabled)}
              aria-pressed={glossaryHighlightEnabled}
              title={t('library.glossaryHighlightToggle')}
              className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                glossaryHighlightEnabled ? 'text-editorial-ink' : 'text-editorial-muted hover:text-editorial-ink'
              }`}
            >
              <Highlighter size={12} />
              {t('library.glossaryHighlightToggle')}
            </button>
          )}
          {chunks.length > 0 && (
            <button
              onClick={handleClearStream}
              disabled={isProcessing}
              title={t('pipeline.clearStream')}
              className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent transition-colors flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Trash2 size={12} /> {t('pipeline.clearStream')}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-16">
        {!chunks.length && (
          <div className="space-y-8 max-w-2xl mx-auto py-12">
            <div className="space-y-4">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                {t('pipeline.inputContent')}
              </label>
              <MarkdownEditor
                value={inputText}
                onChange={setInputText}
                markdownEnabled={config.markdownAware === true}
                placeholder={t('pipeline.inputPlaceholder')}
                minHeightClassName="min-h-[400px]"
                textClassName="border-none bg-editorial-textbox p-8 text-sm font-mono leading-relaxed text-editorial-ink"
                previewClassName="min-h-[400px] text-sm leading-relaxed text-editorial-ink"
              />
              <div className="grid grid-cols-3 gap-3 text-[10px] font-mono text-editorial-muted">
                <span>{t('pipeline.words')}: {stats.words}</span>
                <span>{t('pipeline.paragraphs')}: {stats.paragraphs}</span>
                <span>{t('pipeline.recommendedChunks')}: {recommendedChunks || '-'}</span>
              </div>
              {config.useChunking !== false && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center bg-editorial-textbox/50 border border-editorial-border p-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                    {t('pipeline.targetChunks')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={config.targetChunkCount || 0}
                    onChange={(e) => setConfig((prev) => ({
                      ...prev,
                      targetChunkCount: Math.max(0, Number(e.target.value) || 0),
                    }))}
                    className="w-24 bg-editorial-bg border border-editorial-border px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    aria-label={t('pipeline.targetChunks')}
                  />
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, targetChunkCount: recommendedChunks }))}
                    disabled={recommendedChunks === 0}
                    className="text-[10px] font-bold uppercase tracking-widest text-editorial-accent disabled:text-editorial-muted disabled:opacity-50"
                  >
                    {t('pipeline.useRecommendation')}
                  </button>
                  <span className="text-[10px] text-editorial-muted">
                    {t('pipeline.zeroMeansAuto')}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={generateChunks}
              className="w-full bg-editorial-ink text-white px-6 py-5 text-[11px] font-bold uppercase tracking-[3px] hover:shadow-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
            >
              {t('pipeline.stageContent')}
            </button>
            {inputText.trim() && (
              <button
                type="button"
                onClick={() =>
                  loadDocument(inputText, {
                    useChunking: config.useChunking,
                    targetChunkCount: config.targetChunkCount,
                    markdownAware: config.markdownAware,
                  })
                }
                className="w-full rounded-full border border-editorial-border px-6 py-4 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
              >
                {t('document.openInReader')}
              </button>
            )}
          </div>
        )}

        {chunks.length > 0 && (
          <div className="border border-editorial-border bg-editorial-textbox/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                {t('pipeline.chunkPreview')}
              </div>
              <div className="text-xs font-mono text-editorial-ink">
                {chunks.length} {t('pipeline.unitsReady')}
              </div>
            </div>
            <div className="text-[10px] text-editorial-muted leading-relaxed max-w-md">
              {t('pipeline.chunkPreviewHint')}
            </div>
            <button
              type="button"
              onClick={() =>
                loadDocument(inputText, {
                  useChunking: config.useChunking,
                  targetChunkCount: config.targetChunkCount,
                  markdownAware: config.markdownAware,
                })
              }
              className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
            >
              {t('document.openInReader')}
            </button>
          </div>
        )}

        {chunks.map((chunk, idx) => (
          <div
            key={chunk.id}
            className="space-y-8 border-b border-editorial-border pb-16 last:border-0 last:pb-0 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-display italic text-2xl text-editorial-accent tracking-tighter">
                  {t('pipeline.unit')} {indexPad(idx + 1)}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted border border-editorial-border px-2 py-1">
                  {t(`pipeline.chunkStatus.${chunk.status}`)}
                </span>
              </div>
              <div className="flex gap-4">
                {config.stages
                  .filter((s) => s.enabled)
                  .map((s, si) => (
                    <StatusIndicator
                      key={s.id}
                      status={chunk.stageResults[s.id]?.status || 'idle'}
                      label={indexPad(si + 1)}
                    />
                  ))}
                <StatusIndicator status={chunk.judgeResult.status} label="Audit" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                    {t('pipeline.originalSource')}
                  </label>
                  <div
                    role="toolbar"
                    aria-label={t('pipeline.chunkActions')}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <button
                      type="button"
                      onClick={() => onRetranslateChunk(chunk.id)}
                      disabled={isProcessing || chunk.originalText.trim().length === 0}
                      title={t('pipeline.retranslateChunk')}
                      className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent flex items-center gap-1"
                    >
                      <RotateCcw size={11} /> {t('pipeline.retranslateChunk')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReauditChunk(chunk.id)}
                      disabled={isProcessing || !chunk.currentDraft}
                      title={chunk.currentDraft ? t('pipeline.reauditChunk') : t('pipeline.auditSkippedNoDraft')}
                      className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent flex items-center gap-1"
                    >
                      <ScanLine size={11} /> {t('pipeline.reauditChunk')}
                    </button>
                    {chunk.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => handleUnlockSource(chunk.id)}
                        disabled={isProcessing}
                        className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent flex items-center gap-1"
                        title={t('pipeline.unlockSourceHint')}
                      >
                        <Pencil size={11} /> {t('pipeline.unlockSource')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => splitChunk(chunk.id)}
                          disabled={isProcessing || chunk.originalText.trim().length < 2}
                          className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        >
                          {t('pipeline.splitChunk')}
                        </button>
                        <button
                          type="button"
                          onClick={() => mergeChunkWithNext(chunk.id)}
                          disabled={
                            isProcessing
                            || idx === chunks.length - 1
                            || chunks[idx + 1]?.status === 'completed'
                            || chunks[idx + 1]?.status === 'processing'
                          }
                          className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        >
                          {t('pipeline.mergeNext')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <ChunkSourceText
                  chunk={chunk}
                  glossary={config.glossary}
                  showHighlight={showHighlight}
                  isProcessing={isProcessing}
                  onUpdate={(text) => updateChunkOriginalText(chunk.id, text)}
                />
              </div>

              {config.stages
                .filter((s) => s.enabled)
                .map((stage) => {
                  const result = chunk.stageResults[stage.id];
                  if (!result || result.status === 'idle') return null;

                  return (
                    <div
                      key={stage.id}
                      className={`relative border p-6 bg-editorial-bg/10 animate-in fade-in slide-in-from-left-2 duration-300 ${
                        result.status === 'error'
                          ? 'border-editorial-accent/30 bg-editorial-textbox/30'
                          : 'border-editorial-border'
                      }`}
                    >
                      <span className="absolute -top-3 left-6 bg-editorial-bg border border-editorial-border px-2 font-display italic text-[10px]">
                        {stage.name}
                      </span>
                      <div className="text-sm leading-relaxed overflow-hidden">
                        {result.status === 'processing' ? (
                          <ProcessingLine />
                        ) : result.status === 'error' ? (
                          <div className="flex items-start gap-2 text-editorial-accent">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span className="text-xs font-mono">{result.error || t('errors.unknownError')}</span>
                          </div>
                        ) : (
                          <div className="text-editorial-ink">{result.content}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Editable Candidate Translation */}
              <div className="space-y-3 mt-8">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                    {t('pipeline.candidateTranslation')}
                  </label>
                  <CopyButton text={chunk.currentDraft || ''} />
                </div>
                <ChunkDraftText
                  chunk={chunk}
                  glossary={config.glossary}
                  showHighlight={showHighlight}
                  onUpdate={(text) => updateChunkDraft(chunk.id, text)}
                  placeholder={t('pipeline.candidatePlaceholder')}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
