import type { ReactNode } from 'react';
import { useState } from 'react';
import { LibraryBig, BookOpen, FileText, Type, Server, HardDrive, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/uiStore';
import type { SettingsTab } from '../../stores/uiStore';
import { HL_COLORS_LIGHT, HL_COLORS_DARK } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { ollamaService } from '../../services/llmService';
import { usePricingStore } from '../../stores/pricingStore';
import { Dialog, IconButton, DialogCancelButton } from '../ui';
import type { ModelProvider } from '../../types';
import type { HLColorSet } from '../../stores/uiStore';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { TranslationsSettingsTab } from './TranslationsSettingsTab';
import { TypographySettingsTab } from './TypographySettingsTab';
import { ProviderSettingsTab } from './ProviderSettingsTab';
import { StorageSettingsTab } from './StorageSettingsTab';
import { JobsSettingsTab } from './JobsSettingsTab';

export function SettingsModal() {
  const {
    showSettings,
    setShowSettings,
    documentLayout,
    setDocumentLayout,
    highlightColors,
    setHighlightColor,
    editorialAccentColor,
    setEditorialAccentColor,
    uiFont,
    setUiFont,
    colorScheme,
    setColorScheme,
    documentFontSize,
    setDocumentFontSize,
    documentLineHeight,
    setDocumentLineHeight,
    settingsTab: activeTab,
    setSettingsTab: setActiveTab,
    showDeprecatedModels,
    setShowDeprecatedModels,
  } = useUiStore();
  const {
    ollamaStatus,
    ollamaModels,
    setOllamaModels,
    setOllamaStatus,
    chunkPresetShort,
    chunkPresetMedium,
    chunkPresetLong,
    setChunkPresetShort,
    setChunkPresetMedium,
    setChunkPresetLong,
    ollamaBaseUrl,
    setOllamaBaseUrl,
    newPipelineInit,
    setNewPipelineInit,
  } = useConfigStore();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [showPricingOverrides, setShowPricingOverrides] = useState(false);
  const [showSecurityAdvisory, setShowSecurityAdvisory] = useState(false);
  const [activeProviderTab, setActiveProviderTab] = useState<ModelProvider>('openai');
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();
  const { statuses: keyStatuses, refresh: refreshKeyStatuses } = useProviderKeyStatus();
  const hlMode: 'light' | 'dark' = (() => {
    if (colorScheme === 'dark') return 'dark';
    if (colorScheme === 'light') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  })();
  // Merge chiave per chiave: uno stato persistito incompleto (chiavi mancanti da
  // una migrazione precedente) non deve far leggere `undefined` per un tipo di
  // evidenziazione — altrimenti lo swatch colore risulta vuoto/nero.
  const activeHlColors: HLColorSet = {
    ...(hlMode === 'dark' ? HL_COLORS_DARK : HL_COLORS_LIGHT),
    ...highlightColors[hlMode],
  };

  const refreshOllama = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: unknown) {
      setOllamaModels([]);
      setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const activeTabConfig: Array<{ id: SettingsTab; icon: ReactNode; label: string }> = [
    { id: 'translations', icon: <FileText size={14} />,          label: t('areas.translations.title') },
    { id: 'typography',   icon: <Type size={14} />,              label: t('settings.typographyTab') },
    { id: 'provider',     icon: <Server size={14} />,            label: t('settings.providerTab') },
    { id: 'storage',      icon: <HardDrive size={14} />,         label: t('settings.storageTab') },
    { id: 'jobs',         icon: <ListChecks size={14} />,        label: t('settings.jobsTab') },
  ];

  const disabledTabConfig: Array<{ icon: ReactNode; label: string }> = [
    { icon: <LibraryBig size={14} />,  label: t('areas.library.title') },
    { icon: <BookOpen size={14} />,    label: t('areas.transcriptions.title') },
  ];

  const tabBar = (
    <div role="tablist" aria-label={t('settings.panelTitle')} className="flex items-center gap-2">
      {activeTabConfig.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <IconButton
            key={tab.id}
            size="md"
            tone={isActive ? 'accent' : 'default'}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            id={`settings-tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
          >
            {tab.icon}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      {disabledTabConfig.map((tab) => (
        <IconButton
          key={tab.label}
          size="md"
          tone="default"
          title={`${tab.label} — Glossa 2.0`}
          disabled
        >
          {tab.icon}
        </IconButton>
      ))}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {activeTabConfig.find((tb) => tb.id === activeTab)?.label}
      </span>
    </div>
  );

  return (
    <Dialog
      open={showSettings}
      onOpenChange={(o) => {
        if (!o) setShowSettings(false);
      }}
      title={t('settings.panelTitle')}
      closeLabel={t('settings.close')}
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
      {activeTab === 'translations' && (
        <TranslationsSettingsTab
          chunkPresetShort={chunkPresetShort}
          chunkPresetMedium={chunkPresetMedium}
          chunkPresetLong={chunkPresetLong}
          setChunkPresetShort={setChunkPresetShort}
          setChunkPresetMedium={setChunkPresetMedium}
          setChunkPresetLong={setChunkPresetLong}
          newPipelineInit={newPipelineInit}
          setNewPipelineInit={setNewPipelineInit}
          documentLayout={documentLayout}
          setDocumentLayout={setDocumentLayout}
          hlMode={hlMode}
          activeHlColors={activeHlColors}
          setHighlightColor={setHighlightColor}
        />
      )}

      {activeTab === 'typography' && (
        <TypographySettingsTab
          uiFont={uiFont}
          setUiFont={setUiFont}
          colorScheme={colorScheme}
          setColorScheme={setColorScheme}
          editorialAccentColor={editorialAccentColor}
          setEditorialAccentColor={setEditorialAccentColor}
          documentFontSize={documentFontSize}
          setDocumentFontSize={setDocumentFontSize}
          documentLineHeight={documentLineHeight}
          setDocumentLineHeight={setDocumentLineHeight}
        />
      )}

      {activeTab === 'provider' && (
        <ProviderSettingsTab
          activeProviderTab={activeProviderTab}
          setActiveProviderTab={setActiveProviderTab}
          urlDraft={urlDraft}
          setUrlDraft={setUrlDraft}
          urlError={urlError}
          setUrlError={setUrlError}
          ollamaStatus={ollamaStatus}
          ollamaModels={ollamaModels}
          refreshing={refreshing}
          refreshOllama={refreshOllama}
          setOllamaBaseUrl={setOllamaBaseUrl}
          keyStatuses={keyStatuses}
          refreshKeyStatuses={refreshKeyStatuses}
          showDeprecatedModels={showDeprecatedModels}
          setShowDeprecatedModels={setShowDeprecatedModels}
          showPricingOverrides={showPricingOverrides}
          setShowPricingOverrides={setShowPricingOverrides}
          overrides={overrides}
          setOverride={setOverride}
          resetOverride={resetOverride}
          resetAll={resetAll}
          showSecurityAdvisory={showSecurityAdvisory}
          setShowSecurityAdvisory={setShowSecurityAdvisory}
        />
      )}

      {activeTab === 'storage' && <StorageSettingsTab />}

      {activeTab === 'jobs' && <JobsSettingsTab />}

    </Dialog>
  );
}
