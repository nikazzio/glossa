import { AlertTriangle, Cpu, RefreshCw, Scale, Wand2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, PipelineConfig, PromptTemplate, ReasoningEffortLevel } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { getKnownModelIds, getModelStatus, getResolvedModelReasoning, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { DEFAULT_COHERENCE_PROMPT, DEFAULT_JUDGE_PROMPT } from '../../constants';
import { SectionLabel } from '../ui';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { AuditPromptEditor } from './AuditPromptEditor';

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

  return (
    <div
      id="pconfig-panel-audit"
      role="tabpanel"
      aria-labelledby="pconfig-tab-audit"
      className="space-y-6"
    >
      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
        <button
          type="button"
          role="switch"
          aria-checked={config.judgeRefineLoop ?? false}
          onClick={() =>
            setConfig((prev) => ({ ...prev, judgeRefineLoop: !(prev.judgeRefineLoop ?? false) }))
          }
          className={`flex w-full items-center justify-between text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${config.judgeRefineLoop ? '' : 'opacity-80 hover:opacity-100'}`}
        >
          <span className="flex items-center gap-1.5">
            <RefreshCw size={11} className="text-editorial-accent shrink-0" />
            <span className="text-xs font-sans uppercase tracking-[0.35em] text-editorial-muted">
              {t('pipeline.judgeRefineLoopSectionLabel')}
            </span>
          </span>
          <span
            className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors shrink-0 ${
              (config.judgeRefineLoop ?? false)
                ? 'border-editorial-ink bg-editorial-ink justify-end'
                : 'border-editorial-border bg-editorial-textbox/60 justify-start'
            }`}
            aria-hidden="true"
          >
            <span className="h-3.5 w-3.5 rounded-full bg-editorial-bg" />
          </span>
        </button>
        {config.judgeRefineLoop && (
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor="judge-refine-loop-max-iter"
              className="block text-xs font-sans uppercase tracking-[0.22em] text-editorial-muted"
            >
              {t('pipeline.judgeRefineLoopMaxIter')}
            </label>
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
              className="w-20 rounded-[12px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
        <SectionLabel icon={Cpu} label={t('pipeline.auditModelLabel')} />
        <div className="flex gap-2">
          <select
            value={config.judgeProvider}
            onChange={(e) => handleJudgeProviderChange(e.target.value as ModelProvider)}
            className="rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('models.provider')}
          >
            {MODEL_PROVIDER_ORDER.map((p) => (
              <option key={p} value={p} disabled={p !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[p] === false}>{p}</option>
            ))}
          </select>
          {judgeModels.length > 0 ? (
            <select
              value={config.judgeModel}
              onChange={(e) => handleJudgeModelChange(e.target.value)}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('pipeline.auditModelLabel')}
            >
              {judgeModels.map((m) => (
                <option key={m} value={m}>
                  {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          ) : config.judgeProvider === 'ollama' ? (
            <input
              value={config.judgeModel}
              onChange={(e) => handleJudgeModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('pipeline.auditModelLabel')}
            />
          ) : (
            <select
              value={config.judgeModel}
              onChange={(e) => handleJudgeModelChange(e.target.value)}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('pipeline.auditModelLabel')}
            >
              {getKnownModelIds(config.judgeProvider).map((m) => (
                <option key={m} value={m}>
                  {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        {judgeResolvedReasoning !== undefined && judgeResolvedReasoning !== 'non_reasoning' && config.judgeProvider !== 'ollama' && (
          <div className="flex items-center gap-2">
            <Wand2 size={11} className="text-editorial-warning shrink-0" />
            <span className="text-xs font-sans uppercase tracking-[0.3em] text-editorial-muted">
              {t('pipeline.reasoningEffort')}
            </span>
            <ReasoningPicker
              value={currentJudgeReasoningEffort}
              showNone={judgeResolvedReasoning === 'optional'}
              onChange={handleJudgeReasoningChange}
            />
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
