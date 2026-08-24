import { useState } from 'react';
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Cpu,
  FileText,
  Loader2,
  LockOpen,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GlossaryEntry, ModelProvider, OllamaStatus, PipelineStageConfig, PromptTemplate, PromptTemplateWorkflow } from '../../types';
import { ensureModelInList, getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
import type { ReasoningEffortLevel } from '../../types';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { TemperatureControl } from '../models/TemperatureControl';
import { AnthropicCacheConfig } from './AnthropicCacheConfig';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { canRefineWithProvider, formatProviderModelLabel, type ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { useConfigStore } from '../../stores/configStore';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { STAGE_TEMPLATES } from '../../pipeline/pipelineModes';
import { DeeplStageConfig } from './DeeplStageConfig';
import { IconButton, SectionLabel, Select, Tooltip } from '../ui';

interface StageCardProps {
  stage: PipelineStageConfig;
  templates: PromptTemplate[];
  isRefining: boolean;
  translationsExist: boolean;
  isProcessing: boolean;
  ollamaStatus: OllamaStatus;
  isRefreshingOllama: boolean;
  modelOptions: string[];
  keyStatuses: ProviderKeyStatusMap;
  sourceLanguage: string;
  targetLanguage: string;
  glossaryEntries: GlossaryEntry[];
  glossaryName: string;
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRefinePrompt: () => void;
  onRefreshOllama: () => void;
  saveTemplate: (
    name: string,
    prompt: string,
    context: 'stage' | 'audit',
    workflow: PromptTemplateWorkflow,
    defaultModel?: string,
    defaultProvider?: string,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export function StageCard({
  stage,
  templates,
  isRefining,
  translationsExist,
  isProcessing,
  ollamaStatus,
  isRefreshingOllama,
  modelOptions,
  keyStatuses,
  sourceLanguage,
  targetLanguage,
  glossaryEntries,
  glossaryName,
  onUpdate,
  onRefinePrompt,
  onRefreshOllama,
  saveTemplate,
  deleteTemplate,
}: StageCardProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const customProfiles = useCustomProviderStore((s) => s.profiles);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [modelUnlocked, setModelUnlocked] = useState(false);
  const showDeprecatedModels = useUiStore((s) => s.showDeprecatedModels);

  const role = stage.role ?? 'translation';
  const canToggleDeprecated = stage.provider !== 'ollama' && stage.provider !== 'custom';
  const effectiveModelOptions = ensureModelInList(
    showDeprecatedModels && canToggleDeprecated
      ? getKnownModelIds(stage.provider, { includeDeprecated: true })
      : modelOptions,
    stage.model,
  );
  const modelDisabled = isProcessing || (translationsExist && !modelUnlocked);
  const isCustomPrompt = stage.prompt.trim() !== STAGE_TEMPLATES[role].defaultPrompt.trim();
  const promptEditable = isEditingPrompt && !translationsExist && !isProcessing;
  const canRefine = canRefineWithProvider(stage.provider, keyStatuses);
  const refineLabel = formatProviderModelLabel(stage.provider, stage.model);
  const ollamaOffline = stage.provider === 'ollama' && ollamaStatus === 'disconnected';

  const resolvedReasoning = getResolvedModelReasoning(stage.provider, stage.model);
  const defaultEffort: ReasoningEffortLevel = resolvedReasoning === 'optional' ? 'none' : 'medium';
  const currentReasoningEffort: ReasoningEffortLevel = (() => {
    if (stage.provider === 'openai') return stage.providerOptions?.openai?.reasoningEffort ?? defaultEffort;
    if (stage.provider === 'deepseek') return stage.providerOptions?.deepseek?.reasoningEffort ?? defaultEffort;
    if (stage.provider === 'gemini') {
      const budget = stage.providerOptions?.gemini?.thinkingBudget;
      if (budget === 0) return resolvedReasoning === 'reasoning' ? defaultEffort : 'none';
      if (budget != null && budget < 0) return 'high';
      if (budget != null && budget <= 1024) return 'low';
      if (budget != null) return 'medium';
      return defaultEffort;
    }
    return defaultEffort;
  })();

  const showReasoningPicker =
    resolvedReasoning !== undefined && resolvedReasoning !== 'non_reasoning' && stage.provider !== 'ollama';

  const supportsTemperature =
    stage.provider === 'anthropic' ||
    stage.provider === 'gemini' ||
    stage.provider === 'openai' ||
    stage.provider === 'deepseek';

  // OpenAI/DeepSeek reject or silently ignore temperature while actively reasoning;
  // Anthropic has no such restriction, and Gemini accepts it alongside thinking budget.
  const temperatureDisabledByReasoning =
    (stage.provider === 'openai' || stage.provider === 'deepseek') &&
    !(resolvedReasoning === 'non_reasoning' || currentReasoningEffort === 'none');

  const currentTemperature = (() => {
    if (stage.provider === 'anthropic') return stage.providerOptions?.anthropic?.temperature;
    if (stage.provider === 'openai') return stage.providerOptions?.openai?.temperature;
    if (stage.provider === 'deepseek') return stage.providerOptions?.deepseek?.temperature;
    if (stage.provider === 'gemini') return stage.providerOptions?.gemini?.temperature;
    return undefined;
  })();

  const handleTemperatureChange = (temperature: number | undefined) => {
    const opts = stage.providerOptions ?? {};
    if (stage.provider === 'anthropic') {
      onUpdate({ providerOptions: { ...opts, anthropic: { ...opts.anthropic, temperature } } });
    } else if (stage.provider === 'openai') {
      onUpdate({ providerOptions: { ...opts, openai: { ...opts.openai, temperature } } });
    } else if (stage.provider === 'deepseek') {
      onUpdate({ providerOptions: { ...opts, deepseek: { ...opts.deepseek, temperature } } });
    } else if (stage.provider === 'gemini') {
      onUpdate({ providerOptions: { ...opts, gemini: { ...opts.gemini, temperature } } });
    }
  };

  const handleReasoningChange = (effort: ReasoningEffortLevel) => {
    const opts = stage.providerOptions ?? {};
    if (stage.provider === 'openai') {
      onUpdate({ providerOptions: { ...opts, openai: { ...opts.openai, reasoningEffort: effort } } });
    } else if (stage.provider === 'deepseek') {
      onUpdate({ providerOptions: { ...opts, deepseek: { ...opts.deepseek, reasoningEffort: effort } } });
    } else if (stage.provider === 'gemini') {
      const budget = effort === 'none' ? 0 : effort === 'low' ? 1024 : effort === 'medium' ? 8192 : -1;
      onUpdate({ providerOptions: { ...opts, gemini: { ...opts.gemini, thinkingBudget: budget } } });
    }
  };

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleProviderChange = (newProvider: ModelProvider) => {
    if (newProvider === 'custom') {
      const firstProfile = customProfiles[0];
      onUpdate({ provider: 'custom', customProviderId: firstProfile?.id, model: '', providerOptions: {} });
      return;
    }
    const models = newProvider === 'ollama' ? ollamaModels : getKnownModelIds(newProvider);
    onUpdate({ provider: newProvider, model: models[0] || '', providerOptions: {}, customProviderId: undefined });
  };

  const handleModelChange = (newModel: string) => {
    const opts = stage.providerOptions ?? {};
    const cleared = { ...opts };
    if (stage.provider === 'openai') cleared.openai = { ...opts.openai, reasoningEffort: undefined };
    else if (stage.provider === 'deepseek') cleared.deepseek = { ...opts.deepseek, reasoningEffort: undefined };
    else if (stage.provider === 'gemini') cleared.gemini = { ...opts.gemini, thinkingBudget: undefined };
    onUpdate({ model: newModel, providerOptions: cleared });
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, stage.prompt, 'stage', 'translation', stage.model, stage.provider);
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('pipeline.templates.deleteConfirmTitle'),
      message: t('pipeline.templates.deleteConfirmMessage', { name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate(id);
      toast.success(t('pipeline.templates.deleted'));
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Role hint for non-translation stages */}
      {(stage.role ?? 'translation') !== 'translation' && (stage.role ?? 'translation') !== 'deepl-translation' && (
        <p className="text-xs leading-relaxed text-editorial-muted/70">
          {t(`pipeline.stageRoleHint.${stage.role ?? 'translation'}`)}
        </p>
      )}

      {stage.provider === 'deepl' ? (
        <DeeplStageConfig
          value={stage.providerOptions?.deepl}
          sourceLang={sourceLanguage}
          targetLanguage={targetLanguage}
          glossaryEntries={glossaryEntries}
          glossaryName={glossaryName}
          onChange={(deepl) =>
            onUpdate({ providerOptions: { ...stage.providerOptions, deepl } })
          }
        />
      ) : (
      <>
      {/* Model + provider card */}
      <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <SectionLabel icon={Cpu} label={t('pipeline.stageModelLabel')} />
        <div className="flex items-center gap-2">
          <Select
            value={stage.provider}
            onChange={(value) => handleProviderChange(value as ModelProvider)}
            disabled={modelDisabled}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={[
              ...LLM_PROVIDER_ORDER.map((p) => ({
                value: p,
                label: p,
                disabled: p === 'ollama'
                  ? ollamaModels.length === 0
                  : (keyStatuses as Partial<Record<string, boolean>>)[p] === false,
              })),
              { value: 'custom', label: 'custom' },
            ]}
          />
          {stage.provider === 'custom' ? (
            <div className="flex flex-1 flex-col gap-1.5">
              <Select
                value={stage.customProviderId ?? ''}
                onChange={(value) => onUpdate({ customProviderId: value || undefined })}
                disabled={modelDisabled}
                className="flex-1"
                ariaLabel={t('settings.customProvider.sectionTitle')}
                options={[
                  ...(customProfiles.length === 0
                    ? [{ value: '', label: t('settings.customProvider.add') }]
                    : []),
                  ...customProfiles.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <input
                value={stage.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={modelDisabled}
                placeholder={t('ollama.modelPlaceholder')}
                className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('pipeline.stageModelLabel')}
              />
            </div>
          ) : effectiveModelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={stage.model}
                onChange={handleModelChange}
                disabled={modelDisabled}
                className="flex-1"
                ariaLabel={t('pipeline.stageModelLabel')}
                options={effectiveModelOptions.map((m) => ({
                  value: m,
                  label: `${m}${getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}${getModelStatus(stage.provider, m) === 'deprecated' ? ' (superato)' : ''}`,
                }))}
              />
              <ModelCapabilityHint provider={stage.provider} model={stage.model} iconOnly />
              <DeprecatedModelBadge provider={stage.provider} model={stage.model} />
            </div>
          ) : (
            <input
              value={stage.model}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={modelDisabled}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('pipeline.stageModelLabel')}
            />
          )}
          {translationsExist && !isProcessing && (
            <IconButton
              size="sm"
              tone={modelUnlocked ? 'accent' : 'default'}
              onClick={() => setModelUnlocked(!modelUnlocked)}
              title={t('pipeline.unlockModelChange')}
              ariaPressed={modelUnlocked}
              className="shrink-0"
            >
              <LockOpen size={13} />
            </IconButton>
          )}
        </div>
        {modelUnlocked && translationsExist && (
          <p className="text-xs leading-relaxed text-editorial-warning">
            {t('pipeline.unlockModelChangeWarning')}
          </p>
        )}
        {(showReasoningPicker || supportsTemperature) && (
          <div className="flex items-center gap-3">
            {showReasoningPicker && (
              <div className="flex items-center gap-1.5">
                <Tooltip label={t('pipeline.reasoningEffort')} side="top">
                  <Wand2 size={11} className="shrink-0 text-editorial-warning" aria-hidden="true" />
                </Tooltip>
                <ReasoningPicker
                  value={currentReasoningEffort}
                  showNone={resolvedReasoning === 'optional'}
                  disabled={modelDisabled}
                  onChange={handleReasoningChange}
                />
              </div>
            )}
            {supportsTemperature && (
              <TemperatureControl
                value={currentTemperature}
                max={stage.provider === 'anthropic' ? 1 : 2}
                disabled={modelDisabled || temperatureDisabledByReasoning}
                onChange={handleTemperatureChange}
              />
            )}
          </div>
        )}
        {ollamaOffline && !translationsExist && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-editorial-accent">
              <WifiOff size={13} />
              <span>{t('ollama.selectedButOffline')}</span>
            </div>
            <button
              type="button"
              onClick={onRefreshOllama}
              disabled={isRefreshingOllama}
              className="flex items-center gap-1.5 rounded-md border border-editorial-accent/60 px-3 py-1 text-xs text-editorial-accent transition-colors hover:bg-editorial-accent hover:text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {isRefreshingOllama ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {t('ollama.loadModels')}
            </button>
          </div>
        )}
        <ProviderRuntimeEditor
          provider={stage.provider}
          value={stage.providerOptions}
          onChange={(providerOptions) => onUpdate({ providerOptions })}
          title={t('pipeline.providerOptions.stageTitle')}
          hint={t('pipeline.providerOptions.stageHint')}
        />
        {stage.provider === 'anthropic' && (
          <AnthropicCacheConfig
            value={stage.providerOptions?.anthropic}
            onChange={(anthropic) =>
              onUpdate({ providerOptions: { ...stage.providerOptions, anthropic } })
            }
            disabled={isProcessing}
          />
        )}
      </div>

      {/* Prompt editor */}
      <div className="border-l-4 border-l-editorial-accent/40 border-y border-editorial-border/70 bg-editorial-bg/85 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <SectionLabel icon={FileText} label={t('pipeline.prompt')} />
            {isCustomPrompt && !isEditingPrompt && (
              <span className="rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-accent">
                {t('pipeline.promptCustomBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditingPrompt ? (
              <>
                <IconButton
                  onClick={onRefinePrompt}
                  disabled={isRefining || !stage.prompt.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  size="sm"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </IconButton>
                <IconButton
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                  size="sm"
                >
                  <BookmarkPlus size={16} />
                </IconButton>
                <IconButton
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                  size="sm"
                >
                  <BookOpen size={16} />
                </IconButton>
                <IconButton
                  onClick={() => { setIsEditingPrompt(false); setShowSaveName(false); setShowTemplateList(false); }}
                  title={t('common.close')}
                  size="sm"
                >
                  <X size={16} />
                </IconButton>
              </>
            ) : (
              <>
                {isCustomPrompt && (
                  <IconButton
                    onClick={() => onUpdate({ prompt: STAGE_TEMPLATES[role].defaultPrompt })}
                    disabled={translationsExist || isProcessing}
                    title={t('pipeline.promptReset')}
                    size="sm"
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                )}
                <IconButton
                  onClick={() => setIsEditingPrompt(true)}
                  disabled={translationsExist || isProcessing}
                  title={t('pipeline.editPrompt')}
                  size="sm"
                >
                  <Pencil size={16} />
                </IconButton>
              </>
            )}
          </div>
        </div>

        {isEditingPrompt && showSaveName && (
          <div className="flex items-center gap-1.5">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTemplate();
                if (e.key === 'Escape') { setShowSaveName(false); setTemplateName(''); }
              }}
              placeholder={t('pipeline.templates.namePlaceholder')}
              aria-label={t('pipeline.templates.namePlaceholder')}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (salva template)
              autoFocus
              className="flex-1 rounded-md bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
            <IconButton
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              title={t('common.confirm')}
              size="sm"
            >
              <Check size={16} />
            </IconButton>
            <IconButton
              onClick={() => { setShowSaveName(false); setTemplateName(''); }}
              title={t('common.cancel')}
              size="sm"
            >
              <X size={16} />
            </IconButton>
          </div>
        )}

        {isEditingPrompt && showTemplateList && (
          <div className="border-y border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-editorial-border/60">
              <input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder={t('pipeline.templates.searchPlaceholder')}
                aria-label={t('pipeline.templates.searchPlaceholder')}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- casella di ricerca che compare aprendo l'elenco template
                autoFocus
              className="w-full rounded-md bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
            <ul className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-editorial-border/60">
              {filteredTemplates.length === 0 ? (
                <li className="px-3 py-4 text-xs text-editorial-muted text-center">
                  {t('pipeline.templates.empty')}
                </li>
              ) : (
                filteredTemplates.map((tmpl) => (
                  <li key={tmpl.id} className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group">
                    <button
                      type="button"
                      onClick={() => {
                          onUpdate({
                            prompt: tmpl.prompt,
                            ...(tmpl.defaultModel ? { model: tmpl.defaultModel } : {}),
                            ...(tmpl.defaultProvider ? { provider: tmpl.defaultProvider as ModelProvider } : {}),
                          });
                          setShowTemplateList(false);
                          setTemplateSearch('');
                        }}
                      className="flex-1 text-left min-w-0 focus:outline-none"
                    >
                      <div className="text-sm font-bold text-editorial-ink truncate">{tmpl.name}</div>
                      <div className="text-xs text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                      className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <textarea
          value={stage.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder={t('pipeline.stagePromptPlaceholder')}
          disabled={!promptEditable}
          rows={12}
          className={`w-full rounded-md border-2 p-4 text-[13px] font-mono outline-none leading-6 resize-y min-h-[12rem] ${
            promptEditable
              ? 'bg-editorial-paper border-editorial-accent/25 focus-visible:ring-2 focus-visible:ring-editorial-accent'
              : 'bg-editorial-textbox/12 border-editorial-border/40 text-editorial-muted/70 cursor-default'
          }`}
        />
      </div>
      </>
      )}
    </div>
  );
}
