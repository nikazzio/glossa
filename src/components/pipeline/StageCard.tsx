import { useState } from 'react';
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Cpu,
  FileText,
  Loader2,
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
import type { ModelProvider, OllamaStatus, PipelineStageConfig, PromptTemplate } from '../../types';
import { getKnownModelIds, getModelStatus, getResolvedModelReasoning, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import type { ReasoningEffortLevel } from '../../types';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { canRefineWithProvider, formatProviderModelLabel, type ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { useConfigStore } from '../../stores/configStore';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import { STAGE_TEMPLATES } from '../../pipeline/pipelineModes';

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
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRefinePrompt: () => void;
  onRefreshOllama: () => void;
  saveTemplate: (
    name: string,
    prompt: string,
    context: 'stage' | 'audit',
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

  const role = stage.role ?? 'translation';
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
      onUpdate({ provider: 'custom', customProviderId: firstProfile?.id ?? '', model: '', providerOptions: {} });
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
      await saveTemplate(name, stage.prompt, 'stage', stage.model, stage.provider);
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
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
      {(stage.role ?? 'translation') !== 'translation' && (
        <p className="text-[10px] leading-relaxed text-editorial-muted/70">
          {t(`pipeline.stageRoleHint.${stage.role ?? 'translation'}`)}
        </p>
      )}

      {/* Model + provider card */}
      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
        <div className="flex items-center gap-1.5">
          <Cpu size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
            {t('pipeline.stageModelLabel')}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={stage.provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
            disabled={translationsExist || isProcessing}
            className="rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('models.provider')}
          >
            {MODEL_PROVIDER_ORDER.map((p) => (
              <option key={p} value={p} disabled={p !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[p] === false}>{p}</option>
            ))}
            <option key="custom" value="custom">custom</option>
          </select>
          {stage.provider === 'custom' ? (
            <div className="flex flex-1 flex-col gap-1.5">
              <select
                value={stage.customProviderId ?? ''}
                onChange={(e) => onUpdate({ customProviderId: e.target.value })}
                disabled={translationsExist || isProcessing}
                className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('settings.customProvider.sectionTitle')}
              >
                {customProfiles.length === 0 && (
                  <option value="">{t('settings.customProvider.add')}</option>
                )}
                {customProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                value={stage.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={translationsExist || isProcessing}
                placeholder={t('ollama.modelPlaceholder')}
                className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('pipeline.stageModelLabel')}
              />
            </div>
          ) : modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <select
                value={stage.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={translationsExist || isProcessing}
                className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('pipeline.stageModelLabel')}
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}{getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                  </option>
                ))}
              </select>
              <ModelCapabilityHint provider={stage.provider} model={stage.model} iconOnly />
            </div>
          ) : (
            <input
              value={stage.model}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={translationsExist || isProcessing}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('pipeline.stageModelLabel')}
            />
          )}
        </div>
        {resolvedReasoning !== undefined && resolvedReasoning !== 'non_reasoning' && stage.provider !== 'ollama' && (
          <div className="flex items-center gap-2">
            <Wand2 size={11} className="text-editorial-warning shrink-0" />
            <span className="text-[10px] font-sans uppercase tracking-[0.3em] text-editorial-muted">
              {t('pipeline.reasoningEffort')}
            </span>
            <ReasoningPicker
              value={currentReasoningEffort}
              showNone={resolvedReasoning === 'optional'}
              disabled={translationsExist || isProcessing}
              onChange={handleReasoningChange}
            />
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
              className="flex items-center gap-1.5 rounded-full border border-editorial-accent/60 px-3 py-1 text-xs text-editorial-accent transition-colors hover:bg-editorial-accent hover:text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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
      </div>

      {/* Prompt editor */}
      <div className="rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <FileText size={11} className="text-editorial-accent shrink-0" />
            <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('pipeline.prompt')}
            </span>
            {isCustomPrompt && !isEditingPrompt && (
              <span className="rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-editorial-accent">
                {t('pipeline.promptCustomBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditingPrompt ? (
              <>
                <button
                  type="button"
                  onClick={onRefinePrompt}
                  disabled={isRefining || !stage.prompt.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  aria-label={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                  aria-label={t('pipeline.templates.save')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookmarkPlus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                  aria-label={t('pipeline.templates.load')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookOpen size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setIsEditingPrompt(false); setShowSaveName(false); setShowTemplateList(false); }}
                  title={t('common.close')}
                  aria-label={t('common.close')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {isCustomPrompt && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ prompt: STAGE_TEMPLATES[role].defaultPrompt })}
                    disabled={translationsExist || isProcessing}
                    title={t('pipeline.promptReset')}
                    aria-label={t('pipeline.promptReset')}
                    className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingPrompt(true)}
                  disabled={translationsExist || isProcessing}
                  title={t('pipeline.editPrompt')}
                  aria-label={t('pipeline.editPrompt')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Pencil size={16} />
                </button>
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
              autoFocus
              className="flex-1 rounded bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              className="text-editorial-ink hover:text-editorial-accent transition-colors disabled:opacity-40 focus:outline-none"
              aria-label={t('common.confirm')}
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveName(false); setTemplateName(''); }}
              className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
              aria-label={t('common.cancel')}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {isEditingPrompt && showTemplateList && (
          <div className="rounded-lg border border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-editorial-border/60">
              <input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder={t('pipeline.templates.searchPlaceholder')}
                autoFocus
                className="w-full rounded bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto custom-scrollbar">
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
                      onClick={() => handleDeleteTemplate(tmpl.id)}
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
          className={`w-full rounded-[16px] border p-4 text-sm font-mono outline-none leading-relaxed resize-y min-h-[10rem] ${
            promptEditable
              ? 'bg-editorial-textbox/40 border-editorial-border/60 focus-visible:ring-2 focus-visible:ring-editorial-accent'
              : 'bg-editorial-textbox/10 border-editorial-border/30 text-editorial-muted/60 cursor-default'
          }`}
        />
      </div>
    </div>
  );
}
