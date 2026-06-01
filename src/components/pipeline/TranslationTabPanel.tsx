import { FileText, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { OllamaStatus, PipelineConfig, PipelineStageConfig, PromptTemplate } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { calculateBlobBudget, getSelectableModelIds } from '../../models/catalog';
import { StageCard } from './StageCard';

interface TranslationTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  translationsExist: boolean;
  isProcessing: boolean;
  ollamaModels: string[];
  ollamaStatus: OllamaStatus;
  isRefreshingOllama: boolean;
  templates: PromptTemplate[];
  refiningStageId: string | null;
  keyStatuses: ProviderKeyStatusMap;
  contextWindowChanged: boolean;
  handleRefineStagePrompt: (stageId: string) => void;
  handleRefreshOllama: () => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;
  saveTemplate: (name: string, prompt: string, context: 'stage' | 'audit' | 'persona', defaultModel?: string, defaultProvider?: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export function TranslationTabPanel({
  config,
  setConfig,
  translationsExist,
  isProcessing,
  ollamaModels,
  ollamaStatus,
  isRefreshingOllama,
  templates,
  refiningStageId,
  keyStatuses,
  contextWindowChanged,
  handleRefineStagePrompt,
  handleRefreshOllama,
  updateStage,
  saveTemplate,
  deleteTemplate,
}: TranslationTabPanelProps) {
  const { t } = useTranslation();
  const isOverride = (config.blobBudgetTokens ?? 0) > 0;
  const auto = calculateBlobBudget(config.stages);

  return (
    <div
      id="pconfig-panel-translation"
      role="tabpanel"
      aria-labelledby="pconfig-tab-translation"
      className="space-y-6"
    >
      {/* Context memory card */}
      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
        <button
          type="button"
          role="switch"
          aria-checked={isOverride}
          disabled={translationsExist}
          onClick={() => setConfig((prev) => ({
            ...prev,
            blobBudgetTokens: isOverride ? 0 : auto.budget,
          }))}
          className={`flex w-full items-center justify-between text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed ${
            isOverride ? '' : 'opacity-80 hover:opacity-100'
          }`}
        >
          <span className="space-y-0.5">
            <span className="flex items-center gap-1.5">
              <FileText size={11} className="text-editorial-accent shrink-0" />
              <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                {t('pipeline.blobContext')}
              </span>
            </span>
            {!isOverride && (
              <span className="block pl-4 text-xs text-editorial-muted/70">
                {t('pipeline.blobContextAutoDesc', { tokens: auto.budget.toLocaleString(), model: auto.modelId || 'ollama' })}
              </span>
            )}
          </span>
          <span
            className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors shrink-0 ${
              isOverride
                ? 'border-editorial-ink bg-editorial-ink justify-end'
                : 'border-editorial-border bg-editorial-textbox/60 justify-start'
            }`}
            aria-hidden="true"
          >
            <span className="h-3.5 w-3.5 rounded-full bg-white" />
          </span>
        </button>

        {isOverride && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.blobBudgetTokens')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.blobBudgetTokens ?? auto.budget}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    blobBudgetTokens: Math.max(1, Number(e.target.value) || 1),
                  }))}
                  className="w-24 rounded-[10px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.blobBudgetTokens')}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.blobOverlap')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.blobOverlap ?? 1}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    blobOverlap: Math.max(0, Number(e.target.value) || 0),
                  }))}
                  className="w-16 rounded-[10px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.blobOverlap')}
                />
              </div>
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, blobBudgetTokens: 0 }))}
                title={t('pipeline.blobContextReset')}
                aria-label={t('pipeline.blobContextReset')}
                className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                <RotateCcw size={12} />
              </button>
            </div>
            <p className="text-[10px] text-editorial-muted/70">{t('pipeline.blobOverlapHint')}</p>
          </div>
        )}
      </div>

      {/* Context window warning */}
      {contextWindowChanged && (
        <div className="flex items-center gap-2 text-xs text-editorial-warning">
          <ShieldCheck size={12} className="shrink-0 text-editorial-warning" />
          <span>{t('pipeline.modelContextWindowChangedHint')}</span>
        </div>
      )}

      {/* Stage cards */}
      {config.stages.map((stage) => {
        const stageModelOptions = getSelectableModelIds(stage.provider, ollamaModels);
        return (
          <div key={stage.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-ink font-bold">
                {t(`pipeline.stageRole.${stage.role ?? 'translation'}`)}
              </span>
              <span className="h-px flex-1 bg-editorial-border/60" aria-hidden="true" />
            </div>
            <StageCard
              stage={stage}
              templates={templates.filter((tmpl) => tmpl.context === 'stage')}
              isRefining={refiningStageId === stage.id}
              translationsExist={translationsExist}
              isProcessing={isProcessing}
              ollamaStatus={ollamaStatus}
              isRefreshingOllama={isRefreshingOllama}
              modelOptions={stageModelOptions}
              keyStatuses={keyStatuses}
              onUpdate={(updates) => updateStage(stage.id, updates)}
              onRefinePrompt={() => handleRefineStagePrompt(stage.id)}
              onRefreshOllama={handleRefreshOllama}
              saveTemplate={saveTemplate}
              deleteTemplate={deleteTemplate}
            />
          </div>
        );
      })}
    </div>
  );
}
