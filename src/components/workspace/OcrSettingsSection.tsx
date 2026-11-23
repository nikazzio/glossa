import { Cpu, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PromptPanel } from '../prompt/PromptPanel';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import { canRefineWithProvider, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { getVisionCapableModelIds, LLM_PROVIDER_ORDER, providerSupportsVision } from '../../models/catalog';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider, PromptTemplate } from '../../types';
import { FieldLabel, Select, ToggleRow } from '../ui';
import { FIELD_MONO_CLASSNAME } from '../ui/fieldStyles';

interface OcrSettingsSectionProps {
  /** '' = nessun default a questo livello — la select del provider resta vuota. */
  provider: ModelProvider | '';
  model: string;
  prompt: string;
  onProviderChange: (provider: ModelProvider | '', model: string) => void;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
  /** Note separate dal testo: il modello le scrive a piè di pagina e Glossa
   *  le sposta nella scheda Note. */
  separateNotes: boolean;
  onSeparateNotesChange: (value: boolean) => void;
}

/** Impostazioni OCR/HTR a livello workspace (#220): fornitore, modello e
 *  prompt da cui parte ogni documento. Il prompt si può caricare dalla
 *  libreria; quello che si cambia poi nello Studio vale per quel documento e
 *  non torna mai indietro fin qui.
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
  separateNotes,
  onSeparateNotesChange,
}: OcrSettingsSectionProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { statuses: keyStatuses } = useProviderKeyStatus();

  const modelOptions = provider ? getVisionCapableModelIds(provider, ollamaModels) : [];
  const canRefine = provider ? canRefineWithProvider(provider, keyStatuses) : false;

  const handleProviderChange = (nextProvider: ModelProvider | '') => {
    if (!nextProvider) {
      onProviderChange('', '');
      return;
    }
    onProviderChange(nextProvider, getVisionCapableModelIds(nextProvider, ollamaModels)[0] ?? '');
  };

  // Testo uguale al predefinito dell'applicazione = nessuna scelta salvata.
  const handlePromptChange = (next: string) => {
    onPromptChange(next.trim() === DEFAULT_OCR_PROMPT.trim() ? '' : next);
  };

  const handleTemplateUsed = (template: PromptTemplate) => {
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
              className={`${FIELD_MONO_CLASSNAME} flex-1`}
              aria-label={t('workspace.settings.ocrDefaultModel')}
            />
          )}
        </div>
      </div>

      <PromptPanel
        label={t('workspace.settings.ocrDefaultPrompt')}
        hint={t('workspace.settings.ocrDefaultPromptHint')}
        value={prompt}
        defaultValue={DEFAULT_OCR_PROMPT}
        onSave={handlePromptChange}
        onTemplateUsed={handleTemplateUsed}
        templateContext="ocr"
        templateWorkflow="transcription"
        refine={provider ? {
          provider,
          model,
          blockedReason: canRefine ? null : t('transcription.assist.refineNeedsKey'),
        } : undefined}
      />

      <div className="border-y border-rule py-2.5">
        <ToggleRow
          icon={<MessageSquare size={14} />}
          label={t('workspace.settings.ocrSeparateNotes')}
          hint={t('workspace.settings.ocrSeparateNotesHint')}
          checked={separateNotes}
          onChange={() => onSeparateNotesChange(!separateNotes)}
        />
      </div>
    </div>
  );
}
