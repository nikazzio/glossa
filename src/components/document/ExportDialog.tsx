import { AlertTriangle, Download, FileText, Rows3 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogConfirmButton, DialogCancelButton, SectionLabel } from '../ui';
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
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [separatorKey, setSeparatorKey] = useState<'blank' | 'hr' | 'asterisk'>('blank');

  const missingCount = chunks.filter((c) => !c.translationDisplayText.trim()).length;
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
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      eyebrow={t('header.exportLabel')}
      title={t('files.exportDialogTitle')}
      icon={<Download size={20} />}
      closeLabel={t('common.close')}
      widthClassName="max-w-md"
      bodyClassName="px-6 py-5"
      footer={
        <div className="flex items-center justify-end gap-3">
          <DialogCancelButton onClick={onCancel}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => onConfirm(format, separatorValue, markdownAware)}>
            {t('files.exportConfirm')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-6">
          {/* Warning chunk mancanti */}
          {missingCount > 0 && (
            <div className="flex items-start gap-3 border-l-4 border-l-editorial-warning border-y border-editorial-warning/40 bg-editorial-warning/8 px-4 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-editorial-warning" />
              <p className="text-sm leading-relaxed text-editorial-ink">
                {format === 'bilingual'
                  ? t('files.exportMissingBilingual', { count: missingCount })
                  : t('files.exportMissingChunks', { count: missingCount })}
              </p>
            </div>
          )}

          {/* Formato */}
          <div className="border-y border-editorial-border/70 bg-editorial-bg/45 px-4 py-4">
            <div className="mb-2">
              <SectionLabel icon={FileText} label={t('files.exportFormat')} />
            </div>
            <div className="space-y-1">
              {formats.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  className={`flex w-full items-center justify-between border-l-4 px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    format === key
                      ? 'border-l-editorial-accent bg-editorial-accent/8 text-editorial-accent'
                      : 'border-l-transparent text-editorial-ink hover:border-l-editorial-border hover:bg-editorial-textbox/25 hover:text-editorial-accent'
                  }`}
                >
                  <span>{label}</span>
                  {format === key ? <span className="h-1.5 w-1.5 rounded-full bg-editorial-accent" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          </div>

          {/* Separatore */}
          {showSeparator && (
            <div className="border-y border-editorial-border/70 bg-editorial-bg/45 px-4 py-4">
              <div className="mb-2">
                <SectionLabel icon={Rows3} label={t('files.exportSeparator')} />
              </div>
              <div className="space-y-1">
                {SEPARATOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSeparatorKey(opt.key)}
                    className={`flex w-full items-center justify-between gap-3 border-l-4 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                      separatorKey === opt.key
                        ? 'border-l-editorial-accent bg-editorial-accent/8 text-editorial-accent'
                        : 'border-l-transparent text-editorial-ink hover:border-l-editorial-border hover:bg-editorial-textbox/25 hover:text-editorial-accent'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-sm">{t(`files.exportSeparator_${opt.key}`)}</span>
                      <span className="font-mono text-xs text-editorial-muted/70">
                        {opt.key === 'blank' ? '↵↵' : opt.key === 'hr' ? '---' : '* * *'}
                      </span>
                    </span>
                    {separatorKey === opt.key ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
    </Dialog>
  );
}
