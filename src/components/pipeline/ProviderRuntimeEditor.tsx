import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Braces, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider, OllamaConfig, ProviderRuntimeConfig } from '../../types';
import { defaultOllamaConfig } from '../../utils/providerOptions';
import { ToggleRow } from '../ui';

interface ProviderRuntimeEditorProps {
  provider: ModelProvider;
  value?: ProviderRuntimeConfig;
  onChange: (next: ProviderRuntimeConfig | undefined) => void;
  title: string;
  hint: string;
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

  return (
    <section className="border-l-4 border-l-editorial-charcoal/25 border-y border-editorial-border/70 bg-editorial-textbox/18 overflow-hidden">
      {/* Header / toggle row — always visible */}
      <div
        className={`px-4 py-3 transition-colors ${
          overrideEnabled
            ? 'bg-editorial-ink/5 border-b border-editorial-border/50'
            : 'hover:bg-editorial-textbox/30'
        }`}
      >
        <ToggleRow
          icon={<SlidersHorizontal size={13} className={overrideEnabled ? 'text-editorial-ink' : 'text-editorial-muted'} />}
          label={title}
          checked={overrideEnabled}
          onChange={() => setOverrideEnabled(!overrideEnabled)}
        />
        {!overrideEnabled && (
          <p className="mt-1 pl-[21px] text-xs leading-relaxed text-editorial-muted/70">{hint}</p>
        )}
      </div>

      {/* Collapsible fields — only when override is enabled */}
      <AnimatePresence initial={false}>
        {overrideEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 p-4">

              <div className="grid grid-cols-2 gap-3">
                <LabeledField label={t('pipeline.providerOptions.temperature')}>
                  <input
                    type="number"
                    step="0.05"
                    value={ollama.temperature ?? ''}
                    onChange={(e) => {
                      const parsed = parseOptionalNumber(e.target.value);
                      if (parsed !== undefined) patchOllama({ temperature: parsed });
                    }}
                    disabled={advancedEnabled}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </LabeledField>
                <LabeledField label={t('pipeline.providerOptions.topP')}>
                  <input
                    type="number"
                    step="0.05"
                    value={ollama.topP ?? ''}
                    onChange={(e) => {
                      const parsed = parseOptionalNumber(e.target.value);
                      if (parsed !== undefined) patchOllama({ topP: parsed });
                    }}
                    disabled={advancedEnabled}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </LabeledField>
                <LabeledField label={t('pipeline.providerOptions.seed')}>
                  <input
                    type="number"
                    value={ollama.seed ?? ''}
                    onChange={(e) => {
                      const parsed = parseNullableNumber(e.target.value);
                      if (parsed !== undefined) patchOllama({ seed: parsed as number | null });
                    }}
                    disabled={advancedEnabled}
                    placeholder={t('pipeline.providerOptions.optional')}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </LabeledField>
                <LabeledField label={t('pipeline.providerOptions.keepAlive')}>
                  <input
                    type="text"
                    value={String(ollama.keepAlive ?? '')}
                    onChange={(e) => patchOllama({ keepAlive: e.target.value })}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  />
                </LabeledField>
                <LabeledField label={t('pipeline.providerOptions.numCtx')}>
                  <input
                    type="number"
                    value={ollama.numCtx ?? ''}
                    onChange={(e) => {
                      const parsed = parseNullableNumber(e.target.value);
                      if (parsed !== undefined) patchOllama({ numCtx: parsed as number | null });
                    }}
                    disabled={advancedEnabled}
                    placeholder={t('pipeline.providerOptions.optional')}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                  />
                </LabeledField>
                <LabeledField label={t('pipeline.providerOptions.numPredict')}>
                  <input
                    type="number"
                    value={ollama.numPredict ?? ''}
                    onChange={(e) => {
                      const parsed = parseNullableNumber(e.target.value);
                      if (parsed !== undefined) patchOllama({ numPredict: parsed as number | null });
                    }}
                    disabled={advancedEnabled}
                    placeholder={t('pipeline.providerOptions.optional')}
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
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
                    className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg/80 px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <option value="false">{t('pipeline.providerOptions.thinkDisabled')}</option>
                    <option value="true">{t('pipeline.providerOptions.thinkEnabled')}</option>
                    <option value="low">{t('pipeline.providerOptions.thinkLow')}</option>
                    <option value="medium">{t('pipeline.providerOptions.thinkMedium')}</option>
                    <option value="high">{t('pipeline.providerOptions.thinkHigh')}</option>
                  </select>
                </LabeledField>
              </div>

              <div
                className={`space-y-1.5 border-l-4 border-y px-3 py-3 transition-colors ${
                  advancedEnabled
                    ? 'border-l-editorial-ink border-y-editorial-border/70 bg-editorial-bg/90'
                    : 'border-l-editorial-border/70 border-y-editorial-border/60 bg-editorial-bg/50'
                }`}
              >
                <ToggleRow
                  checked={advancedEnabled}
                  icon={<Braces size={13} />}
                  label={t('pipeline.providerOptions.enableAdvanced')}
                  onChange={() => patchOllama({ useAdvancedOptions: !advancedEnabled })}
                />
                <p className="text-xs leading-relaxed text-editorial-muted">
                  {t('pipeline.providerOptions.enableAdvancedHint')}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor={textareaId} className="block text-[11px] font-sans uppercase tracking-[0.28em] text-editorial-muted">
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
                  className="w-full rounded-md border-2 border-editorial-border/60 bg-editorial-bg/80 px-3 py-3 text-sm font-mono outline-none resize-y leading-relaxed focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
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

            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
      <span className="block text-[11px] font-sans uppercase tracking-[0.28em] text-editorial-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
