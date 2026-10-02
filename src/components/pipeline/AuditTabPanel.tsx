import { Cpu, RefreshCw, Scale } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, PipelineConfig, PromptTemplate } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { DEFAULT_COHERENCE_PROMPT, DEFAULT_JUDGE_PROMPT } from '../../constants';
import { PanelSection, ToggleRow } from '../ui';
import { AuditPromptEditor } from './AuditPromptEditor';
import { ModelSection } from './ModelSection';
import { NumberSettingRow } from './NumberSettingRow';
import { withoutReasoningEffort } from './modelTuning';

const REFINE_LOOP_MIN = 1;
const REFINE_LOOP_MAX = 3;
const REFINE_LOOP_DEFAULT = 2;

interface AuditTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  isProcessing: boolean;
  auditTemplates: PromptTemplate[];
  isRefiningJudge: boolean;
  isRefiningCoherence: boolean;
  canRefine: boolean;
  judgeRefineLabel: string;
  handleRefineJudgePrompt: () => void;
  handleRefineCoherencePrompt: () => void;
  handleJudgeProviderChange: (provider: ModelProvider) => void;
  keyStatuses: ProviderKeyStatusMap;
  isRefreshingOllama: boolean;
  onRefreshOllama: () => void;
  saveTemplate: SaveTemplateFn;
}

/** Controllo qualità: ciclo di raffinamento, il modello del giudizio (lo
 *  stesso della verifica di coerenza) e i due prompt. */
export function AuditTabPanel({
  config,
  setConfig,
  isProcessing,
  auditTemplates,
  isRefiningJudge,
  isRefiningCoherence,
  canRefine,
  judgeRefineLabel,
  handleRefineJudgePrompt,
  handleRefineCoherencePrompt,
  handleJudgeProviderChange,
  keyStatuses,
  isRefreshingOllama,
  onRefreshOllama,
  saveTemplate,
}: AuditTabPanelProps) {
  const { t } = useTranslation();
  const refineLoop = config.judgeRefineLoop ?? false;
  const editDisabledReason = isProcessing ? t('document.operationsRunning') : undefined;
  const refineDisabledReason = t('pipeline.reasonMissingKey', { provider: config.judgeProvider });

  const applyTemplate = (field: 'judgePrompt' | 'coherencePrompt') => (template: PromptTemplate) =>
    setConfig((prev) => ({
      ...prev,
      [field]: template.prompt,
      judgeModel: template.defaultModel || prev.judgeModel,
      judgeProvider: (template.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
    }));

  return (
    <div id="pconfig-panel-audit" role="tabpanel" aria-labelledby="pconfig-tab-audit" className="space-y-8">
      <div className="divide-y divide-rule border-y border-rule">
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('pipeline.judgeRefineLoopSectionLabel')}
            checked={refineLoop}
            disabled={isProcessing}
            onChange={() => setConfig((prev) => ({ ...prev, judgeRefineLoop: !(prev.judgeRefineLoop ?? false) }))}
          />
        </div>
        {refineLoop && (
          <NumberSettingRow
            label={t('pipeline.judgeRefineLoopMaxIter')}
            value={config.judgeRefineLoopMaxIter ?? REFINE_LOOP_DEFAULT}
            min={REFINE_LOOP_MIN}
            max={REFINE_LOOP_MAX}
            disabled={isProcessing}
            onChange={(raw) =>
              setConfig((prev) => ({
                ...prev,
                judgeRefineLoopMaxIter: Math.max(REFINE_LOOP_MIN, Math.min(REFINE_LOOP_MAX, parseInt(raw, 10) || REFINE_LOOP_MIN)),
              }))
            }
          />
        )}
      </div>

      <PanelSection icon={Cpu} label={t('pipeline.auditModelLabel')}>
        <ModelSection
          provider={config.judgeProvider}
          model={config.judgeModel}
          options={config.reviewProviderOptions}
          keyStatuses={keyStatuses}
          onProviderChange={handleJudgeProviderChange}
          onModelChange={(judgeModel) =>
            setConfig((prev) => ({
              ...prev,
              judgeModel,
              reviewProviderOptions: withoutReasoningEffort(prev.judgeProvider, prev.reviewProviderOptions),
            }))
          }
          onOptionsChange={(reviewProviderOptions) => setConfig((prev) => ({ ...prev, reviewProviderOptions }))}
          disabled={isProcessing}
          isRefreshingOllama={isRefreshingOllama}
          onRefreshOllama={onRefreshOllama}
          runtimeTitle={t('pipeline.providerOptions.reviewTitle')}
          runtimeHint={t('pipeline.providerOptions.reviewHint')}
          // Il giudizio arriva in un formato vincolato, e lì il decoding deve
          // essere deterministico: la temperatura scritta qui non viene usata.
          temperatureIgnored={config.judgeProvider === 'ollama'}
        />
      </PanelSection>

      <AuditPromptEditor
        label={t('pipeline.judgePromptLabel')}
        hint={t('pipeline.judgePromptHint')}
        value={config.judgePrompt}
        placeholder={t('pipeline.auditPlaceholder')}
        templates={auditTemplates}
        isRefining={isRefiningJudge}
        canRefine={canRefine}
        refineLabel={judgeRefineLabel}
        refineDisabledReason={refineDisabledReason}
        onRefine={handleRefineJudgePrompt}
        onChange={(value) => setConfig((prev) => ({ ...prev, judgePrompt: value }))}
        onApplyTemplate={applyTemplate('judgePrompt')}
        saveTemplate={saveTemplate}
        defaultModel={config.judgeModel}
        defaultProvider={config.judgeProvider}
        icon={<Scale size={11} />}
        defaultValue={DEFAULT_JUDGE_PROMPT}
        onReset={() => setConfig((prev) => ({ ...prev, judgePrompt: DEFAULT_JUDGE_PROMPT }))}
        editDisabledReason={editDisabledReason}
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
        refineDisabledReason={refineDisabledReason}
        onRefine={handleRefineCoherencePrompt}
        onChange={(value) => setConfig((prev) => ({ ...prev, coherencePrompt: value }))}
        onApplyTemplate={applyTemplate('coherencePrompt')}
        saveTemplate={saveTemplate}
        defaultModel={config.judgeModel}
        defaultProvider={config.judgeProvider}
        icon={<RefreshCw size={11} />}
        defaultValue={DEFAULT_COHERENCE_PROMPT}
        onReset={() => setConfig((prev) => ({ ...prev, coherencePrompt: DEFAULT_COHERENCE_PROMPT }))}
        editDisabledReason={editDisabledReason}
      />
    </div>
  );
}
