import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildImportPreview } from '../../utils/documentWorkflow';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ImportPreviewDialogProps {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
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
  onUseChunkingChange,
  onTargetChunkCountChange,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const preview = useMemo(
    () => buildImportPreview(text, { useChunking, targetChunkCount }),
    [targetChunkCount, text, useChunking],
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
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-editorial-border bg-editorial-bg p-6 shadow-[0_24px_80px_rgba(26,26,26,0.2)] md:p-8">
        <div className="flex flex-col gap-3 border-b border-editorial-border pb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('files.importPreviewLabel')}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2
                id="import-preview-title"
                className="font-display text-3xl italic tracking-tight text-editorial-ink"
              >
                {t('files.importPreviewTitle')}
              </h2>
              <p
                id="import-preview-filename"
                className="mt-2 text-sm text-editorial-muted"
              >
                {fileName}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px] font-mono text-editorial-muted">
              <span>{t('pipeline.words')}: {preview.stats.words}</span>
              <span>{t('pipeline.paragraphs')}: {preview.stats.paragraphs}</span>
              <span>{t('document.chunkCounterCompact', { total: preview.chunks.length })}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-[22px] border border-editorial-border bg-editorial-textbox/35 p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('files.importSettings')}
            </div>
            <label className="flex items-center gap-3 text-sm text-editorial-ink">
              <input
                type="checkbox"
                checked={useChunking}
                onChange={(event) => onUseChunkingChange(event.target.checked)}
                className="accent-editorial-ink"
              />
              {t('pipeline.autoSegment')}
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

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('files.importPreviewChunks')}
              </div>
              <div className="text-xs text-editorial-muted">
                {preview.chunks.length} {t('pipeline.unitsReady')}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {preview.chunks.map((chunk) => (
                <div
                  key={`${chunk.index}-${chunk.characters}`}
                  className="rounded-[22px] border border-editorial-border bg-editorial-bg p-5"
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

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-editorial-border pt-5 sm:flex-row sm:justify-end">
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
  );
}
