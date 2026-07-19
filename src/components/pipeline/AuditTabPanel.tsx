import { AlertTriangle, Cpu, RefreshCw, Scale, Wand2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, PipelineConfig, PromptTemplate, ReasoningEffortLevel } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { ensureModelInList, getKnownModelIds, getModelStatus, getResolvedModelReasoning, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { DEFAULT_COHERENCE_PROMPT, DEFAULT_JUDGE_PROMPT } from '../../constants';
import { SectionLabel, ToggleRow, FieldLabel, Select, Tooltip } from '../ui';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { TemperatureControl } from '../models/TemperatureControl';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { AuditPromptEditor } from './AuditPromptEditor';
import { useUiStore } from '../../stores/uiStore';

interface AuditTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  judgeModels: string[];
  currentJudgeReasoningEffort: ReasoningEffortLevel;
  handleJudgeReasoningChange: (effort: ReasoningEffortLevel) => void;
  judgeOllamaOffline: boolean;
  auditTemplates: PromptTemplate[];
  isRefiningJudge: boolean;
  isRefiningCoherence: boolean;
  canRefine: boolean;
  judgeRefineLabel: string;
  handleRefineJudgePrompt: () => void;
  handleRefineCoherencePrompt: () => void;
  handleJudgeModelChange: (model: string) => void;
  handleJudgeProviderChange: (provider: ModelProvider) => void;
  keyStatuses: ProviderKeyStatusMap;
  saveTemplate: SaveTemplateFn;
  deleteTemplate: (id: string) => Promise<void>;
}

export function AuditTabPanel({
  config,
  setConfig,
  judgeModels,
  currentJudgeReasoningEffort,
  handleJudgeReasoningChange,
  judgeOllamaOffline,
  auditTemplates,
  isRefiningJudge,
  isRefiningCoherence,
  canRefine,
  judgeRefineLabel,
  handleRefineJudgePrompt,
  handleRefineCoherencePrompt,
  handleJudgeModelChange,
  handleJudgeProviderChange,
  keyStatuses,
  saveTemplate,
  deleteTemplate,
}: AuditTabPanelProps) {
  const { t } = useTranslation();
  const judgeResolvedReasoning = getResolvedModelReasoning(config.judgeProvider, config.judgeModel);
  const judgeShowReasoningPicker =
    judgeResolvedReasoning !== undefined && judgeResolvedReasoning !== 'non_reasoning' && config.judgeProvider !== 'ollama';
  const judgeTemperatureAllowed =
    config.judgeProvider === 'anthropic' ||
    config.judgeProvider === 'gemini' ||
    ((config.judgeProvider === 'openai' || config.judgeProvider === 'deepseek') &&
      (judgeResolvedReasoning === 'non_reasoning' || currentJudgeReasoningEffort === 'none'));
  const currentJudgeTemperature = (() => {
    if (config.judgeProvider === 'anthropic') return config.reviewProviderOptions?.anthropic?.temperature;
    if (config.judgeProvider === 'openai') return config.reviewProviderOptions?.openai?.temperature;
    if (config.judgeProvider === 'deepseek') return config.reviewProviderOptions?.deepseek?.temperature;
    if (config.judgeProvider === 'gemini') return config.reviewProviderOptions?.gemini?.temperature;
    return undefined;
  })();
  const handleJudgeTemperatureChange = (temperature: number | undefined) => {
    const opts = config.reviewProviderOptions ?? {};
    if (config.judgeProvider === 'anthropic') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, anthropic: { ...opts.anthropic, temperature } } }));
    } else if (config.judgeProvider === 'openai') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, openai: { ...opts.openai, temperature } } }));
    } else if (config.judgeProvider === 'deepseek') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, deepseek: { ...opts.deepseek, temperature } } }));
    } else if (config.judgeProvider === 'gemini') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, gemini: { ...opts.gemini, temperature } } }));
    }
  };
  const showDeprecatedModels = useUiStore((s) => s.showDeprecatedModels);
  const canToggleDeprecated = config.judgeProvider !== 'ollama';
  const effectiveJudgeModels = ensureModelInList(
    showDeprecatedModels && canToggleDeprecated
      ? getKnownModelIds(config.judgeProvider, { includeDeprecated: true })
      : judgeModels,
    config.judgeModel,
  );

  return (
    <div
      id="pconfig-panel-audit"
      role="tabpanel"
      aria-labelledby="pconfig-tab-audit"
      className="space-y-6"
    >
      <div className="space-y-3 border-l-4 border-l-editorial-warning/45 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <ToggleRow
          icon={<RefreshCw size={13} />}
          label={t('pipeline.judgeRefineLoopSectionLabel')}
          checked={config.judgeRefineLoop ?? false}
          onChange={() =>
            setConfig((prev) => ({ ...prev, judgeRefineLoop: !(prev.judgeRefineLoop ?? false) }))
          }
        />
        {config.judgeRefineLoop && (
          <div className="space-y-1.5 pt-1">
            <FieldLabel htmlFor="judge-refine-loop-max-iter" block>
              {t('pipeline.judgeRefineLoopMaxIter')}
            </FieldLabel>
            <input
              id="judge-refine-loop-max-iter"
              type="number"
              min={1}
              max={3}
              value={config.judgeRefineLoopMaxIter ?? 2}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  judgeRefineLoopMaxIter: Math.max(1, Math.min(3, parseInt(e.target.value, 10) || 1)),
                }))
              }
              className="w-20 rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        )}
      </div>

      <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <SectionLabel icon={Cpu} label={t('pipeline.auditModelLabel')} />
        <div className="flex gap-2">
          <Select
            value={config.judgeProvider}
            onChange={(value) => handleJudgeProviderChange(value as ModelProvider)}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={LLM_PROVIDER_ORDER.map((p) => ({
              value: p,
              label: p,
              disabled: p !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[p] === false,
            }))}
          />
          {effectiveJudgeModels.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={config.judgeModel}
                onChange={handleJudgeModelChange}
                className="flex-1"
                ariaLabel={t('pipeline.auditModelLabel')}
                options={effectiveJudgeModels.map((m) => ({
                  value: m,
                  label: `${m}${getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}${getModelStatus(config.judgeProvider, m) === 'deprecated' ? ' (superato)' : ''}`,
                }))}
              />
              <DeprecatedModelBadge provider={config.judgeProvider} model={config.judgeModel} />
            </div>
          ) : config.judgeProvider === 'ollama' ? (
            <input
              value={config.judgeModel}
              onChange={(e) => handleJudgeModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('pipeline.auditModelLabel')}
            />
          ) : (
            <Select
              value={config.judgeModel}
              onChange={handleJudgeModelChange}
              className="flex-1"
              ariaLabel={t('pipeline.auditModelLabel')}
              options={getKnownModelIds(config.judgeProvider).map((m) => ({
                value: m,
                label: `${m}${getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}`,
              }))}
            />
          )}
        </div>
        {(judgeShowReasoningPicker || judgeTemperatureAllowed) && (
          <div className="flex items-center gap-3">
            {judgeShowReasoningPicker && (
              <div className="flex items-center gap-1.5">
                <Tooltip label={t('pipeline.reasoningEffort')} side="top">
                  <Wand2 size={11} className="shrink-0 text-editorial-warning" aria-hidden="true" />
                </Tooltip>
                <ReasoningPicker
                  value={currentJudgeReasoningEffort}
                  showNone={judgeResolvedReasoning === 'optional'}
                  onChange={handleJudgeReasoningChange}
                />
              </div>
            )}
            {judgeTemperatureAllowed && (
              <TemperatureControl
                value={currentJudgeTemperature}
                max={config.judgeProvider === 'anthropic' ? 1 : 2}
                onChange={handleJudgeTemperatureChange}
              />
            )}
          </div>
        )}
        {judgeOllamaOffline && (
          <div className="flex items-center gap-2 text-xs text-editorial-accent">
            <AlertTriangle size={14} />
            <span>{t('ollama.selectedButOffline')}</span>
          </div>
        )}
        <ProviderRuntimeEditor
          provider={config.judgeProvider}
          value={config.reviewProviderOptions}
          onChange={(reviewProviderOptions) => setConfig((prev) => ({ ...prev, reviewProviderOptions }))}
          title={t('pipeline.providerOptions.reviewTitle')}
          hint={t('pipeline.providerOptions.reviewHint')}
        />
      </div>

      <AuditPromptEditor
        label={t('pipeline.judgePromptLabel')}
        hint={t('pipeline.judgePromptHint')}
        value={config.judgePrompt}
        placeholder={t('pipeline.auditPlaceholder')}
        templates={auditTemplates}
        isRefining={isRefiningJudge}
        canRefine={canRefine}
        refineLabel={judgeRefineLabel}
        onRefine={handleRefineJudgePrompt}
        onChange={(value) => setConfig((prev) => ({ ...prev, judgePrompt: value }))}
        onApplyTemplate={(template) => {
          setConfig((prev) => ({
            ...prev,
            judgePrompt: template.prompt,
            judgeModel: template.defaultModel || prev.judgeModel,
            judgeProvider: (template.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
          }));
        }}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={config.judgeModel}
        defaultProvider={config.judgeProvider}
        icon={<Scale size={11} />}
        defaultValue={DEFAULT_JUDGE_PROMPT}
        onReset={() => setConfig((prev) => ({ ...prev, judgePrompt: DEFAULT_JUDGE_PROMPT }))}
      />

      <AuditPromptEditor
        label={t('pipeline.coherencePromptLabel')}
        hint={t('pipeline.coherencePromptHint')}
        value={config.coherencePrompt ?? ''}
        placeholder={t('pipeline.coherencePromptPlaceholder')}
        templates={auditTemplates}
        isRefining={isRefiningCoherence}
        canRefine={canRefine}
        refineLabel={judgeRefineLabel}
        onRefine={handleRefineCoherencePrompt}
        onChange={(value) => setConfig((prev) => ({ ...prev, coherencePrompt: value }))}
        onApplyTemplate={(template) => {
          setConfig((prev) => ({
            ...prev,
            coherencePrompt: template.prompt,
            judgeModel: template.defaultModel || prev.judgeModel,
            judgeProvider: (template.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
          }));
        }}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={config.judgeModel}
        defaultProvider={config.judgeProvider}
        icon={<RefreshCw size={11} />}
        defaultValue={DEFAULT_COHERENCE_PROMPT}
        onReset={() => setConfig((prev) => ({ ...prev, coherencePrompt: DEFAULT_COHERENCE_PROMPT }))}
      />

    </div>
  );
}
