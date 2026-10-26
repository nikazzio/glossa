import { FileText, Languages, Network, Wand2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, PipelineStageConfig, PromptTemplate, StageRole } from '../../types';
import { getKnownModelIds } from '../../models/catalog';
import { canRefineWithProvider, formatProviderModelLabel, type ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { useConfigStore } from '../../stores/configStore';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { STAGE_TEMPLATES } from '../../pipeline/pipelineModes';
import { PanelSection } from '../ui';
import { PipelinePromptEditor } from './PipelinePromptEditor';
import { DeeplStageConfig } from './DeeplStageConfig';
import { ModelSection } from './ModelSection';
import { withoutReasoningEffort } from './modelTuning';

const STAGE_ROLE_ICON: Record<StageRole, LucideIcon> = {
  translation: Languages,
  refine: Wand2,
  format: FileText,
  'deepl-translation': Network,
};

/** Solo i ruoli che non si spiegano da sé portano una spiegazione nel titolo. */
const ROLES_WITH_HINT: ReadonlySet<StageRole> = new Set(['refine', 'format']);

interface StageCardProps {
  stage: PipelineStageConfig;
  templates: PromptTemplate[];
  translationsExist: boolean;
  isProcessing: boolean;
  isRefreshingOllama: boolean;
  keyStatuses: ProviderKeyStatusMap;
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRefreshOllama: () => void;
  saveTemplate: SaveTemplateFn;
}

/** Una fase della pipeline: titolo col ruolo, poi Modello e Prompt come nella
 *  scheda OCR delle Trascrizioni (DeepL ha le sue impostazioni al posto di
 *  entrambi). */
export function StageCard({
  stage,
  templates,
  translationsExist,
  isProcessing,
  isRefreshingOllama,
  keyStatuses,
  onUpdate,
  onRefreshOllama,
  saveTemplate,
}: StageCardProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const customProfiles = useCustomProviderStore((s) => s.profiles);

  const role = stage.role ?? 'translation';
  const canRefine = canRefineWithProvider(stage.provider, keyStatuses);
  const editDisabledReason = isProcessing
    ? t('document.operationsRunning')
    : translationsExist
      ? t('pipeline.reasonTranslationsExist')
      : undefined;

  const handleProviderChange = (provider: ModelProvider) => {
    if (provider === 'custom') {
      onUpdate({ provider: 'custom', customProviderId: customProfiles[0]?.id, model: '', providerOptions: {} });
      return;
    }
    const models = provider === 'ollama' ? ollamaModels : getKnownModelIds(provider);
    onUpdate({ provider, model: models[0] || '', providerOptions: {}, customProviderId: undefined });
  };

  return (
    <PanelSection
      icon={STAGE_ROLE_ICON[role]}
      label={t(`pipeline.stageRole.${role}`)}
      hint={ROLES_WITH_HINT.has(role) ? t(`pipeline.stageRoleHint.${role}`) : undefined}
    >
      {stage.provider === 'deepl' ? (
        <DeeplStageConfig
          value={stage.providerOptions?.deepl}
          onChange={(deepl) => onUpdate({ providerOptions: { ...stage.providerOptions, deepl } })}
        />
      ) : (
        <>
          <ModelSection
            provider={stage.provider}
            model={stage.model}
            options={stage.providerOptions}
            keyStatuses={keyStatuses}
            onProviderChange={handleProviderChange}
            onModelChange={(model) =>
              onUpdate({ model, providerOptions: withoutReasoningEffort(stage.provider, stage.providerOptions) })
            }
            onOptionsChange={(providerOptions) => onUpdate({ providerOptions })}
            locked={translationsExist}
            disabled={isProcessing}
            allowCustom
            customProviderId={stage.customProviderId}
            onCustomProviderChange={(customProviderId) => onUpdate({ customProviderId })}
            showCapability
            isRefreshingOllama={isRefreshingOllama}
            onRefreshOllama={onRefreshOllama}
            runtimeTitle={t('pipeline.providerOptions.stageTitle')}
            runtimeHint={t('pipeline.providerOptions.stageHint')}
          />
          <PipelinePromptEditor
            label={t('pipeline.prompt')}
            hint=""
            value={stage.prompt}
            placeholder={t('pipeline.stagePromptPlaceholder')}
            templates={templates}
            canRefine={canRefine}
            refineLabel={formatProviderModelLabel(stage.provider, stage.model)}
            refineDisabledReason={t('pipeline.reasonMissingKey', { provider: stage.provider })}
            onConfirm={(prompt, template) => onUpdate({
              prompt,
              ...(template?.defaultModel ? { model: template.defaultModel } : {}),
              ...(template?.defaultProvider ? { provider: template.defaultProvider as ModelProvider, providerOptions: {} } : {}),
            })}
            saveTemplate={saveTemplate}
            model={stage.model}
            provider={stage.provider}
            defaultValue={STAGE_TEMPLATES[role].defaultPrompt}
            templateContext="stage"
            disabledReason={editDisabledReason}
          />
        </>
      )}
    </PanelSection>
  );
}
