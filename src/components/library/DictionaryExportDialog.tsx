import { reportUiError } from '../../utils/reportUiError';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { exportGlossaryToCsv, exportGlossaryToXlsx, getGlossaryEntries } from '../../services/glossaryService';
import type { Glossary } from '../../types';
import { Dialog, DialogCancelButton, IconButton } from '../ui';

export function DictionaryExportDialog({ glossary, onClose }: { glossary: Glossary | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!glossary || busy) return;
    setBusy(true);
    try {
      const entries = await getGlossaryEntries(glossary.id);
      const safeName = glossary.name.replace(/[/\\:*?"<>|]/g, '_') || 'glossary';
      const path = await save({ title: t('library.exportSaveTitle'), defaultPath: `${safeName}.${format}`,
        filters: [{ name: format === 'csv' ? 'CSV' : 'Excel', extensions: [format] }] });
      if (!path) return;
      if (format === 'csv') await writeTextFile(path, exportGlossaryToCsv(entries));
      else await writeFile(path, await exportGlossaryToXlsx(glossary.name, entries));
      toast.success(t('library.exportSuccess'));
      onClose();
    } catch (error: unknown) { reportUiError(t('library.exportError'), error); }
    finally { setBusy(false); }
  };
  return <Dialog compact closeDisabled={busy} open={glossary !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={t('library.exportGlossary')}
    closeLabel={t('common.close')} widthClassName="max-w-sm" bodyClassName="px-5 py-4"
    footer={<div className="flex justify-end"><DialogCancelButton onClick={onClose} disabled={busy}>{t('common.cancel')}</DialogCancelButton></div>}>
    <div className="flex flex-wrap gap-6">
      {(['csv', 'xlsx'] as const).map((format) => <div key={format} className="flex items-center gap-3">
        <span className="text-sm text-editorial-ink">{format === 'csv' ? 'CSV' : 'Excel'}</span>
        <IconButton onClick={() => void handleExport(format)} disabled={busy} title={`${t('library.exportGlossary')} ${format.toUpperCase()}`}><Download size={14} /></IconButton>
      </div>)}
    </div>
  </Dialog>;
}
