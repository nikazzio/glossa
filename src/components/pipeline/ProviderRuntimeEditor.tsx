import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, OllamaConfig, ProviderRuntimeConfig } from '../../types';
import { defaultOllamaConfig } from '../../utils/providerOptions';
import { advancedOptionsSchema } from '../../schemas/externalData';
import { FIELD_INLINE_CLASSNAME, FIELD_MONO_CLASSNAME, FieldLabel, Select, SettingRow, ToggleRow } from '../ui';
import { NumberSettingRow } from './NumberSettingRow';

const SETTING_LIST_CLASSNAME = 'divide-y divide-rule border-y border-rule';
const OLLAMA_SAMPLING_STEP = 0.05;

interface ProviderRuntimeEditorProps {
  provider: ModelProvider;
  value?: ProviderRuntimeConfig;
  onChange: (next: ProviderRuntimeConfig | undefined) => void;
  title: string;
  hint: string;
  /**
   * La temperatura scritta qui non viene usata: succede al giudice su Ollama,
   * dove la risposta è vincolata a uno schema e il decoding deve essere
   * deterministico. Dirlo dove il campo si compila è l'unico posto utile.
   */
  temperatureIgnored?: boolean;
  disabled?: boolean;
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNullableNumber(value: string): number | null | undefined {
  if (value.trim() === '') return null;
  return parseOptionalNumber(value);
}

export function ProviderRuntimeEditor({
  provider,
  value,
  onChange,
  title,
  hint,
  temperatureIgnored = false,
  disabled = false,
}: ProviderRuntimeEditorProps) {
  const { t } = useTranslation();
  const textareaId = useId();
  const overrideEnabled = Boolean(value?.ollama);
  const ollama = {
    ...defaultOllamaConfig(),
    ...(value?.ollama ?? {}),
  };
  const advancedEnabled = overrideEnabled && ollama.useAdvancedOptions === true;
  const [advancedJson, setAdvancedJson] = useState(
    JSON.stringify(ollama.advancedOptions ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setAdvancedJson(
      JSON.stringify(
        ({
          ...defaultOllamaConfig(),
          ...(value?.ollama ?? {}),
        }).advancedOptions ?? {},
        null,
        2,
      ),
    );
    setJsonError(null);
  }, [value?.ollama]);

  if (provider !== 'ollama') return null;

  const setOverrideEnabled = (enabled: boolean) => {
    if (!enabled) {
      onChange(undefined);
      return;
    }
    onChange({
      ...value,
      ollama: value?.ollama ?? defaultOllamaConfig(),
    });
  };

  const patchOllama = (updates: Partial<OllamaConfig>) => {
    onChange({
      ...value,
      ollama: {
        ...ollama,
        ...updates,
      },
    });
  };

  const optionalNumber = (key: 'temperature' | 'topP') => (raw: string) => {
    const parsed = parseOptionalNumber(raw);
    if (parsed !== undefined) patchOllama({ [key]: parsed });
  };
  const nullableNumber = (key: 'seed' | 'numCtx' | 'numPredict') => (raw: string) => {
    const parsed = parseNullableNumber(raw);
    if (parsed !== undefined) patchOllama({ [key]: parsed });
  };
  const typedDisabled = disabled || advancedEnabled;

  const handleAdvancedJsonChange = (next: string) => {
    setAdvancedJson(next);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(next);
    } catch {
      setJsonError(t('pipeline.providerOptions.invalidJson'));
      return;
    }
    const parsed = advancedOptionsSchema.safeParse(parsedJson);
    if (!parsed.success) {
      setJsonError(t('pipeline.providerOptions.invalidJsonObject'));
      return;
    }
    patchOllama({ advancedOptions: parsed.data });
    setJsonError(null);
  };

  return (
    <div className={SETTING_LIST_CLASSNAME}>
      <div className="py-2.5">
        <ToggleRow
          icon={null}
          label={title}
          hint={hint}
          checked={overrideEnabled}
          disabled={disabled}
          onChange={() => setOverrideEnabled(!overrideEnabled)}
        />
      </div>
      {overrideEnabled && (
        <>
          <NumberSettingRow
            label={t('pipeline.providerOptions.temperature')}
            hint={temperatureIgnored ? t('pipeline.providerOptions.temperatureIgnored') : undefined}
            value={ollama.temperature ?? ''}
            step={OLLAMA_SAMPLING_STEP}
            disabled={typedDisabled}
            onChange={optionalNumber('temperature')}
          />
          <NumberSettingRow
            label={t('pipeline.providerOptions.topP')}
            value={ollama.topP ?? ''}
            step={OLLAMA_SAMPLING_STEP}
            disabled={typedDisabled}
            onChange={optionalNumber('topP')}
          />
          <NumberSettingRow
            label={t('pipeline.providerOptions.seed')}
            value={ollama.seed ?? ''}
            placeholder={t('pipeline.providerOptions.optional')}
            wide
            disabled={typedDisabled}
            onChange={nullableNumber('seed')}
          />
          <NumberSettingRow
            label={t('pipeline.providerOptions.numCtx')}
            value={ollama.numCtx ?? ''}
            placeholder={t('pipeline.providerOptions.optional')}
            unit={t('pipeline.unitTokens')}
            wide
            disabled={typedDisabled}
            onChange={nullableNumber('numCtx')}
          />
          <NumberSettingRow
            label={t('pipeline.providerOptions.numPredict')}
            value={ollama.numPredict ?? ''}
            placeholder={t('pipeline.providerOptions.optional')}
            unit={t('pipeline.unitTokens')}
            wide
            disabled={typedDisabled}
            onChange={nullableNumber('numPredict')}
          />
          <SettingRow label={t('pipeline.providerOptions.keepAlive')}>
            <input
              type="text"
              value={String(ollama.keepAlive ?? '')}
              onChange={(e) => patchOllama({ keepAlive: e.target.value })}
              disabled={disabled}
              aria-label={t('pipeline.providerOptions.keepAlive')}
              className={`${FIELD_INLINE_CLASSNAME} w-24 font-mono`}
            />
            <span className="w-16" aria-hidden="true" />
          </SettingRow>
          <SettingRow label={t('pipeline.providerOptions.think')}>
            <Select
              value={String(ollama.think)}
              size="md"
              disabled={disabled}
              ariaLabel={t('pipeline.providerOptions.think')}
              onChange={(next) => {
                patchOllama({
                  think: next === 'false'
                    ? false
                    : next === 'true'
                      ? true
                      : next as 'low' | 'medium' | 'high',
                });
              }}
              options={[
                { value: 'false', label: t('pipeline.providerOptions.thinkDisabled') },
                { value: 'true', label: t('pipeline.providerOptions.thinkEnabled') },
                { value: 'low', label: t('pipeline.providerOptions.thinkLow') },
                { value: 'medium', label: t('pipeline.providerOptions.thinkMedium') },
                { value: 'high', label: t('pipeline.providerOptions.thinkHigh') },
              ]}
            />
          </SettingRow>
          <div className="py-2.5">
            <ToggleRow
              icon={null}
              label={t('pipeline.providerOptions.enableAdvanced')}
              hint={t('pipeline.providerOptions.enableAdvancedHint')}
              checked={advancedEnabled}
              disabled={disabled}
              onChange={() => patchOllama({ useAdvancedOptions: !advancedEnabled })}
            />
          </div>
          {advancedEnabled && (
            <div className="space-y-2 py-2.5">
              <FieldLabel htmlFor={textareaId} hint={t('pipeline.providerOptions.advancedHint')} block>
                {t('pipeline.providerOptions.advancedJson')}
              </FieldLabel>
              <textarea
                id={textareaId}
                value={advancedJson}
                onChange={(e) => handleAdvancedJsonChange(e.target.value)}
                disabled={disabled}
                rows={6}
                spellCheck={false}
                className={`${FIELD_MONO_CLASSNAME} resize-y leading-relaxed`}
              />
              {jsonError && (
                <p role="alert" className="flex items-center gap-2 text-xs text-editorial-danger">
                  <AlertTriangle size={13} aria-hidden="true" />
                  {jsonError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
