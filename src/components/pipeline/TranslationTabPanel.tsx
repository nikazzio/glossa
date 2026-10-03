import { FileText, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, PipelineStageConfig, PromptTemplate } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { calculateBlobBudget } from '../../models/catalog';
import { IconButton, PanelSection, ToggleRow } from '../ui';
import { NumberSettingRow } from './NumberSettingRow';
import { StageCard } from './StageCard';

const SETTING_LIST_CLASSNAME = 'divide-y divide-rule border-y border-rule';
const DEFAULT_BLOB_OVERLAP = 1;

interface TranslationTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  translationsExist: boolean;
  isProcessing: boolean;
  isRefreshingOllama: boolean;
  templates: PromptTemplate[];
  refiningStageId: string | null;
  keyStatuses: ProviderKeyStatusMap;
  contextWindowChanged: boolean;
  handleRefineStagePrompt: (stageId: string) => void;
  handleRefreshOllama: () => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;
  saveTemplate: SaveTemplateFn;
}

export function TranslationTabPanel({
  config,
  setConfig,
  translationsExist,
  isProcessing,
  isRefreshingOllama,
  templates,
  refiningStageId,
  keyStatuses,
  contextWindowChanged,
  handleRefineStagePrompt,
  handleRefreshOllama,
  updateStage,
  saveTemplate,
}: TranslationTabPanelProps) {
  const { t } = useTranslation();
  const isOverride = (config.blobBudgetTokens ?? 0) > 0;
  const auto = calculateBlobBudget(config.stages);
  const stageTemplates = templates.filter((tmpl) => tmpl.context === 'stage');
  const blobLocked = translationsExist || isProcessing;

  const blobContextSection = (
    <PanelSection
      icon={FileText}
      label={t('pipeline.blobContext')}
      hint={t('pipeline.blobContextExplainer')}
      actions={isOverride ? (
        <IconButton
          size="sm"
          onClick={() => setConfig((prev) => ({ ...prev, blobBudgetTokens: 0 }))}
          disabled={blobLocked}
          title={t('pipeline.blobContextReset')}
        >
          <RotateCcw size={13} />
        </IconButton>
      ) : undefined}
    >
      <div className={SETTING_LIST_CLASSNAME}>
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('pipeline.blobOverrideToggle')}
            // Spenta, la misura la decide il modello più stretto delle fasi:
            // il suggerimento dice quale e quanto.
            hint={isOverride
              ? undefined
              : t('pipeline.blobContextAutoDesc', { tokens: auto.budget.toLocaleString(), model: auto.modelId || 'ollama' })}
            checked={isOverride}
            disabled={blobLocked}
            onChange={() => setConfig((prev) => ({ ...prev, blobBudgetTokens: isOverride ? 0 : auto.budget }))}
          />
        </div>
        {isOverride && (
          <>
            <NumberSettingRow
              label={t('pipeline.blobBudgetTokens')}
              value={config.blobBudgetTokens ?? auto.budget}
              min={1}
              unit={t('pipeline.unitTokens')}
              wide
              disabled={blobLocked}
              onChange={(raw) => setConfig((prev) => ({ ...prev, blobBudgetTokens: Math.max(1, Number(raw) || 1) }))}
            />
            <NumberSettingRow
              label={t('pipeline.blobOverlap')}
              hint={t('pipeline.blobOverlapHint')}
              value={config.blobOverlap ?? DEFAULT_BLOB_OVERLAP}
              min={0}
              unit={t('pipeline.unitChunks')}
              disabled={blobLocked}
              onChange={(raw) => setConfig((prev) => ({ ...prev, blobOverlap: Math.max(0, Number(raw) || 0) }))}
            />
          </>
        )}
      </div>
    </PanelSection>
  );

  return (
    <div
      id="pconfig-panel-translation"
      role="tabpanel"
      aria-labelledby="pconfig-tab-translation"
      className="space-y-8"
    >
      {/* Segnale di stato, non spiegazione: compare solo quando la misura dei
          frammenti decisa all'importazione non torna più con i modelli scelti. */}
      {contextWindowChanged && (
        <div className="flex items-center gap-2 text-xs text-editorial-warning">
          <ShieldCheck size={12} className="shrink-0" />
          <span>{t('pipeline.modelContextWindowChangedHint')}</span>
        </div>
      )}

      {config.stages.map((stage) => (
        <StageCard
          key={stage.id}
          stage={stage}
          templates={stageTemplates}
          isRefining={refiningStageId === stage.id}
          translationsExist={translationsExist}
          isProcessing={isProcessing}
          isRefreshingOllama={isRefreshingOllama}
          keyStatuses={keyStatuses}
          sourceLanguage={config.sourceLanguage}
          targetLanguage={config.targetLanguage}
          glossaryEntries={config.glossary}
          glossaryName={config.assignedGlossaryId ?? ''}
          onUpdate={(updates) => updateStage(stage.id, updates)}
          onRefinePrompt={() => handleRefineStagePrompt(stage.id)}
          onRefreshOllama={handleRefreshOllama}
          saveTemplate={saveTemplate}
        />
      ))}

      {blobContextSection}
    </div>
  );
}
