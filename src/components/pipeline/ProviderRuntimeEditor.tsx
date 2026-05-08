import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Braces, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, OllamaConfig, ProviderRuntimeConfig } from '../../types';
import { defaultOllamaConfig } from '../../utils/providerOptions';

interface ProviderRuntimeEditorProps {
  provider: ModelProvider;
  value?: ProviderRuntimeConfig;
  onChange: (next: ProviderRuntimeConfig | undefined) => void;
  title: string;
  hint: string;
}

function parseOptionalNumber(value: string): number | null | undefined {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ProviderRuntimeEditor({
  provider,
  value,
  onChange,
  title,
  hint,
}: ProviderRuntimeEditorProps) {
  const { t } = useTranslation();
  const textareaId = useId();
  const overrideEnabled = Boolean(value?.ollama);
  const ollama = value?.ollama ?? defaultOllamaConfig();
  const advancedEnabled = overrideEnabled && ollama.useAdvancedOptions === true;
  const [advancedJson, setAdvancedJson] = useState(
    JSON.stringify(ollama.advancedOptions ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setAdvancedJson(JSON.stringify((value?.ollama ?? defaultOllamaConfig()).advancedOptions ?? {}, null, 2));
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

  return (
    <section className="rounded-[18px] border border-editorial-border/70 bg-editorial-textbox/20 p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-editorial-accent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {title}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-editorial-muted">{hint}</p>
      </div>

      <ToggleRow
        checked={overrideEnabled}
        label={t('pipeline.providerOptions.enableOverride')}
        hint={t('pipeline.providerOptions.enableOverrideHint')}
        onChange={() => setOverrideEnabled(!overrideEnabled)}
      />

      <div className="grid grid-cols-2 gap-3">
        <LabeledField label={t('pipeline.providerOptions.temperature')}>
          <input
            type="number"
            step="0.05"
            value={ollama.temperature ?? ''}
            onChange={(e) => patchOllama({ temperature: Number(e.target.value) })}
            disabled={!overrideEnabled || advancedEnabled}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
        <LabeledField label={t('pipeline.providerOptions.topP')}>
          <input
            type="number"
            step="0.05"
            value={ollama.topP ?? ''}
            onChange={(e) => patchOllama({ topP: Number(e.target.value) })}
            disabled={!overrideEnabled || advancedEnabled}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
        <LabeledField label={t('pipeline.providerOptions.seed')}>
          <input
            type="number"
            value={ollama.seed ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              if (parsed !== undefined) patchOllama({ seed: parsed as number | null });
            }}
            disabled={!overrideEnabled || advancedEnabled}
            placeholder={t('pipeline.providerOptions.optional')}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
        <LabeledField label={t('pipeline.providerOptions.keepAlive')}>
          <input
            type="text"
            value={String(ollama.keepAlive ?? '')}
            onChange={(e) => patchOllama({ keepAlive: e.target.value })}
            disabled={!overrideEnabled}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
        <LabeledField label={t('pipeline.providerOptions.numCtx')}>
          <input
            type="number"
            value={ollama.numCtx ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              if (parsed !== undefined) patchOllama({ numCtx: parsed as number | null });
            }}
            disabled={!overrideEnabled || advancedEnabled}
            placeholder={t('pipeline.providerOptions.optional')}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
        <LabeledField label={t('pipeline.providerOptions.numPredict')}>
          <input
            type="number"
            value={ollama.numPredict ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              if (parsed !== undefined) patchOllama({ numPredict: parsed as number | null });
            }}
            disabled={!overrideEnabled || advancedEnabled}
            placeholder={t('pipeline.providerOptions.optional')}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </LabeledField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LabeledField label={t('pipeline.providerOptions.think')}>
          <select
            value={String(ollama.think)}
            onChange={(e) => {
              const next = e.target.value;
              patchOllama({
                think: next === 'false'
                  ? false
                  : next === 'true'
                    ? true
                    : next as 'low' | 'medium' | 'high',
              });
            }}
            disabled={!overrideEnabled}
            className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <option value="false">{t('pipeline.providerOptions.thinkDisabled')}</option>
            <option value="true">{t('pipeline.providerOptions.thinkEnabled')}</option>
            <option value="low">{t('pipeline.providerOptions.thinkLow')}</option>
            <option value="medium">{t('pipeline.providerOptions.thinkMedium')}</option>
            <option value="high">{t('pipeline.providerOptions.thinkHigh')}</option>
          </select>
        </LabeledField>
      </div>

      <ToggleRow
        checked={advancedEnabled}
        disabled={!overrideEnabled}
        icon={<Braces size={13} />}
        label={t('pipeline.providerOptions.enableAdvanced')}
        hint={t('pipeline.providerOptions.enableAdvancedHint')}
        onChange={() => patchOllama({ useAdvancedOptions: !advancedEnabled })}
      />

      <div className="space-y-2">
        <label htmlFor={textareaId} className="block text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted">
          {t('pipeline.providerOptions.advancedJson')}
        </label>
        <textarea
          id={textareaId}
          value={advancedJson}
          onChange={(e) => {
            const next = e.target.value;
            setAdvancedJson(next);
            try {
              const parsed = JSON.parse(next) as Record<string, unknown>;
              patchOllama({ advancedOptions: parsed });
              setJsonError(null);
            } catch {
              setJsonError(t('pipeline.providerOptions.invalidJson'));
            }
          }}
          disabled={!advancedEnabled}
          rows={6}
          spellCheck={false}
          className="w-full rounded-[16px] border border-editorial-border/60 bg-editorial-bg/80 px-3 py-3 text-sm font-mono outline-none resize-y leading-relaxed focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
        {jsonError ? (
          <div className="flex items-center gap-2 text-xs text-editorial-accent">
            <AlertTriangle size={13} />
            <span>{jsonError}</span>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-editorial-muted">
            {t('pipeline.providerOptions.advancedHint')}
          </p>
        )}
      </div>
    </section>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  checked,
  label,
  hint,
  onChange,
  disabled = false,
  icon,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`flex w-full items-center justify-between rounded-[14px] border px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-50 ${
        checked
          ? 'border-editorial-ink bg-editorial-bg/90'
          : 'border-editorial-border/60 bg-editorial-bg/50 hover:bg-editorial-textbox/30'
      }`}
    >
      <span className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
            checked
              ? 'border-editorial-ink bg-editorial-ink justify-end'
              : 'border-editorial-border bg-editorial-textbox/60 justify-start'
          }`}
          aria-hidden="true"
        >
          <span className="h-3.5 w-3.5 rounded-full bg-white" />
        </span>
        <span className="space-y-1">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-editorial-muted">
            {icon}
            {label}
          </span>
          <span className="block text-xs leading-relaxed text-editorial-muted">{hint}</span>
        </span>
      </span>
    </button>
  );
}
