import { useState } from 'react';
import { Loader2, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, ProviderRuntimeConfig } from '../../types';
import {
  ensureModelInList,
  getKnownModelIds,
  getModelStatus,
  getSelectableModelIds,
  LLM_PROVIDER_ORDER,
} from '../../models/catalog';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import { useConfigStore } from '../../stores/configStore';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import { useUiStore } from '../../stores/uiStore';
import { DeprecatedModelBadge } from '../models/DeprecatedModelBadge';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { TemperatureControl } from '../models/TemperatureControl';
import { FIELD_MONO_CLASSNAME, IconButton, Select } from '../ui';
import { AnthropicCacheConfig } from './AnthropicCacheConfig';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { getModelTuning, withReasoningEffort, withTemperature } from './modelTuning';

interface ModelSectionProps {
  provider: ModelProvider;
  model: string;
  options: ProviderRuntimeConfig | undefined;
  keyStatuses: ProviderKeyStatusMap;
  onProviderChange: (provider: ModelProvider) => void;
  onModelChange: (model: string) => void;
  onOptionsChange: (options: ProviderRuntimeConfig | undefined) => void;
  /** Esistono traduzioni fatte con questo modello: si cambia solo dopo aver
   *  aperto il lucchetto. */
  locked?: boolean;
  /** Pipeline in esecuzione: tutto in sola lettura. */
  disabled?: boolean;
  /** Fornitori compatibili OpenAI configurati dall'utente (solo le fasi). */
  allowCustom?: boolean;
  customProviderId?: string;
  onCustomProviderChange?: (id: string | undefined) => void;
  /** Il suggerimento sull'adattezza del modello vale per le traduzioni. */
  showCapability?: boolean;
  isRefreshingOllama?: boolean;
  onRefreshOllama?: () => void;
  runtimeTitle: string;
  runtimeHint: string;
  temperatureIgnored?: boolean;
}

function modelLabel(provider: ModelProvider, model: string, deprecatedSuffix: string): string {
  const status = getModelStatus(provider, model);
  if (status === 'preview') return `${model} (preview)`;
  if (status === 'deprecated') return `${model} (${deprecatedSuffix})`;
  return model;
}

/** La sezione Modello di una chiamata a un modello: fornitore, modello e
 *  lucchetto su una riga, la taratura sotto, le opzioni del fornitore in
 *  fondo. Stessa forma della scheda OCR delle Trascrizioni. */
export function ModelSection({
  provider,
  model,
  options,
  keyStatuses,
  onProviderChange,
  onModelChange,
  onOptionsChange,
  locked = false,
  disabled = false,
  allowCustom = false,
  customProviderId,
  onCustomProviderChange,
  showCapability = false,
  isRefreshingOllama = false,
  onRefreshOllama,
  runtimeTitle,
  runtimeHint,
  temperatureIgnored = false,
}: ModelSectionProps) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const ollamaStatus = useConfigStore((s) => s.ollamaStatus);
  const customProfiles = useCustomProviderStore((s) => s.profiles);
  const showDeprecatedModels = useUiStore((s) => s.showDeprecatedModels);
  const [unlocked, setUnlocked] = useState(false);

  const modelDisabled = disabled || (locked && !unlocked);
  const canListDeprecated = provider !== 'ollama' && provider !== 'custom';
  const modelOptions = ensureModelInList(
    showDeprecatedModels && canListDeprecated
      ? getKnownModelIds(provider, { includeDeprecated: true })
      : getSelectableModelIds(provider, ollamaModels),
    model,
  );
  const tuning = getModelTuning(provider, model, options);
  const ollamaOffline = provider === 'ollama' && ollamaStatus === 'disconnected';
  const keyMissing = keyStatuses as Partial<Record<string, boolean>>;

  const providerOptions = [
    ...LLM_PROVIDER_ORDER.map((entry) => ({
      value: entry,
      label: entry,
      disabled: entry === 'ollama' ? ollamaModels.length === 0 : keyMissing[entry] === false,
    })),
    ...(allowCustom ? [{ value: 'custom', label: 'custom' }] : []),
  ];

  const modelTextField = (
    <input
      value={model}
      onChange={(e) => onModelChange(e.target.value)}
      disabled={modelDisabled}
      placeholder={t('ollama.modelPlaceholder')}
      className={`${FIELD_MONO_CLASSNAME} min-w-0 flex-1 py-1`}
      aria-label={t('pipeline.stageModelLabel')}
    />
  );

  const modelField = provider === 'custom' ? (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Select
        value={customProviderId ?? ''}
        onChange={(value) => onCustomProviderChange?.(value || undefined)}
        disabled={modelDisabled}
        className="flex-1"
        ariaLabel={t('settings.customProvider.sectionTitle')}
        options={[
          ...(customProfiles.length === 0 ? [{ value: '', label: t('settings.customProvider.add') }] : []),
          ...customProfiles.map((profile) => ({ value: profile.id, label: profile.name })),
        ]}
      />
      {modelTextField}
    </div>
  ) : modelOptions.length > 0 ? (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Select
        value={model}
        onChange={onModelChange}
        disabled={modelDisabled}
        className="flex-1"
        ariaLabel={t('pipeline.stageModelLabel')}
        options={modelOptions.map((entry) => ({
          value: entry,
          label: modelLabel(provider, entry, t('models.deprecatedShort')),
        }))}
      />
      {showCapability && <ModelCapabilityHint provider={provider} model={model} iconOnly />}
      <DeprecatedModelBadge provider={provider} model={model} />
    </div>
  ) : modelTextField;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={provider}
          onChange={(value) => onProviderChange(value as ModelProvider)}
          disabled={modelDisabled}
          className="font-bold uppercase"
          ariaLabel={t('models.provider')}
          options={providerOptions}
        />
        {modelField}
        {ollamaOffline && onRefreshOllama && (
          <IconButton
            size="sm"
            tone="danger"
            onClick={onRefreshOllama}
            disabled={isRefreshingOllama}
            title={t('pipeline.ollamaOfflineReload')}
            className="shrink-0"
          >
            {isRefreshingOllama ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </IconButton>
        )}
        {locked && !disabled && (
          <IconButton
            size="sm"
            tone={unlocked ? 'accent' : 'default'}
            onClick={() => setUnlocked(!unlocked)}
            title={unlocked ? t('pipeline.lockModelChange') : t('pipeline.unlockModelChange')}
            ariaPressed={unlocked}
            className="shrink-0"
          >
            {unlocked ? <LockOpen size={13} /> : <Lock size={13} />}
          </IconButton>
        )}
      </div>
      {(tuning.showReasoning || tuning.supportsTemperature) && (
        <div className="flex items-center gap-3">
          {tuning.showReasoning && (
            <ReasoningPicker
              value={tuning.reasoningEffort}
              showNone={tuning.reasoningOptional}
              disabled={modelDisabled}
              onChange={(effort) => onOptionsChange(withReasoningEffort(provider, options, effort))}
            />
          )}
          {tuning.supportsTemperature && (
            <TemperatureControl
              value={tuning.temperature}
              max={tuning.temperatureMax}
              disabled={modelDisabled || tuning.temperatureBlockedByReasoning}
              onChange={(temperature) => onOptionsChange(withTemperature(provider, options, temperature))}
            />
          )}
        </div>
      )}
      <ProviderRuntimeEditor
        provider={provider}
        value={options}
        onChange={onOptionsChange}
        title={runtimeTitle}
        hint={runtimeHint}
        temperatureIgnored={temperatureIgnored}
        disabled={disabled}
      />
      {provider === 'anthropic' && (
        <AnthropicCacheConfig
          value={options?.anthropic}
          onChange={(anthropic) => onOptionsChange({ ...options, anthropic })}
          disabled={disabled}
        />
      )}
    </div>
  );
}
