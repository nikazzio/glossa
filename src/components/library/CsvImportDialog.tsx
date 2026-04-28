import { useState } from 'react';
import { Upload, X, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import Papa from 'papaparse';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  onImport: (csvText: string, strategy: 'replace' | 'merge') => Promise<void>;
  onClose: () => void;
}

type Step = 'pick' | 'preview' | 'confirm';
type MergeStrategy = 'replace' | 'merge';

const PREVIEW_ROWS = 5;

export function CsvImportDialog({ onImport, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('pick');
  const [csvText, setCsvText] = useState('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<MergeStrategy>('merge');
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap(true, onClose);

  const handlePickFile = async () => {
    setError(null);
    const path = await open({
      title: t('library.csvPickTitle'),
      filters: [{ name: 'CSV/TSV', extensions: ['csv', 'tsv', 'txt'] }],
      multiple: false,
    });
    if (!path) return;
    try {
      const text = await readTextFile(path as string);
      const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
      if (!result.data || result.data.length < 2) {
        setError(t('library.csvEmptyError'));
        return;
      }
      const [headers, ...rows] = result.data as string[][];
      setPreviewHeaders(headers);
      setPreviewRows(rows.slice(0, PREVIEW_ROWS));
      setTotalRows(rows.length);
      setCsvText(text);
      setStep('preview');
    } catch (err: any) {
      setError(err?.message ?? t('library.csvReadError'));
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onImport(csvText, strategy);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? t('library.csvImportError'));
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        ref={trapRef}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative bg-editorial-bg w-full max-w-lg p-8 shadow-2xl border border-editorial-border"
        >
          <button
            onClick={onClose}
            title={t('settings.close')}
            className="absolute top-5 right-5 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('settings.close')}
          >
            <X size={18} />
          </button>

          <h3 id="csv-import-title" className="font-display text-xl italic tracking-tight mb-6 flex items-center gap-2">
            <Upload size={20} className="text-editorial-accent" />
            {t('library.csvImportTitle')}
          </h3>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded border border-editorial-warning/60 bg-editorial-warning/10 p-3 text-[11px] text-editorial-warning">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-[12px] text-editorial-muted leading-relaxed">
                {t('library.csvPickDesc')}
              </p>
              <button
                onClick={handlePickFile}
                className="w-full rounded border border-dashed border-editorial-border/60 py-6 text-[11px] font-bold uppercase tracking-widest text-editorial-muted hover:border-editorial-accent hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {t('library.csvPickButton')}
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-[11px] text-editorial-muted">
                {t('library.csvPreviewDesc', { count: totalRows })}
              </p>
              <div className="overflow-x-auto border border-editorial-border/40 rounded">
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-editorial-textbox/30">
                    <tr>
                      {previewHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-editorial-muted font-bold uppercase tracking-wider truncate max-w-[120px]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-t border-editorial-border/20">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1.5 text-editorial-ink/80 truncate max-w-[120px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRows > PREVIEW_ROWS && (
                <p className="text-[10px] text-editorial-muted/60 text-center">
                  + {totalRows - PREVIEW_ROWS} {t('library.csvMoreRows')}
                </p>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('library.csvStrategy')}
                </p>
                {(['merge', 'replace'] as MergeStrategy[]).map((s) => (
                  <label key={s} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value={s}
                      checked={strategy === s}
                      onChange={() => setStrategy(s)}
                      className="mt-0.5"
                    />
                    <span className="text-[11px] text-editorial-ink">
                      <span className="font-bold">{t(`library.csvStrategy_${s}`)}</span>
                      {' — '}
                      {t(`library.csvStrategy_${s}_desc`)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => { setStep('pick'); setError(null); }}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-editorial-ink text-white hover:bg-editorial-ink/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  <Check size={13} />
                  {loading ? t('common.loading') : t('library.csvConfirm')}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
