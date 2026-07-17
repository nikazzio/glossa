import { AlertTriangle, FileText, Languages, Network, RotateCcw, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { OllamaStatus, PipelineConfig, PipelineStageConfig, PromptTemplate, StageRole } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { calculateBlobBudget, getSelectableModelIds } from '../../models/catalog';
import { IconButton, SectionLabel, ToggleRow, FieldLabel } from '../ui';
import { StageCard } from './StageCard';

const STAGE_ROLE_ICON: Record<StageRole, LucideIcon> = {
  translation: Languages,
  refine: Wand2,
  format: FileText,
  'deepl-translation': Network,
};

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
  saveTemplate: SaveTemplateFn;
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

  const blobContextCard = (
    <div className="space-y-3">
      <SectionLabel icon={FileText} label={t('pipeline.blobContext')} />
      <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        <p className="text-xs leading-relaxed text-editorial-muted/80">
          {t('pipeline.blobContextExplainer')}
        </p>
        <ToggleRow
          icon={<FileText size={13} />}
          label={t('pipeline.blobOverrideToggle')}
          checked={isOverride}
          disabled={translationsExist}
          onChange={() => setConfig((prev) => ({
            ...prev,
            blobBudgetTokens: isOverride ? 0 : auto.budget,
          }))}
        />
        {!isOverride && (
          <span className="block pl-4 text-xs text-editorial-muted/70">
            {t('pipeline.blobContextAutoDesc', { tokens: auto.budget.toLocaleString(), model: auto.modelId || 'ollama' })}
          </span>
        )}

        {isOverride && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <FieldLabel>{t('pipeline.blobBudgetTokens')}</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={config.blobBudgetTokens ?? auto.budget}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    blobBudgetTokens: Math.max(1, Number(e.target.value) || 1),
                  }))}
                  className="w-24 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.blobBudgetTokens')}
                />
              </div>
              <div className="flex items-center gap-2">
                <FieldLabel>{t('pipeline.blobOverlap')}</FieldLabel>
                <input
                  type="number"
                  min={0}
                  value={config.blobOverlap ?? 1}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    blobOverlap: Math.max(0, Number(e.target.value) || 0),
                  }))}
                  className="w-16 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.blobOverlap')}
                />
              </div>
              <IconButton
                onClick={() => setConfig((prev) => ({ ...prev, blobBudgetTokens: 0 }))}
                title={t('pipeline.blobContextReset')}
                size="sm"
              >
                <RotateCcw size={12} />
              </IconButton>
            </div>
            <p className="text-[11px] text-editorial-muted/70">{t('pipeline.blobOverlapHint')}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      id="pconfig-panel-translation"
      role="tabpanel"
      aria-labelledby="pconfig-tab-translation"
      className="space-y-6"
    >
      {/* Context memory card — shown at top for standard/editorial modes */}
      {config.mode !== 'deepl-hybrid' && blobContextCard}

      {/* Context window warning */}
      {contextWindowChanged && (
        <div className="flex items-center gap-2 text-xs text-editorial-warning">
          <ShieldCheck size={12} className="shrink-0 text-editorial-warning" />
          <span>{t('pipeline.modelContextWindowChangedHint')}</span>
        </div>
      )}

      {/* Model locked warning */}
      {translationsExist && (
        <div className="flex items-center gap-2 border-l-4 border-l-editorial-warning/60 border-y border-editorial-warning/30 bg-editorial-warning/8 px-3 py-2 text-xs text-editorial-muted">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{t('pipeline.modelLockedHint')}</span>
        </div>
      )}

      {/* Stage cards */}
      {config.stages.map((stage) => {
        const stageModelOptions = getSelectableModelIds(stage.provider, ollamaModels);
        return (
          <div key={stage.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <SectionLabel
                icon={STAGE_ROLE_ICON[stage.role ?? 'translation']}
                label={t(`pipeline.stageRole.${stage.role ?? 'translation'}`)}
              />
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
              sourceLanguage={config.sourceLanguage}
              targetLanguage={config.targetLanguage}
              glossaryEntries={config.glossary}
              glossaryName={config.assignedGlossaryId ?? ''}
              onUpdate={(updates) => updateStage(stage.id, updates)}
              onRefinePrompt={() => handleRefineStagePrompt(stage.id)}
              onRefreshOllama={handleRefreshOllama}
              saveTemplate={saveTemplate}
              deleteTemplate={deleteTemplate}
            />
          </div>
        );
      })}

      {/* Context memory card — shown at bottom for deepl-hybrid mode */}
      {config.mode === 'deepl-hybrid' && (
        <div className="mt-2">
          {blobContextCard}
        </div>
      )}
    </div>
  );
}
