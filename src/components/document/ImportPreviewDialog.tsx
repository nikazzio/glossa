import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ImportPreviewDialogProps {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
  markdownAware?: boolean;
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
  onUseChunkingChange: (value: boolean) => void;
  onTargetChunkCountChange: (value: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ImportPreviewDialog({
  fileName,
  text,
  useChunking,
  targetChunkCount,
  markdownAware = false,
  format,
  experimental,
  onUseChunkingChange,
  onTargetChunkCountChange,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const preview = useMemo(
    () => buildImportPreview(text, { useChunking, targetChunkCount, markdownAware, format, experimental }),
    [experimental, format, markdownAware, targetChunkCount, text, useChunking],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      aria-describedby="import-preview-filename"
      ref={trapRef}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">
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
                <span>
                  {t('pipeline.words')}: {preview.stats.words}
                </span>
                <span>
                  {t('pipeline.paragraphs')}: {preview.stats.paragraphs}
                </span>
                <span>{t('document.chunkCounterCompact', { total: preview.chunks.length })}</span>
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

        <div className="flex-1 min-h-0 overflow-hidden px-6 py-6 md:px-8">
          <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto rounded-[22px] border border-editorial-border bg-editorial-textbox/35 p-4 md:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
                {t('files.importSettings')}
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-editorial-border bg-editorial-bg/70 p-3 text-sm text-editorial-ink">
                <input
                  type="checkbox"
                  checked={useChunking}
                  onChange={(event) => onUseChunkingChange(event.target.checked)}
                  className="mt-1 accent-editorial-ink"
                />
                <span className="leading-relaxed">{t('pipeline.autoSegment')}</span>
              </label>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                  {t('pipeline.targetChunks')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={targetChunkCount}
                  onChange={(event) =>
                    onTargetChunkCountChange(Math.max(0, Number(event.target.value) || 0))
                  }
                  disabled={!useChunking}
                  className="w-full rounded-2xl border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none disabled:opacity-50"
                />
                <p className="text-xs leading-relaxed text-editorial-muted">
                  {t('files.importPreviewHint')}
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
                  {t('files.importPreviewChunks')}
                </div>
                <div className="text-xs text-editorial-muted">
                  {preview.chunks.length} {t('pipeline.unitsReady')}
                </div>
              </div>
              <div className="grid max-h-[58vh] min-h-0 gap-4 overflow-y-auto pr-1 custom-scrollbar md:grid-cols-2">
                {preview.chunks.map((chunk) => (
                  <div
                    key={`${chunk.index}-${chunk.characters}`}
                    className="rounded-[22px] border border-editorial-border bg-editorial-bg p-4 md:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                        {t('pipeline.unit')} {chunk.index + 1}
                      </div>
                      <div className="text-[10px] font-mono text-editorial-muted">
                        {chunk.words}w / {chunk.characters}c
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-editorial-ink">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-editorial-border px-6 py-4 md:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
              className="rounded-full bg-editorial-ink px-5 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent"
            >
              {t('files.importConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
