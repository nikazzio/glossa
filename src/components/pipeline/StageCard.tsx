import { FileText, Languages, Network, Wand2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlossaryEntry, ModelProvider, PipelineStageConfig, PromptTemplate, StageRole } from '../../types';
import { getKnownModelIds } from '../../models/catalog';
import { canRefineWithProvider, formatProviderModelLabel, type ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { useConfigStore } from '../../stores/configStore';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { STAGE_TEMPLATES } from '../../pipeline/pipelineModes';
import { PanelSection } from '../ui';
import { AuditPromptEditor } from './AuditPromptEditor';
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
  isRefining: boolean;
  translationsExist: boolean;
  isProcessing: boolean;
  isRefreshingOllama: boolean;
  keyStatuses: ProviderKeyStatusMap;
  sourceLanguage: string;
  targetLanguage: string;
  glossaryEntries: GlossaryEntry[];
  glossaryName: string;
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRefinePrompt: () => void;
  onRefreshOllama: () => void;
  saveTemplate: SaveTemplateFn;
}

/** Una fase della pipeline: titolo col ruolo, poi Modello e Prompt come nella
 *  scheda OCR delle Trascrizioni (DeepL ha le sue impostazioni al posto di
 *  entrambi). */
export function StageCard({
  stage,
  templates,
  isRefining,
  translationsExist,
  isProcessing,
  isRefreshingOllama,
  keyStatuses,
  sourceLanguage,
  targetLanguage,
  glossaryEntries,
  glossaryName,
  onUpdate,
  onRefinePrompt,
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
          sourceLang={sourceLanguage}
          targetLanguage={targetLanguage}
          glossaryEntries={glossaryEntries}
          glossaryName={glossaryName}
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
          <AuditPromptEditor
            variant="stage"
            label={t('pipeline.prompt')}
            hint=""
            value={stage.prompt}
            placeholder={t('pipeline.stagePromptPlaceholder')}
            templates={templates}
            isRefining={isRefining}
            canRefine={canRefine}
            refineLabel={formatProviderModelLabel(stage.provider, stage.model)}
            refineDisabledReason={t('pipeline.reasonMissingKey', { provider: stage.provider })}
            onRefine={onRefinePrompt}
            onChange={(prompt) => onUpdate({ prompt })}
            onApplyTemplate={(template) =>
              onUpdate({
                prompt: template.prompt,
                ...(template.defaultModel ? { model: template.defaultModel } : {}),
                ...(template.defaultProvider ? { provider: template.defaultProvider as ModelProvider } : {}),
              })
            }
            saveTemplate={saveTemplate}
            defaultModel={stage.model}
            defaultProvider={stage.provider}
            defaultValue={STAGE_TEMPLATES[role].defaultPrompt}
            onReset={() => onUpdate({ prompt: STAGE_TEMPLATES[role].defaultPrompt })}
            templateContext="stage"
            templateWorkflow="translation"
            editDisabledReason={editDisabledReason}
          />
        </>
      )}
    </PanelSection>
  );
}
