import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AuditPromptEditor } from '../pipeline/AuditPromptEditor';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER, providerSupportsVision } from '../../models/catalog';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider, PromptTemplate } from '../../types';
import { FieldLabel, Select } from '../ui';

interface OcrSettingsSectionProps {
  /** '' = nessun default a questo livello — la select del provider resta vuota. */
  provider: ModelProvider | '';
  model: string;
  prompt: string;
  onProviderChange: (provider: ModelProvider | '', model: string) => void;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
}

/** Impostazioni OCR/HTR a livello workspace (#220): il fornitore e il modello
 *  da cui parte ogni documento nuovo, e il testo da cui parte ogni pagina mai
 *  toccata. Da qui in poi la pagina fa storia a sé: quello che si scrive nello
 *  Studio vale per quella pagina e non torna mai indietro fin qui.
 *
 *  L'editor del prompt è lo stesso componente usato nello Studio e nel
 *  giudizio della traduzione — modelli salvati, riscrittura assistita e
 *  ripristino del testo predefinito sono già lì dentro. */
export function OcrSettingsSection({
  provider,
  model,
  prompt,
  onProviderChange,
  onModelChange,
  onPromptChange,
}: OcrSettingsSectionProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { templates, isLoaded, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);

  const modelOptions = provider ? getVisionCapableModelIds(provider, ollamaModels) : [];
  const ocrTemplates = templates.filter((template) => template.context === 'ocr');
  const canRefine = provider ? canRefineWithProvider(provider, keyStatuses) : false;
  const refineLabel = provider ? formatProviderModelLabel(provider, model) : '';

  const handleProviderChange = (nextProvider: ModelProvider | '') => {
    if (!nextProvider) {
      onProviderChange('', '');
      return;
    }
    onProviderChange(nextProvider, getVisionCapableModelIds(nextProvider, ollamaModels)[0] ?? '');
  };

  const handleRefine = async () => {
    if (!provider || !prompt.trim() || !model.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(prompt, provider, model, 'ocr');
      onPromptChange(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleApplyTemplate = (template: PromptTemplate) => {
    onPromptChange(template.prompt);
    if (template.defaultProvider) {
      const nextProvider = template.defaultProvider as ModelProvider;
      onProviderChange(
        nextProvider,
        template.defaultModel ?? getVisionCapableModelIds(nextProvider, ollamaModels)[0] ?? '',
      );
      return;
    }
    if (template.defaultModel) onModelChange(template.defaultModel);
  };

  const providerOptions = [
    ...(provider === '' ? [{ value: '', label: t('transcription.assist.noProvider'), disabled: true }] : []),
    ...LLM_PROVIDER_ORDER.map((entry) => ({
      value: entry,
      label: entry,
      // Senza chiave, o senza un modello che legga immagini, quel fornitore
      // non può servire una lettura: si mostra spento.
      disabled:
        (entry !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[entry] === false) ||
        !providerSupportsVision(entry, ollamaModels),
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FieldLabel icon={<Cpu size={11} className="shrink-0 text-editorial-accent" />}>
          {t('workspace.settings.ocrDefaultModel')}
        </FieldLabel>
        <div className="flex gap-2">
          <Select
            value={provider}
            onChange={(value) => handleProviderChange(value as ModelProvider | '')}
            className="w-28 shrink-0 font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={providerOptions}
          />
          {modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={model}
                onChange={onModelChange}
                className="flex-1 font-mono"
                ariaLabel={t('workspace.settings.ocrDefaultModel')}
                options={modelOptions.map((entry) => ({ value: entry, label: entry }))}
              />
              {provider && <ModelCapabilityHint provider={provider} model={model} iconOnly />}
            </div>
          ) : (
            // Solo Ollama arriva qui: la lista dei modelli locali è dinamica e
            // nessun elenco statico può dire quali leggono immagini.
            <input
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('workspace.settings.ocrDefaultModel')}
            />
          )}
        </div>
      </div>

      <AuditPromptEditor
        label={t('workspace.settings.ocrDefaultPrompt')}
        hint={t('workspace.settings.ocrDefaultPromptHint')}
        value={prompt}
        placeholder={DEFAULT_OCR_PROMPT}
        templates={ocrTemplates}
        isRefining={isRefining}
        canRefine={canRefine}
        refineLabel={refineLabel}
        onRefine={() => void handleRefine()}
        onChange={onPromptChange}
        onApplyTemplate={handleApplyTemplate}
        saveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        defaultModel={model}
        defaultProvider={provider || undefined}
        defaultValue={DEFAULT_OCR_PROMPT}
        onReset={() => onPromptChange('')}
        templateContext="ocr"
        templateWorkflow="transcription"
      />
    </div>
  );
}
