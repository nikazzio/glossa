import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HardDrive } from 'lucide-react';
import { getDataDir, setDataDir, pickDataDirFolder } from '../../services/storageConfigService';
import { PillButton, Spinner } from '../ui';

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
    const selected = await pickDataDirFolder();
    if (!selected) return;
    setMigrating(true);
    try {
      await setDataDir(selected);
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
        <div className="flex-1">
          <p className="font-display text-sm text-editorial-ink">{t('settings.storage.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-editorial-muted">
            {t('settings.storage.description')}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-editorial-border bg-surface-panel px-4 py-3">
        <p className="text-xs font-mono text-editorial-muted">
          {isOverride ? t('settings.storage.customLocation') : t('settings.storage.defaultLocation')}
        </p>
        {loading ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-editorial-muted">
            <Spinner size={14} />
            {t('common.loading')}
          </div>
        ) : (
          <p className="mt-1 break-all font-mono text-sm text-editorial-ink">{path}</p>
        )}
      </div>

      <div>
        <PillButton onClick={() => void handleChangeFolder()} disabled={loading || migrating}>
          {migrating ? t('settings.storage.migrating') : t('settings.storage.changeFolder')}
        </PillButton>
        <p className="mt-2 text-xs leading-relaxed text-editorial-muted">
          {t('settings.storage.migrationNote')}
        </p>
      </div>
    </div>
  );
}
