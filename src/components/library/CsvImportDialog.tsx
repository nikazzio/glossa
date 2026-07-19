import { useState } from 'react';
import { Upload, Check, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import Papa from 'papaparse';
import { Dialog, DialogConfirmButton, DialogCancelButton, Select } from '../ui';
import { useLibraryStore } from '../../stores/libraryStore';
import {
  importEntriesFromCsv,
  importEntriesFromXlsx,
  readXlsxSheet,
  type XlsxColumnMap,
} from '../../services/glossaryService';

interface Props {
  workspaceId: string | null;
  onImported: (glossaryId: string, count: number) => void;
  onClose: () => void;
}

type FileKind = 'csv' | 'xlsx';
type Step = 'pick' | 'map' | 'preview';

const PREVIEW_ROWS = 5;
const TERM_KEYS = ['term', 'source', 'from', 'termine', 'sorgente'];
const TRANS_KEYS = ['translation', 'target', 'to', 'traduzione', 'destinazione'];
const NOTES_KEYS = ['notes', 'note'];

function autoDetect(headers: string[]): Partial<XlsxColumnMap> {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (keys: string[]) => headers[lower.findIndex((l) => keys.includes(l))] ?? undefined;
  return { termKey: find(TERM_KEYS), translationKey: find(TRANS_KEYS), notesKey: find(NOTES_KEYS) };
}

function deriveNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.(csv|tsv|txt|xlsx|xls)$/i, '');
}

export function CsvImportDialog({ workspaceId, onImported, onClose }: Props) {
  const { t } = useTranslation();
  const createGlossary = useLibraryStore((s) => s.createGlossary);
  const [step, setStep] = useState<Step>('pick');
  const [fileKind, setFileKind] = useState<FileKind>('csv');
  const [pickedPath, setPickedPath] = useState('');
  const [csvText, setCsvText] = useState('');
  const [xlsxRows, setXlsxRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<XlsxColumnMap>({ termKey: '', translationKey: '' });
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickFile = async () => {
    setError(null);
    const path = await open({
      title: t('library.importPickTitle'),
      filters: [{ name: 'CSV / Excel', extensions: ['csv', 'tsv', 'txt', 'xlsx', 'xls'] }],
      multiple: false,
    });
    if (!path) return;
    setPickedPath(path as string);
    const ext = (path as string).split('.').pop()?.toLowerCase() ?? '';
    const isXlsx = ext === 'xlsx' || ext === 'xls';
    try {
      if (isXlsx) {
        const bytes = await readFile(path as string);
        const { headers: xlsxHeaders, rows } = await readXlsxSheet(bytes);
        if (rows.length === 0) { setError(t('library.csvEmptyError')); return; }
        setFileKind('xlsx');
        setXlsxRows(rows);
        setHeaders(xlsxHeaders);
        setTotalRows(rows.length);
        const detected = autoDetect(xlsxHeaders);
        const map: XlsxColumnMap = {
          termKey: detected.termKey ?? xlsxHeaders[0] ?? '',
          translationKey: detected.translationKey ?? xlsxHeaders[1] ?? '',
          notesKey: detected.notesKey,
        };
        setColumnMap(map);
        if (detected.termKey && detected.translationKey) {
          // Auto-detected — go straight to preview
          buildXlsxPreview(rows, xlsxHeaders, map);
          setStep('preview');
        } else {
          setStep('map');
        }
      } else {
        const text = await readTextFile(path as string);
        const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
        if (!result.data || result.data.length < 2) { setError(t('library.csvEmptyError')); return; }
        const [hdrs, ...rows] = result.data as string[][];
        setFileKind('csv');
        setCsvText(text);
        setPreviewHeaders(hdrs);
        setPreviewRows(rows.slice(0, PREVIEW_ROWS));
        setTotalRows(rows.length);
        setStep('preview');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('library.csvReadError'));
    }
  };

  const buildXlsxPreview = (
    rows: Record<string, string>[],
    _hdrs: string[],
    map: XlsxColumnMap,
  ) => {
    const cols = [map.termKey, map.translationKey, ...(map.notesKey ? [map.notesKey] : [])];
    setPreviewHeaders(cols.filter(Boolean));
    setPreviewRows(
      rows.slice(0, PREVIEW_ROWS).map((row) => cols.filter(Boolean).map((c) => String(row[c] ?? ''))),
    );
  };

  const handleMapContinue = () => {
    if (!columnMap.termKey || !columnMap.translationKey) {
      setError(t('library.xlsxMapRequired'));
      return;
    }
    setError(null);
    buildXlsxPreview(xlsxRows, headers, columnMap);
    setStep('preview');
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const name = deriveNameFromPath(pickedPath) || t('library.importTitle');
      const glossaryId = await createGlossary(name, undefined, undefined, undefined, workspaceId);
      let count: number;
      if (fileKind === 'xlsx') {
        count = await importEntriesFromXlsx(glossaryId, xlsxRows, columnMap, 'merge');
      } else {
        count = await importEntriesFromCsv(glossaryId, csvText, 'merge');
      }
      onImported(glossaryId, count);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('library.csvImportError'));
      setLoading(false);
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 'preview' && fileKind === 'xlsx') {
      setStep('map');
    } else {
      setStep('pick');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('library.importTitle')}
      icon={<Upload size={20} />}
      closeLabel={t('settings.close')}
      widthClassName="max-w-lg"
    >
      <div>
          {error && (
            <div className="mb-4 flex items-start gap-2 border-y border-editorial-warning/60 bg-editorial-warning/10 py-3 text-xs text-editorial-warning">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-xs text-editorial-muted leading-relaxed">
                {t('library.importPickDesc')}
              </p>
              <button
                onClick={handlePickFile}
                className="w-full border-y border-dashed border-editorial-border/60 py-6 text-xs font-bold uppercase tracking-[0.14em] text-editorial-muted hover:border-editorial-accent hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {t('library.importPickButton')}
              </button>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-xs text-editorial-muted leading-relaxed">
                {t('library.xlsxMapDesc')}
              </p>
              <div className="space-y-3">
                {([
                  { key: 'termKey', label: t('library.xlsxTermCol'), required: true },
                  { key: 'translationKey', label: t('library.xlsxTransCol'), required: true },
                  { key: 'notesKey', label: t('library.xlsxNotesCol'), required: false },
                ] as const).map(({ key, label, required }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label htmlFor={`csv-map-${key}`} className="w-36 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
                      {label}
                    </label>
                    <Select
                      id={`csv-map-${key}`}
                      value={columnMap[key] ?? ''}
                      onChange={(value) => setColumnMap((m) => ({ ...m, [key]: value || undefined }))}
                      className="flex-1"
                      options={[
                        ...(!required ? [{ value: '', label: t('library.xlsxNoneOption') }] : []),
                        ...headers.map((h) => ({ value: h, label: h })),
                      ]}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <DialogCancelButton onClick={() => { setStep('pick'); setError(null); }}>
                  {t('common.back')}
                </DialogCancelButton>
                <DialogConfirmButton onClick={handleMapContinue}>
                  {t('common.next')}
                </DialogConfirmButton>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-xs text-editorial-muted">
                {t('library.csvPreviewDesc', { count: totalRows })}
              </p>
              <div className="overflow-x-auto border-y border-editorial-border/70">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-editorial-textbox/30">
                    <tr>
                      {previewHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-editorial-muted font-bold uppercase tracking-[0.14em] truncate max-w-[120px]">
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
                <p className="text-xs text-editorial-muted/60 text-center">
                  + {totalRows - PREVIEW_ROWS} {t('library.csvMoreRows')}
                </p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <DialogCancelButton onClick={goBack}>{t('common.back')}</DialogCancelButton>
                <DialogConfirmButton onClick={handleConfirm} disabled={loading}>
                  <Check size={13} />
                  {loading ? t('common.loading') : t('library.csvConfirm')}
                </DialogConfirmButton>
              </div>
            </div>
          )}
      </div>
    </Dialog>
  );
}
