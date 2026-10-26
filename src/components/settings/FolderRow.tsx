import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Spinner } from '../ui';

/**
 * Una cartella fra le impostazioni: che cartella è, il percorso sotto in
 * monospaziato e, a destra, l'icona che apre la scelta di un'altra.
 */
export function FolderRow({ label, path, loading, disabled, chooseLabel, onChoose, children }: {
  label: string;
  path: string | null;
  loading: boolean;
  disabled: boolean;
  chooseLabel: string;
  onChoose: () => void;
  /** Avvisi sotto il percorso (cartella non raggiungibile). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-editorial-ink">{label}</p>
        {loading
          ? <p className="flex items-center gap-2 text-xs text-editorial-muted"><Spinner size={12} />{t('common.loading')}</p>
          : <p className="break-all font-mono text-xs text-editorial-muted">{path}</p>}
        {children}
      </div>
      <IconButton size="sm" onClick={onChoose} disabled={disabled} title={chooseLabel} className="shrink-0">
        <FolderOpen size={14} />
      </IconButton>
    </div>
  );
}
