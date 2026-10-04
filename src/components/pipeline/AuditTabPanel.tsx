import { Cpu, RefreshCw } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, PipelineConfig, PromptTemplate } from '../../types';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { DEFAULT_COHERENCE_PROMPT, DEFAULT_JUDGE_PROMPT } from '../../constants';
import { PanelSection, SECTION_SETTING_LIST_CLASSNAME, ToggleRow } from '../ui';
import { PipelinePromptEditor } from './PipelinePromptEditor';
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
  canRefine: boolean;
  judgeRefineLabel: string;
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
  canRefine,
  judgeRefineLabel,
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

  const confirmPrompt = (field: 'judgePrompt' | 'coherencePrompt') => (text: string, template?: PromptTemplate) =>
    setConfig((prev) => ({ ...prev, [field]: text,
      judgeModel: template?.defaultModel || prev.judgeModel,
      judgeProvider: (template?.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
      ...(template?.defaultProvider ? { reviewProviderOptions: {} } : {}),
    }));

  return (
    <div id="pconfig-panel-audit" role="tabpanel" aria-labelledby="pconfig-tab-audit" className="space-y-8">
      <PanelSection icon={RefreshCw} label={t('pipeline.judgeRefineLoopSectionLabel')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <div className="py-2.5">
            <ToggleRow
              icon={null}
              label={t('pipeline.judgeRefineLoop')}
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
      </PanelSection>

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

      <PipelinePromptEditor
        label={t('pipeline.judgePromptLabel')}
        hint={t('pipeline.judgePromptHint')}
        value={config.judgePrompt}
        placeholder={t('pipeline.auditPlaceholder')}
        templates={auditTemplates}
        templateContext="audit"
        canRefine={canRefine}
        refineLabel={judgeRefineLabel}
        refineDisabledReason={refineDisabledReason}
        onConfirm={confirmPrompt('judgePrompt')}
        saveTemplate={saveTemplate}
        model={config.judgeModel}
        provider={config.judgeProvider}
        defaultValue={DEFAULT_JUDGE_PROMPT}
        disabledReason={editDisabledReason}
      />

      <PipelinePromptEditor
        label={t('pipeline.coherencePromptLabel')}
        hint={t('pipeline.coherencePromptHint')}
        value={config.coherencePrompt ?? ''}
        placeholder={t('pipeline.coherencePromptPlaceholder')}
        templates={auditTemplates}
        templateContext="audit"
        canRefine={canRefine}
        refineLabel={judgeRefineLabel}
        refineDisabledReason={refineDisabledReason}
        onConfirm={confirmPrompt('coherencePrompt')}
        saveTemplate={saveTemplate}
        model={config.judgeModel}
        provider={config.judgeProvider}
        defaultValue={DEFAULT_COHERENCE_PROMPT}
        disabledReason={editDisabledReason}
      />
    </div>
  );
}
