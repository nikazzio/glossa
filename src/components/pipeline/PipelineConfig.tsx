import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider } from '../../types';
import { getContextWindow, getSelectableModelIds } from '../../models/catalog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useConfigStore } from '../../stores/configStore';
import { ollamaService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { PromptPreviewTab } from './PromptPreviewTab';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { PagePendingOverlay } from '../common';
import { SettingsTabPanel } from './SettingsTabPanel';
import { TranslationTabPanel } from './TranslationTabPanel';
import { AuditTabPanel } from './AuditTabPanel';
import { MemoryTabPanel } from './MemoryTabPanel';
import { GlossaryTabPanel } from './GlossaryTabPanel';

export type ConfigSection = 'settings' | 'translation' | 'audit' | 'memory' | 'glossary' | 'preview';

interface PipelineConfigProps {
  activeTab: ConfigSection;
  onOpenSection: (section: ConfigSection) => void;
}

/** Il contenuto della linguetta aperta nella finestra di configurazione della
 *  pipeline; le linguette stanno nella fila della finestra. */
export function PipelineConfig({ activeTab, onOpenSection }: PipelineConfigProps) {
  const {
    config,
    setConfig,
    setMode,
    updateStage,
  } = usePipelineStore();
  const { chunks, isProcessing } = useChunksStore();
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const { t } = useTranslation();
  const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);

  const { templates, loadTemplates, saveTemplate } = usePromptTemplateStore();

  const translationsExist = chunks.some((c) => c.status === 'completed');

  useEffect(() => {
    void loadTemplates().catch((err: unknown) => {
      toast.error(t('pipeline.templates.loadFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  }, [loadTemplates, t]);

  const auditTemplates = templates.filter((tmpl) => tmpl.context === 'audit');
  const briefTemplates = templates.filter((tmpl) => tmpl.context === 'brief');

  const briefModel = config.stages.find((stage) => stage.enabled && stage.provider !== 'deepl')
    ?? { provider: config.judgeProvider, model: config.judgeModel };
  const briefRefineLabel = formatProviderModelLabel(briefModel.provider, briefModel.model);
  const canRefineBrief = canRefineWithProvider(briefModel.provider, keyStatuses);
  const judgeRefineLabel = formatProviderModelLabel(config.judgeProvider, config.judgeModel);
  const canRefineJudge = canRefineWithProvider(config.judgeProvider, keyStatuses);
  const minSourceAwareContextWindow = config.stages
    .filter((s) => s.enabled && s.role !== 'format')
    .reduce<number | undefined>((min, s) => {
      const cw = getContextWindow(s.provider, s.model);
      if (cw === undefined) return min;
      return min === undefined ? cw : Math.min(min, cw);
    }, undefined);
  const contextWindowChanged =
    !translationsExist &&
    chunks.length > 0 &&
    config.chunkedWithContextWindow !== undefined &&
    minSourceAwareContextWindow !== undefined &&
    minSourceAwareContextWindow !== config.chunkedWithContextWindow;

  const handleRefreshOllama = async () => {
    setIsRefreshingOllama(true);
    try {
      const models = await ollamaService.listModels();
      useConfigStore.getState().setOllamaModels(models);
      useConfigStore.getState().setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: unknown) {
      useConfigStore.getState().setOllamaModels([]);
      useConfigStore.getState().setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefreshingOllama(false);
    }
  };

  const handleJudgeProviderChange = (newProvider: ModelProvider) => {
    const models = getSelectableModelIds(newProvider, useConfigStore.getState().ollamaModels);
    setConfig((prev) => ({
      ...prev,
      judgeProvider: newProvider,
      judgeModel: models[0] || '',
      reviewProviderOptions: {},
    }));
    if (newProvider === 'ollama' && useConfigStore.getState().ollamaStatus === 'unknown') {
      toast.message(t('ollama.uncheckedHint'));
    } else if (newProvider === 'ollama' && useConfigStore.getState().ollamaStatus === 'disconnected') {
      toast.warning(t('ollama.selectedButOffline'));
    }
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div className="h-full space-y-6 overflow-y-auto px-6 py-6 custom-scrollbar">

      {activeTab === 'settings' && (
        <SettingsTabPanel
          config={config}
          setConfig={setConfig}
          setMode={setMode}
          translationsExist={translationsExist}
          isProcessing={isProcessing}
          briefTemplates={briefTemplates}
          canRefineBrief={canRefineBrief}
          briefRefineLabel={briefRefineLabel}
          saveTemplate={saveTemplate}
          briefRefineProvider={briefModel.provider}
          briefRefineModel={briefModel.model}
        />
      )}

      {activeTab === 'translation' && (
        <TranslationTabPanel
          config={config}
          setConfig={setConfig}
          translationsExist={translationsExist}
          isProcessing={isProcessing}
          isRefreshingOllama={isRefreshingOllama}
          templates={templates}
          keyStatuses={keyStatuses}
          contextWindowChanged={contextWindowChanged}
          handleRefreshOllama={handleRefreshOllama}
          updateStage={updateStage}
          saveTemplate={saveTemplate}
        />
      )}

      {activeTab === 'audit' && (
        <AuditTabPanel
            config={config}
            setConfig={setConfig}
            isProcessing={isProcessing}
            auditTemplates={auditTemplates}
            canRefine={canRefineJudge}
            judgeRefineLabel={judgeRefineLabel}
            handleJudgeProviderChange={handleJudgeProviderChange}
            keyStatuses={keyStatuses}
            isRefreshingOllama={isRefreshingOllama}
            onRefreshOllama={handleRefreshOllama}
            saveTemplate={saveTemplate}
          />
      )}

      {activeTab === 'glossary' && <GlossaryTabPanel />}

      {activeTab === 'preview' && (
        <div id="pconfig-panel-preview" role="tabpanel" aria-labelledby="pconfig-tab-preview" className="space-y-6">
          <PromptPreviewTab config={config} setConfig={setConfig} onOpenSection={onOpenSection}
            disabledReason={isProcessing ? t('document.operationsRunning') : undefined} />
        </div>
      )}

      {activeTab === 'memory' && (
        <MemoryTabPanel config={config} setConfig={setConfig} isProcessing={isProcessing} />
      )}

      </div>
      <PagePendingOverlay
        pending={isProcessing}
        errorMessage={null}
        label={t('pipeline.settingsLockedWhileRunning')}
        roundedClassName="rounded-none"
      />
    </div>
  );
}
