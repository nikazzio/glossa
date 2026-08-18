import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HardDrive } from 'lucide-react';
import { getDataDir, chooseDataDirFolder } from '../../services/storageConfigService';
import { SectionLabel, Spinner, Tooltip } from '../ui';
import { CacheSection } from './CacheSection';
import { VaultSection } from './VaultSection';
import { BackupSection } from './BackupSection';

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
      className="space-y-10"
    >
      <section className="space-y-4">
        <SectionLabel icon={HardDrive} label={t('settings.storage.title')} />

        {/* La riga **è** il comando: cliccarla apre la scelta della cartella. Un
            pulsante separato ripeterebbe la stessa azione occupando spazio.
            Riga piatta con bordi orizzontali, come ogni altro elenco delle
            finestre: i riquadri molto arrotondati qui non si usano. */}
        <Tooltip label={t('settings.storage.changeFolder')} side="top">
          <button
            type="button"
            onClick={() => void handleChangeFolder()}
            disabled={loading || migrating}
            aria-label={t('settings.storage.changeFolder')}
            className="w-full border-y border-editorial-border/70 py-3 text-left transition-colors hover:bg-surface-hover/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
              {isOverride
                ? t('settings.storage.customLocation')
                : t('settings.storage.defaultLocation')}
            </p>
            {loading ? (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-editorial-muted">
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
      </section>

      <VaultSection />

      <CacheSection />

      <BackupSection />
    </div>
  );
}
