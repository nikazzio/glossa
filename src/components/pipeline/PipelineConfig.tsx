import { ArrowRightLeft, BookOpen, Eye, Globe, Languages, Loader2, Play, RotateCcw, Settings, ShieldCheck } from 'lucide-react';
import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, PipelineMode, ReasoningEffortLevel } from '../../types';
import { LANGUAGES } from '../../constants';
import { getContextWindow, getResolvedModelReasoning, getSelectableModelIds } from '../../models/catalog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { CostBadge } from './CostBadge';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { usePricingStore } from '../../stores/pricingStore';
import { llmService, ollamaService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useOperationLogStore } from '../../stores/operationLogStore';
import { PromptPreviewTab } from './PromptPreviewTab';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton, SectionLabel } from '../ui';
import { PersonaEditor } from './PersonaEditor';
import { SettingsTabPanel } from './SettingsTabPanel';
import { TranslationTabPanel } from './TranslationTabPanel';
import { AuditTabPanel } from './AuditTabPanel';

export type ConfigSection = 'settings' | 'translation' | 'audit' | 'glossary' | 'preview';

interface PipelineConfigProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
  className?: string;
  showActions?: boolean;
  showOnlyGlobalDefaults?: boolean;
  visibleSection?: ConfigSection;
  libraryGlossarySection?: ReactNode;
}

const DEFAULT_PIPELINE_CONFIG_CLASSNAME =
  'col-span-1 md:col-span-3 border-r border-editorial-border flex flex-col bg-editorial-bg/50 min-h-0 h-full';

function useJudgeModelOptions(provider: ModelProvider): string[] {
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  return getSelectableModelIds(provider, ollamaModels);
}

export function PipelineConfig({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  className,
  showActions = true,
  showOnlyGlobalDefaults = false,
  visibleSection,
  libraryGlossarySection,
}: PipelineConfigProps) {
  const {
    config,
    setConfig,
    setMode,
    updateStage,
  } = usePipelineStore();
  const { chunks, isProcessing, cancelRequested, resetAllChunks } = useChunksStore();
  const clearLog = useOperationLogStore((s) => s.clear);
  const ollamaStatus = useUiStore((s) => s.ollamaStatus);
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();
  const { t } = useTranslation();
  const judgeModels = useJudgeModelOptions(config.judgeProvider);
  const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);
  const [isRefiningPersona, setIsRefiningPersona] = useState(false);
  const [refiningStageId, setRefiningStageId] = useState<string | null>(null);
  const [isRefiningJudge, setIsRefiningJudge] = useState(false);
  const [isRefiningCoherence, setIsRefiningCoherence] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigSection>(visibleSection ?? 'translation');

  const { templates, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();

  const cannotRun = isProcessing || chunks.length === 0;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const canRerunAll = !isProcessing && completedCount > 0;
  const translationsExist = completedCount > 0;

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const auditTemplates = templates.filter((tmpl) => tmpl.context === 'audit');
  const personaTemplates = templates.filter((tmpl) => tmpl.context === 'persona');

  const handleRerunAll = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmRerunAllTitle'),
      message: t('pipeline.confirmRerunAllMessage', { count: completedCount }),
      confirmLabel: t('pipeline.rerunAll'),
      danger: true,
    });
    if (!ok) return;
    resetAllChunks();
    clearLog();
    onRunPipeline();
  };

  const runReason = isProcessing
    ? t('pipeline.runDisabledProcessing')
    : chunks.length === 0
      ? t('pipeline.runDisabledNoChunks')
      : undefined;

  const judgeOllamaOffline =
    config.judgeProvider === 'ollama' && ollamaStatus === 'disconnected';

  const judgeResolvedReasoning = getResolvedModelReasoning(config.judgeProvider, config.judgeModel);
  const currentJudgeReasoningEffort: ReasoningEffortLevel = (() => {
    const judgeDefaultEffort: ReasoningEffortLevel = judgeResolvedReasoning === 'optional' ? 'none' : 'medium';
    if (config.judgeProvider === 'openai') return config.reviewProviderOptions?.openai?.reasoningEffort ?? judgeDefaultEffort;
    if (config.judgeProvider === 'deepseek') return config.reviewProviderOptions?.deepseek?.reasoningEffort ?? judgeDefaultEffort;
    if (config.judgeProvider === 'gemini') {
      const budget = config.reviewProviderOptions?.gemini?.thinkingBudget;
      if (budget === 0) return judgeResolvedReasoning === 'reasoning' ? judgeDefaultEffort : 'none';
      if (budget != null && budget < 0) return 'high';
      if (budget != null && budget <= 1024) return 'low';
      if (budget != null) return 'medium';
    }
    return judgeDefaultEffort;
  })();

  const handleJudgeReasoningChange = (effort: ReasoningEffortLevel) => {
    const opts = config.reviewProviderOptions ?? {};
    if (config.judgeProvider === 'openai') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, openai: { ...opts.openai, reasoningEffort: effort } } }));
    } else if (config.judgeProvider === 'deepseek') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, deepseek: { ...opts.deepseek, reasoningEffort: effort } } }));
    } else if (config.judgeProvider === 'gemini') {
      const budget = effort === 'none' ? 0 : effort === 'low' ? 1024 : effort === 'medium' ? 8192 : -1;
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, gemini: { ...opts.gemini, thinkingBudget: budget } } }));
    }
  };

  const pricingOverrides = usePricingStore((s) => s.overrides);
  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  const stage0 = config.stages[0];
  const personaRefineLabel = formatProviderModelLabel(stage0?.provider ?? 'gemini', stage0?.model ?? '');
  const canRefinePersona = stage0 ? canRefineWithProvider(stage0.provider, keyStatuses) : false;
  const judgeRefineLabel = formatProviderModelLabel(config.judgeProvider, config.judgeModel);
  const canRefineJudge = canRefineWithProvider(config.judgeProvider, keyStatuses);
  const missingRefineProviders = (Object.entries(keyStatuses) as Array<[string, boolean | undefined]>)
    .filter(([, configured]) => configured === false)
    .map(([provider]) => provider);

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
      useUiStore.getState().setOllamaModels(models);
      useUiStore.getState().setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: unknown) {
      useUiStore.getState().setOllamaModels([]);
      useUiStore.getState().setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefreshingOllama(false);
    }
  };

  const handleRefineStagePrompt = async (stageId: string) => {
    const stage = config.stages.find((s) => s.id === stageId);
    if (!stage?.prompt.trim() || !stage?.model.trim()) return;
    setRefiningStageId(stageId);
    try {
      const refined = await llmService.refinePrompt(stage.prompt, stage.provider, stage.model, 'stage');
      updateStage(stageId, { prompt: refined });
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefiningStageId(null);
    }
  };

  const handleRefinePersona = async () => {
    if (!config.persona?.trim()) return;
    const stage = config.stages[0];
    if (!stage) return;
    setIsRefiningPersona(true);
    try {
      const refined = await llmService.refinePrompt(config.persona, stage.provider, stage.model, 'stage');
      setConfig((prev) => ({ ...prev, persona: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefiningPersona(false);
    }
  };

  const handleRefineJudgePrompt = async () => {
    if (!config.judgePrompt.trim()) return;
    setIsRefiningJudge(true);
    try {
      const refined = await llmService.refinePrompt(config.judgePrompt, config.judgeProvider, config.judgeModel, 'audit');
      setConfig((prev) => ({ ...prev, judgePrompt: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefiningJudge(false);
    }
  };

  const handleRefineCoherencePrompt = async () => {
    if (!config.coherencePrompt?.trim()) return;
    setIsRefiningCoherence(true);
    try {
      const refined = await llmService.refinePrompt(config.coherencePrompt, config.judgeProvider, config.judgeModel, 'audit');
      setConfig((prev) => ({ ...prev, coherencePrompt: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefiningCoherence(false);
    }
  };

  const handleJudgeModelChange = (newModel: string) => {
    setConfig((prev) => {
      const opts = prev.reviewProviderOptions ?? {};
      const cleared = { ...opts };
      if (prev.judgeProvider === 'openai') cleared.openai = { ...opts.openai, reasoningEffort: undefined };
      else if (prev.judgeProvider === 'deepseek') cleared.deepseek = { ...opts.deepseek, reasoningEffort: undefined };
      else if (prev.judgeProvider === 'gemini') cleared.gemini = { ...opts.gemini, thinkingBudget: undefined };
      return { ...prev, judgeModel: newModel, reviewProviderOptions: cleared };
    });
  };

  const handleJudgeProviderChange = (newProvider: ModelProvider) => {
    const models = getSelectableModelIds(newProvider, useUiStore.getState().ollamaModels);
    setConfig((prev) => ({
      ...prev,
      judgeProvider: newProvider,
      judgeModel: models[0] || '',
      reviewProviderOptions: {},
    }));
    if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'unknown') {
      toast.message(t('ollama.uncheckedHint'));
    } else if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'disconnected') {
      toast.warning(t('ollama.selectedButOffline'));
    }
  };

  const TAB_TITLE: Record<ConfigSection, string> = {
    settings: t('pipeline.tabSettings'),
    translation: t('pipeline.tabTranslation'),
    audit: t('pipeline.tabAudit'),
    glossary: t('pipeline.tabGlossary'),
    preview: t('pipeline.tabPreview'),
  };

  return (
    <section className={className ?? DEFAULT_PIPELINE_CONFIG_CLASSNAME}>

      {/* ── Empty state (no project open) — global defaults ── */}
      {showOnlyGlobalDefaults && (
        <div className="shrink-0 border-b border-editorial-border px-6 py-5 space-y-5">
          <div className="space-y-2">
            <SectionLabel icon={Globe} label={t('pipeline.languagePair')} />
            <div className={`flex items-center gap-3 transition-opacity ${!!config.persona ? 'opacity-40 pointer-events-none' : ''}`}>
              <select
                value={config.sourceLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                aria-label={t('pipeline.sourceLanguage')}
                disabled={!!config.persona}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                ))}
              </select>
              <IconButton
                size="md"
                className="shrink-0"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    sourceLanguage: prev.targetLanguage,
                    targetLanguage: prev.sourceLanguage,
                  }))
                }
                disabled={!!config.persona}
                title={t('pipeline.swapLanguages')}
              >
                <ArrowRightLeft size={13} />
              </IconButton>
              <select
                value={config.targetLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                aria-label={t('pipeline.targetLanguage')}
                disabled={!!config.persona}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                ))}
              </select>
            </div>
            {!!config.persona && (
              <p className="text-xs leading-relaxed text-editorial-muted/60">
                {t('pipeline.languagePairLockedByPersona')}
              </p>
            )}
          </div>
          <PersonaEditor
            persona={config.persona}
            sourceLanguage={config.sourceLanguage}
            targetLanguage={config.targetLanguage}
            templates={personaTemplates}
            isRefining={isRefiningPersona}
            canRefine={canRefinePersona}
            refineLabel={personaRefineLabel}
            onChange={(value) => setConfig((prev) => ({ ...prev, persona: value }))}
            onRefine={handleRefinePersona}
            onSaveTemplate={(name, prompt) => saveTemplate(name, prompt, 'persona')}
            deleteTemplate={deleteTemplate}
          />
        </div>
      )}

      {/* ── Tab navigation + panels ── */}
      {!showOnlyGlobalDefaults && <>
      <div
        role="tablist"
        aria-label={t('pipeline.configSections')}
        className="flex items-center gap-2 shrink-0 border-b border-editorial-border bg-editorial-bg/60 px-5 py-2"
      >
        <IconButton
          size="lg"
          tone={activeTab === 'settings' ? 'accent' : 'default'}
          onClick={() => setActiveTab('settings')}
          title={t('pipeline.tabSettings')}
          id="pconfig-tab-settings"
          role="tab"
          aria-selected={activeTab === 'settings'}
          aria-controls="pconfig-panel-settings"
        >
          <Settings size={16} />
        </IconButton>
        <span className="h-4 w-px bg-editorial-border/70 mx-1" aria-hidden="true" />
        <IconButton
          size="lg"
          tone={activeTab === 'translation' ? 'accent' : 'default'}
          onClick={() => setActiveTab('translation')}
          title={t('pipeline.tabTranslation')}
          id="pconfig-tab-translation"
          role="tab"
          aria-selected={activeTab === 'translation'}
          aria-controls="pconfig-panel-translation"
        >
          <Languages size={16} />
        </IconButton>
        <IconButton
          size="lg"
          tone={activeTab === 'audit' ? 'accent' : 'default'}
          onClick={() => setActiveTab('audit')}
          title={t('pipeline.tabAudit')}
          id="pconfig-tab-audit"
          role="tab"
          aria-selected={activeTab === 'audit'}
          aria-controls="pconfig-panel-audit"
        >
          <ShieldCheck size={16} />
        </IconButton>
        <IconButton
          size="lg"
          tone={activeTab === 'glossary' ? 'accent' : 'default'}
          onClick={() => setActiveTab('glossary')}
          title={t('pipeline.tabGlossary')}
          id="pconfig-tab-glossary"
          role="tab"
          aria-selected={activeTab === 'glossary'}
          aria-controls="pconfig-panel-glossary"
        >
          <BookOpen size={16} />
        </IconButton>
        <IconButton
          size="lg"
          tone={activeTab === 'preview' ? 'accent' : 'default'}
          onClick={() => setActiveTab('preview')}
          title={t('pipeline.tabPreview')}
          id="pconfig-tab-preview"
          role="tab"
          aria-selected={activeTab === 'preview'}
          aria-controls="pconfig-panel-preview"
        >
          <Eye size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
        <span className="text-sm font-display italic text-editorial-ink">{TAB_TITLE[activeTab]}</span>
      </div>

      {/* ── Tab panels ── */}
      <div className="relative flex-1 min-h-0">
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-editorial-bg/70 backdrop-blur-[2px]">
            <div className="mt-10 flex items-center gap-2 rounded-full border border-editorial-border bg-editorial-bg px-4 py-2 text-[11px] font-sans uppercase tracking-widest text-editorial-muted shadow-sm">
              <Loader2 size={12} className="animate-spin" />
              {t('pipeline.settingsLockedWhileRunning')}
            </div>
          </div>
        )}
        <div className="overflow-y-auto custom-scrollbar px-6 py-6 space-y-6 h-full">

          {activeTab === 'settings' && (
            <SettingsTabPanel
              config={config}
              setConfig={setConfig}
              setMode={setMode}
              translationsExist={translationsExist}
              isProcessing={isProcessing}
              personaTemplates={personaTemplates}
              isRefiningPersona={isRefiningPersona}
              canRefinePersona={canRefinePersona}
              personaRefineLabel={personaRefineLabel}
              handleRefinePersona={handleRefinePersona}
              saveTemplate={saveTemplate}
              deleteTemplate={deleteTemplate}
              keyStatusLoading={keyStatusLoading}
              missingRefineProviders={missingRefineProviders}
            />
          )}

          {activeTab === 'translation' && (
            <TranslationTabPanel
              config={config}
              setConfig={setConfig}
              translationsExist={translationsExist}
              isProcessing={isProcessing}
              ollamaModels={ollamaModels}
              ollamaStatus={ollamaStatus}
              isRefreshingOllama={isRefreshingOllama}
              templates={templates}
              refiningStageId={refiningStageId}
              keyStatuses={keyStatuses}
              contextWindowChanged={contextWindowChanged}
              handleRefineStagePrompt={handleRefineStagePrompt}
              handleRefreshOllama={handleRefreshOllama}
              updateStage={updateStage}
              saveTemplate={saveTemplate}
              deleteTemplate={deleteTemplate}
            />
          )}

          {activeTab === 'audit' && (
            <AuditTabPanel
              config={config}
              setConfig={setConfig}
              judgeModels={judgeModels}
              currentJudgeReasoningEffort={currentJudgeReasoningEffort}
              handleJudgeReasoningChange={handleJudgeReasoningChange}
              judgeOllamaOffline={judgeOllamaOffline}
              auditTemplates={auditTemplates}
              isRefiningJudge={isRefiningJudge}
              isRefiningCoherence={isRefiningCoherence}
              canRefineJudge={canRefineJudge}
              judgeRefineLabel={judgeRefineLabel}
              handleRefineJudgePrompt={handleRefineJudgePrompt}
              handleRefineCoherencePrompt={handleRefineCoherencePrompt}
              handleJudgeModelChange={handleJudgeModelChange}
              handleJudgeProviderChange={handleJudgeProviderChange}
              keyStatuses={keyStatuses}
              saveTemplate={saveTemplate}
              deleteTemplate={deleteTemplate}
            />
          )}

          {activeTab === 'glossary' && (
            <div
              id="pconfig-panel-glossary"
              role="tabpanel"
              aria-labelledby="pconfig-tab-glossary"
              className="space-y-6"
            >
              {libraryGlossarySection ?? (
                <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-editorial-border/60 px-6 py-10 text-center">
                  <BookOpen size={20} className="text-editorial-muted/40" />
                  <p className="text-sm text-editorial-muted/70">
                    {t('pipeline.glossaryOpenProject')}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div id="pconfig-panel-preview" role="tabpanel" aria-labelledby="pconfig-tab-preview">
              <PromptPreviewTab config={config} />
            </div>
          )}

        </div>
      </div>
      </>}

      {showActions && (
        <div className="shrink-0 border-t border-editorial-border/60 px-8 py-6 flex flex-col gap-3">
          <CostBadge estimate={costEstimate} />
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.beginPipeline')}
            className="bg-editorial-ink text-white px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                {t('pipeline.executing')}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play size={14} fill="currentColor" /> {t('pipeline.beginPipeline')}
              </span>
            )}
          </button>
          {canRerunAll && (
            <button
              type="button"
              onClick={handleRerunAll}
              title={t('pipeline.rerunAllHint', { count: completedCount })}
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-3 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            >
              <RotateCcw size={13} /> {t('pipeline.rerunAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onRunAuditOnly}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.runAuditOnly')}
            className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {t('pipeline.runAuditOnly')}
          </button>
          {isProcessing && (
            <button
              type="button"
              onClick={onCancelPipeline}
              disabled={cancelRequested}
              title={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
            >
              {cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
