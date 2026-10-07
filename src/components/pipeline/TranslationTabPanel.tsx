import { AlertTriangle, FileText, Languages, Network, RotateCcw, Wand2 } from 'lucide-react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PipelineConfig, PipelineStageConfig, PromptTemplate } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { calculateBlobBudget } from '../../models/catalog';
import { IconButton, PanelSection, SECTION_SETTING_LIST_CLASSNAME, TabStrip, ToggleRow } from '../ui';
import { NumberSettingRow } from './NumberSettingRow';
import { StageCard } from './StageCard';

const DEFAULT_BLOB_OVERLAP = 1;

interface TranslationTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  translationsExist: boolean;
  isProcessing: boolean;
  isRefreshingOllama: boolean;
  templates: PromptTemplate[];
  keyStatuses: ProviderKeyStatusMap;
  contextWindowChanged: boolean;
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
  keyStatuses,
  contextWindowChanged,
  handleRefreshOllama,
  updateStage,
  saveTemplate,
}: TranslationTabPanelProps) {
  const { t } = useTranslation();
  const isOverride = (config.blobBudgetTokens ?? 0) > 0;
  const auto = calculateBlobBudget(config.stages);
  const stageTemplates = templates.filter((tmpl) => tmpl.context === 'stage');
  const blobLocked = translationsExist || isProcessing;
  const [selectedId, setSelectedId] = useState(config.stages.find((stage) => stage.enabled)?.id ?? '');
  const activeStage = config.stages.find((stage) => stage.enabled && stage.id === selectedId)
    ?? config.stages.find((stage) => stage.enabled);
  useEffect(() => { if (activeStage) setSelectedId(activeStage.id); }, [activeStage]);
  const icons = { translation: Languages, 'deepl-translation': Network, refine: Wand2, format: FileText };
  const tabs = config.stages.map((stage) => {
    const Icon = icons[stage.role ?? 'translation'];
    const label = t(`pipeline.stageRole.${stage.role ?? 'translation'}`);
    return { id: stage.id, icon: <Icon size={14} />, disabled: !stage.enabled,
      label: stage.enabled ? label : `${label} — ${t('pipeline.phaseNotUsed')}` };
  });


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
      <div className={SECTION_SETTING_LIST_CLASSNAME}>
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
          <AlertTriangle size={12} className="shrink-0" />
          <span>{t('pipeline.modelContextWindowChangedHint')}</span>
        </div>
      )}

      <TabStrip tabs={tabs} activeId={activeStage?.id ?? ''} onChange={setSelectedId}
        ariaLabel={t('pipeline.tabStages')} idPrefix="pipeline-stage" />
      {activeStage && <div id={`pipeline-stage-panel-${activeStage.id}`} role="tabpanel" aria-labelledby={`pipeline-stage-tab-${activeStage.id}`}>
        <StageCard
          key={activeStage.id}
          stage={activeStage}
          templates={stageTemplates}
          translationsExist={translationsExist}
          isProcessing={isProcessing}
          isRefreshingOllama={isRefreshingOllama}
          keyStatuses={keyStatuses}
          onUpdate={(updates) => updateStage(activeStage.id, updates)}
          onRefreshOllama={handleRefreshOllama}
          saveTemplate={saveTemplate}
        />
      </div>}

      {blobContextSection}
    </div>
  );
}
