import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HardDrive } from 'lucide-react';
import { getDataDir, chooseDataDirFolder } from '../../services/storageConfigService';
import { Spinner, Tooltip } from '../ui';
import { VaultSection } from './VaultSection';

export function StorageSettingsTab() {
  const { t } = useTranslation();
  const [path, setPath] = useState<string | null>(null);
  const [isOverride, setIsOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getDataDir();
      setPath(status.path);
      setIsOverride(status.isOverride);
    } catch (err: unknown) {
      toast.error(t('settings.storage.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleChangeFolder = async () => {
    setMigrating(true);
    try {
      const moved = await chooseDataDirFolder();
      // `null` significa che l'utente ha chiuso la finestra: non è un errore.
      if (!moved) return;
      toast.success(t('settings.storage.migrationSucceeded'));
      await refresh();
    } catch (err: unknown) {
      toast.error(t('settings.storage.migrationFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div
      id="settings-panel-storage"
      role="tabpanel"
      aria-labelledby="settings-tab-storage"
      className="flex flex-col gap-6"
    >
      <div className="flex items-start gap-3">
        <HardDrive size={16} className="mt-0.5 shrink-0 text-editorial-muted" />
        <p className="flex-1 text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
          {t('settings.storage.title')}
        </p>
      </div>

      {/* Come per il deposito: la scheda è il comando. */}
      <Tooltip label={t('settings.storage.changeFolder')} side="top">
        <button
          type="button"
          onClick={() => void handleChangeFolder()}
          disabled={loading || migrating}
          aria-label={t('settings.storage.changeFolder')}
          className="w-full rounded-2xl border border-editorial-border bg-surface-panel px-4 py-3 text-left transition-colors hover:border-editorial-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
        <p className="text-xs font-mono text-editorial-muted">
          {isOverride ? t('settings.storage.customLocation') : t('settings.storage.defaultLocation')}
        </p>
        {loading ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-editorial-muted">
            <Spinner size={14} />
            {t('common.loading')}
          </div>
        ) : (
          <p className="mt-1 break-all font-mono text-sm text-editorial-ink">
            {migrating ? t('settings.storage.migrating') : path}
          </p>
        )}
        </button>
      </Tooltip>

      <VaultSection />
    </div>
  );
}
