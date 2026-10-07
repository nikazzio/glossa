import { useState } from 'react';
import { BookOpen, Database, FileText, Languages, LibraryBig, ListChecks, Palette, Server, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore, type SettingsTab } from '../../stores/uiStore';
import { Dialog, DialogCancelButton, TabStrip, type TabStripItem } from '../ui';
import type { NetworkProfileDraft } from '../../hooks/useLibraryNetworkSettings';
import { AppearanceSettingsTab } from './AppearanceSettingsTab';
import { DataSettingsTab } from './DataSettingsTab';
import { JobsSettingsTab } from './JobsSettingsTab';
import { LanguagesSettingsTab } from './LanguagesSettingsTab';
import { LibrarySettingsTab } from './LibrarySettingsTab';
import { ModelsSettingsTab } from './ModelsSettingsTab';
import { TranscriptionsSettingsTab } from './TranscriptionsSettingsTab';
import { TranslationsSettingsTab } from './TranslationsSettingsTab';

/**
 * Impostazioni generali, valide per tutta l'app (quelle di un workspace stanno
 * nella sua finestra). Ordine: l'aspetto, le aree nell'ordine del lavoro, poi
 * servizi e sistema.
 */
export function SettingsModal() {
  const { showSettings, setShowSettings, settingsTab: activeTab, setSettingsTab: setActiveTab } = useUiStore();
  const { t } = useTranslation();
  // Il ritmo che si sta scrivendo vive qui e non nella scheda: la scheda si
  // smonta cambiando linguetta, e un profilo digitato a metà spariva in silenzio.
  const [networkDraft, setNetworkDraft] = useState<NetworkProfileDraft | null>(null);

  const tabs: TabStripItem[] = [
    { id: 'appearance', icon: <Palette size={14} />, label: t('settings.appearanceTab') },
    { id: 'library', icon: <LibraryBig size={14} />, label: t('areas.library.title') },
    { id: 'transcriptions', icon: <BookOpen size={14} />, label: t('areas.transcriptions.title') },
    { id: 'translations', icon: <FileText size={14} />, label: t('areas.translations.title') },
    { id: 'models', icon: <Server size={14} />, label: t('settings.modelsTab') },
    { id: 'languages', icon: <Languages size={14} />, label: t('settings.languagesTab') },
    { id: 'data', icon: <Database size={14} />, label: t('settings.storageTab') },
    { id: 'jobs', icon: <ListChecks size={14} />, label: t('settings.jobsTab') },
  ];

  const tabBar = (
    <div className="flex items-center gap-2">
      <TabStrip tabs={tabs} activeId={activeTab} onChange={(id) => setActiveTab(id as SettingsTab)}
        ariaLabel={t('settings.panelTitle')} idPrefix="settings" />
      <span className="mx-1 h-4 w-px shrink-0 self-center bg-rule" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {tabs.find((tab) => tab.id === activeTab)?.label}
      </span>
    </div>
  );

  return (
    <Dialog
      open={showSettings}
      onOpenChange={(open) => {
        if (!open) setShowSettings(false);
      }}
      title={t('settings.panelTitle')}
      closeLabel={t('settings.close')}
      eyebrow={t('settings.eyebrow')}
      icon={<SlidersHorizontal size={20} />}
      widthClassName="max-w-3xl"
      bodyClassName="px-6 py-6 md:px-8"
      panelClassName="h-[85vh]"
      tabBar={tabBar}
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={() => setShowSettings(false)}>{t('common.close')}</DialogCancelButton>
        </div>
      }
    >
      {activeTab === 'appearance' && <AppearanceSettingsTab />}
      {activeTab === 'library' && <LibrarySettingsTab draft={networkDraft} setDraft={setNetworkDraft} />}
      {activeTab === 'transcriptions' && <TranscriptionsSettingsTab />}
      {activeTab === 'translations' && <TranslationsSettingsTab />}
      {activeTab === 'models' && <ModelsSettingsTab />}
      {activeTab === 'languages' && <LanguagesSettingsTab />}
      {activeTab === 'data' && <DataSettingsTab />}
      {activeTab === 'jobs' && <JobsSettingsTab />}
    </Dialog>
  );
}
