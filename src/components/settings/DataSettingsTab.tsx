import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DatabaseBackup, HardDrive, Network } from 'lucide-react';
import { getDataDir, chooseDataDirFolder } from '../../services/storageConfigService';
import { errorMessage, logger } from '../../utils/logger';
import { PanelSection, SECTION_SETTING_LIST_CLASSNAME, type TabStripItem } from '../ui';
import { BackupSection } from './BackupSection';
import { CacheSection } from './CacheSection';
import { FolderRow } from './FolderRow';
import { SettingsSubTabs } from './SettingsSubTabs';
import { VaultSection } from './VaultSection';

type DataSubTab = 'location' | 'cache' | 'backup';

/** Dove stanno i dati e come si custodiscono: cartelle e deposito, cache di rete, backup. */
export function DataSettingsTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<DataSubTab>('location');
  const tabs: TabStripItem[] = [
    { id: 'location', label: t('settings.data.location'), icon: <HardDrive size={16} /> },
    { id: 'cache', label: t('settings.cache.title'), icon: <Network size={16} /> },
    { id: 'backup', label: t('settings.backup'), icon: <DatabaseBackup size={16} /> },
  ];
  return (
    <SettingsSubTabs tabId="data" ariaLabel={t('settings.storageTab')} tabs={tabs} activeId={subTab}
      onChange={(id) => setSubTab(id as DataSubTab)}>
      {subTab === 'location' && <><DataFolderSection /><VaultSection /></>}
      {subTab === 'cache' && <CacheSection />}
      {subTab === 'backup' && <BackupSection />}
    </SettingsSubTabs>
  );
}

/** La cartella del database: cambiarla sposta i dati e vale dal riavvio. */
export function DataFolderSection() {
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
    } catch (error: unknown) {
      logger.warn('settings.storage.load_failed', { message: errorMessage(error) });
      toast.error(t('settings.storage.loadFailed'));
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
    } catch (error: unknown) {
      logger.warn('settings.storage.migration_failed', { message: errorMessage(error) });
      toast.error(t('settings.storage.migrationFailed'));
    } finally {
      setMigrating(false);
    }
  };

  return (
    <PanelSection icon={HardDrive} label={t('settings.storage.title')} hint={t('settings.storage.description')}>
      <div className={SECTION_SETTING_LIST_CLASSNAME}>
        <FolderRow
          label={isOverride ? t('settings.storage.customLocation') : t('settings.storage.defaultLocation')}
          path={migrating ? t('settings.storage.migrating') : path}
          loading={loading}
          disabled={loading || migrating}
          chooseLabel={t('settings.storage.changeFolder')}
          onChoose={() => void handleChangeFolder()}
        />
      </div>
    </PanelSection>
  );
}
