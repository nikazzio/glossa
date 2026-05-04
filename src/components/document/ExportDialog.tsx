import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { TranslationChunk } from '../../types';

export type ExportFormat = 'txt' | 'md' | 'html' | 'docx' | 'bilingual';

const SEPARATOR_OPTIONS = [
  { key: 'blank', value: '\n\n' },
  { key: 'hr', value: '\n\n---\n\n' },
  { key: 'asterisk', value: '\n\n* * *\n\n' },
] as const;

const FORMAT_SUPPORTS_SEPARATOR: Record<ExportFormat, boolean> = {
  txt: true,
  md: true,
  html: false,
  docx: false,
  bilingual: false,
};

interface ExportDialogProps {
  chunks: TranslationChunk[];
  markdownAware: boolean;
  onConfirm: (format: ExportFormat, separator: string, markdownAware: boolean) => void;
  onCancel: () => void;
}

export function ExportDialog({ chunks, markdownAware, onConfirm, onCancel }: ExportDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onCancel);
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [separatorKey, setSeparatorKey] = useState<'blank' | 'hr' | 'asterisk'>('blank');

  const missingCount = chunks.filter((c) => !c.currentDraft?.trim()).length;
  const separatorValue = SEPARATOR_OPTIONS.find((s) => s.key === separatorKey)?.value ?? '\n\n';
  const showSeparator = FORMAT_SUPPORTS_SEPARATOR[format];

  const formats: { key: ExportFormat; label: string }[] = [
    { key: 'txt', label: t('files.exportTxt') },
    { key: 'md', label: t('files.exportMarkdown') },
    { key: 'html', label: t('files.exportHtml') },
    { key: 'docx', label: t('files.exportDocx') },
    { key: 'bilingual', label: t('files.exportBilingual') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      ref={trapRef}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">
        {/* Header */}
        <div className="shrink-0 border-b border-editorial-border px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('header.exportLabel')}
              </div>
              <h3
                id="export-dialog-title"
                className="mt-1 font-display text-2xl italic tracking-tight text-editorial-ink"
              >
                {t('files.exportDialogTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('common.close')}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">
          {/* Warning chunk mancanti */}
          {missingCount > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-editorial-warning/50 bg-editorial-warning/8 px-4 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-editorial-warning" />
              <p className="text-sm leading-relaxed text-editorial-ink">
                {format === 'bilingual'
                  ? t('files.exportMissingBilingual', { count: missingCount })
                  : t('files.exportMissingChunks', { count: missingCount })}
              </p>
            </div>
          )}

          {/* Formato */}
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
              {t('files.exportFormat')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {formats.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    format === key
                      ? 'border-editorial-ink bg-editorial-ink text-white'
                      : 'border-editorial-border bg-editorial-bg text-editorial-ink hover:border-editorial-ink/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Separatore */}
          {showSeparator && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                {t('files.exportSeparator')}
              </div>
              <div className="space-y-2">
                {SEPARATOR_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors ${
                      separatorKey === opt.key
                        ? 'border-editorial-ink bg-editorial-ink/5'
                        : 'border-editorial-border hover:border-editorial-ink/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="separator"
                      value={opt.key}
                      checked={separatorKey === opt.key}
                      onChange={() => setSeparatorKey(opt.key)}
                      className="accent-editorial-ink"
                    />
                    <span className="flex-1 text-sm text-editorial-ink">
                      {t(`files.exportSeparator_${opt.key}`)}
                    </span>
                    <span className="font-mono text-[10px] text-editorial-muted/70">
                      {opt.key === 'blank' ? '↵↵' : opt.key === 'hr' ? '---' : '* * *'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 border-t border-editorial-border px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(format, separatorValue, markdownAware)}
            className="rounded-full bg-editorial-ink px-5 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            {t('files.exportConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
