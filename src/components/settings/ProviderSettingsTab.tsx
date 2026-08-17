import { Fragment, useRef, type KeyboardEvent } from 'react';
import {
  AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle,
  ChevronDown, ChevronUp, DollarSign, Globe, History, RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiKeyInput } from './ApiKeyInput';
import { CustomProviderSection } from './CustomProviderSection';
import { getKnownModelIds, getModelEntry, MODEL_CATALOG, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { ProviderLogo } from '../common';
import {
  FieldLabel,
  FIELD_MONO_CLASSNAME,
  IconButton,
  SectionLabel,
  ToggleRow,
} from '../ui';
import type { ModelProvider } from '../../types';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { OllamaStatus } from '../../types';

/** Le linguette: i provider del registro, più quello personalizzato in coda. */
const PROVIDER_TABS: ModelProvider[] = [...MODEL_PROVIDER_ORDER, 'custom'];

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  deepl: 'DeepL',
  ollama: 'Ollama',
  custom: 'Custom',
};

function getModelGroupLabel(provider: ModelProvider, modelId: string): string {
  switch (provider) {
    case 'openai':
      if (modelId.startsWith('gpt-5.6')) return 'GPT-5.6';
      if (modelId.startsWith('gpt-5.4')) return 'GPT-5.4';
      if (modelId.startsWith('gpt-5')) return 'GPT-5';
      if (modelId.startsWith('gpt-4.1')) return 'GPT-4.1';
      if (modelId.startsWith('gpt-4o') || modelId.startsWith('chatgpt-4o')) return 'GPT-4o';
      if (modelId.startsWith('gpt-4')) return 'GPT-4';
      if (modelId.startsWith('gpt-3')) return 'GPT-3.5';
      if (/^o\d/.test(modelId)) return 'o-series';
      return 'Other';
    case 'anthropic':
      // Grouped by model family (Anthropic keeps Opus on "4.x" numbering while Sonnet
      // jumped to "5" — grouping by generation number mixes old/new models together).
      if (modelId.includes('opus')) return 'Claude Opus';
      if (modelId.includes('sonnet')) return 'Claude Sonnet';
      if (modelId.includes('haiku')) return 'Claude Haiku';
      if (modelId.includes('fable') || modelId.includes('mythos')) return 'Claude Fable';
      return 'Other';
    case 'gemini':
      if (modelId.startsWith('gemini-3.1')) return 'Gemini 3.1';
      if (modelId.startsWith('gemini-3')) return 'Gemini 3';
      if (modelId.startsWith('gemini-2.5')) return 'Gemini 2.5';
      if (modelId.startsWith('gemini-2.0')) return 'Gemini 2.0';
      return 'Gemini';
    case 'deepseek':
      if (modelId.startsWith('deepseek-v4')) return 'DeepSeek V4';
      return 'DeepSeek';
    default:
      return '';
  }
}

function groupModelIds(provider: ModelProvider, modelIds: string[]): Array<{ label: string; ids: string[] }> {
  const map = new Map<string, string[]>();
  for (const id of modelIds) {
    const label = getModelGroupLabel(provider, id);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(id);
  }
  return [...map.entries()].map(([label, ids]) => ({ label, ids }));
}

interface ProviderSettingsTabProps {
  activeProviderTab: ModelProvider;
  setActiveProviderTab: (provider: ModelProvider) => void;
  urlDraft: string;
  setUrlDraft: (url: string) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
  ollamaStatus: OllamaStatus;
  ollamaModels: string[];
  refreshing: boolean;
  refreshOllama: () => Promise<void>;
  setOllamaBaseUrl: (url: string) => void;
  keyStatuses: ProviderKeyStatusMap;
  refreshKeyStatuses: () => void;
  showDeprecatedModels: boolean;
  setShowDeprecatedModels: (value: boolean) => void;
  showPricingOverrides: boolean;
  setShowPricingOverrides: (value: boolean) => void;
  overrides: Record<string, { input: number; output: number }>;
  setOverride: (key: string, pricing: { input: number; output: number }) => void;
  resetOverride: (key: string) => void;
  resetAll: () => void;
  showSecurityAdvisory: boolean;
  setShowSecurityAdvisory: (value: boolean | ((current: boolean) => boolean)) => void;
}

export function ProviderSettingsTab({
  activeProviderTab,
  setActiveProviderTab,
  urlDraft,
  setUrlDraft,
  urlError,
  setUrlError,
  ollamaStatus,
  ollamaModels,
  refreshing,
  refreshOllama,
  setOllamaBaseUrl,
  keyStatuses,
  refreshKeyStatuses,
  showDeprecatedModels,
  setShowDeprecatedModels,
  showPricingOverrides,
  setShowPricingOverrides,
  overrides,
  setOverride,
  resetOverride,
  resetAll,
  showSecurityAdvisory,
  setShowSecurityAdvisory,
}: ProviderSettingsTabProps) {
  const { t } = useTranslation();
  const providerRefs = useRef<Partial<Record<ModelProvider, HTMLButtonElement | null>>>({});

  const handleProviderKeys = (
    current: ModelProvider,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const index = PROVIDER_TABS.indexOf(current);
    let next: ModelProvider | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = PROVIDER_TABS[(index - 1 + PROVIDER_TABS.length) % PROVIDER_TABS.length];
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = PROVIDER_TABS[(index + 1) % PROVIDER_TABS.length];
    else if (event.key === 'Home') next = PROVIDER_TABS[0];
    else if (event.key === 'End') next = PROVIDER_TABS[PROVIDER_TABS.length - 1];
    if (next) {
      event.preventDefault();
      setActiveProviderTab(next);
      providerRefs.current[next]?.focus();
    }
  };

  return (
    <div
      id="settings-panel-provider"
      role="tabpanel"
      aria-labelledby="settings-tab-provider"
      className="space-y-10"
    >
      {/* Provider workspace */}
      <section className="space-y-4">
        <SectionLabel icon={Server} label={t('settings.providerConfig')} />
        <div className="space-y-4 border-y border-editorial-border/70 py-5">
          {/* Le linguette dei provider sono `IconButton` come quelle della
              finestra: prima erano cerchi verdi pieni fatti a mano, l'unico
              elemento attivo dell'app disegnato per conto suo. Le frecce
              spostano la scelta, altrimenti da tastiera si raggiungeva soltanto
              la linguetta aperta. */}
          <div
            role="tablist"
            aria-label={t('settings.providerConfig')}
            className="flex flex-wrap items-center gap-2"
          >
            {PROVIDER_TABS.map((provider) => {
              const active = provider === activeProviderTab;
              return (
                <Fragment key={provider}>
                  {/* Il provider personalizzato resta staccato dagli altri:
                      separatore canonico, non un margine inventato. */}
                  {provider === 'custom' && (
                    <span
                      className="mx-1 h-4 w-px self-center bg-editorial-border/70"
                      aria-hidden="true"
                    />
                  )}
                  <IconButton
                    ref={(element) => {
                      providerRefs.current[provider] = element;
                    }}
                    size="lg"
                    tone={active ? 'accent' : 'default'}
                    onClick={() => setActiveProviderTab(provider)}
                    onKeyDown={(event) => handleProviderKeys(provider, event)}
                    title={PROVIDER_LABELS[provider]}
                    id={`settings-provider-tab-${provider}`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`settings-provider-panel-${provider}`}
                    tabIndex={active ? 0 : -1}
                  >
                    {provider === 'custom' ? (
                      <Globe size={16} />
                    ) : (
                      <ProviderLogo provider={provider} size={18} />
                    )}
                  </IconButton>
                </Fragment>
              );
            })}
          </div>

          <div
            id={`settings-provider-panel-${activeProviderTab}`}
            role="tabpanel"
            aria-labelledby={`settings-provider-tab-${activeProviderTab}`}
            className="space-y-5 border-t border-editorial-border pt-5"
          >
            <div className="space-y-3">
              {activeProviderTab === 'custom' ? (
                <CustomProviderSection />
              ) : activeProviderTab === 'ollama' ? (
                <div className="space-y-4 border-y border-editorial-border/70 py-4">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="settings-ollama-url" block>
                      {t('ollama.baseUrl')}
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <input
                        id="settings-ollama-url"
                        type="url"
                        value={urlDraft}
                        onChange={(e) => {
                          setUrlDraft(e.target.value);
                          setUrlError(null);
                        }}
                        onBlur={() => {
                          const trimmed = urlDraft.trim();
                          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                            setUrlError(t('ollama.urlInvalid'));
                          } else {
                            setUrlError(null);
                            setOllamaBaseUrl(trimmed);
                            void refreshOllama();
                          }
                        }}
                        className={FIELD_MONO_CLASSNAME}
                        placeholder="http://localhost:11434"
                        aria-label={t('ollama.baseUrl')}
                      />
                      {/* Verde per «non funziona» era il contrario di quello che
                          dice la palette: connesso è successo, disconnesso è
                          danno, non controllato è muto. */}
                      {ollamaStatus === 'connected' && (
                        <CheckCircle2
                          size={14}
                          className="shrink-0 text-editorial-success"
                          aria-label={t('ollama.connected', { count: ollamaModels.length })}
                        />
                      )}
                      {ollamaStatus === 'disconnected' && (
                        <XCircle
                          size={14}
                          className="shrink-0 text-editorial-danger"
                          aria-label={t('ollama.disconnected')}
                        />
                      )}
                      {ollamaStatus === 'unknown' && (
                        <HelpCircle
                          size={14}
                          className="shrink-0 text-editorial-muted"
                          aria-label={t('ollama.unchecked')}
                        />
                      )}
                      <IconButton
                        onClick={() => void refreshOllama()}
                        disabled={refreshing}
                        title={t('ollama.refresh')}
                        size="sm"
                        className="shrink-0"
                      >
                        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                      </IconButton>
                    </div>
                    {urlError && (
                      <p role="alert" className="text-sm text-editorial-danger">
                        {urlError}
                      </p>
                    )}
                  </div>

                  {ollamaStatus === 'disconnected' && (
                    <p className="text-sm text-editorial-muted">{t('ollama.notRunning')}</p>
                  )}
                  {ollamaStatus === 'unknown' && (
                    <p className="text-sm text-editorial-muted">{t('ollama.uncheckedHint')}</p>
                  )}
                  {ollamaStatus === 'connected' && ollamaModels.length === 0 && (
                    <p className="text-sm text-editorial-muted">{t('ollama.noModels')}</p>
                  )}
                  {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
                    <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
                      {ollamaModels.map((modelId) => (
                        <div key={modelId} className="py-2.5">
                          <span className="font-mono text-sm text-editorial-ink">{modelId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-y border-editorial-border/70 py-4">
                  <ApiKeyInput
                    label={PROVIDER_LABELS[activeProviderTab]}
                    provider={activeProviderTab}
                    onKeyChange={refreshKeyStatuses}
                  />
                </div>
              )}

              {activeProviderTab !== 'ollama' && activeProviderTab !== 'custom' && !(keyStatuses as Partial<Record<string, boolean>>)[activeProviderTab] && (
                <p className="text-sm text-editorial-muted">{t('settings.configureKeyToUse')}</p>
              )}
            </div>

            {activeProviderTab !== 'ollama' && activeProviderTab !== 'custom' && (() => {
              const hasKey = !!(keyStatuses as Partial<Record<string, boolean>>)[activeProviderTab];
              const groups = groupModelIds(
                activeProviderTab,
                getKnownModelIds(activeProviderTab, { includeDeprecated: showDeprecatedModels }),
              );
              return (
                <div className="space-y-3">
                  <ToggleRow
                    icon={<History size={13} />}
                    label={t('settings.showDeprecatedModels')}
                    checked={showDeprecatedModels}
                    onChange={() => setShowDeprecatedModels(!showDeprecatedModels)}
                  />
                  {groups.map(({ label, ids }) => (
                    <div key={label || '_all'} className="space-y-1.5">
                      {label && <FieldLabel>{label}</FieldLabel>}
                      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
                        {ids.map((modelId) => {
                          const entry = getModelEntry(activeProviderTab, modelId);
                          // I dati del modello sono metadati, non pastiglie: erano
                          // fino a quattro contenitori arrotondati per riga, e le
                          // pastiglie in questa applicazione non si usano.
                          const meta = [
                            entry?.contextWindow
                              ? entry.contextWindow >= 1_000_000
                                ? `${(entry.contextWindow / 1_000_000).toFixed(0)}M`
                                : `${Math.round(entry.contextWindow / 1_000)}K`
                              : null,
                            entry?.pricing
                              ? `$${entry.pricing.input}/$${entry.pricing.output}`
                              : null,
                          ].filter(Boolean);
                          const state =
                            entry?.status === 'preview'
                              ? 'preview'
                              : entry?.status === 'deprecated'
                                ? t('settings.deprecatedModelBadge')
                                : null;
                          return (
                            <div
                              key={modelId}
                              className={`py-2.5 transition-opacity ${!hasKey ? 'opacity-40' : ''}`}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm text-editorial-ink">
                                  {modelId}
                                </span>
                                <ModelCapabilityHint
                                  provider={activeProviderTab}
                                  model={modelId}
                                  iconOnly
                                />
                                {meta.length > 0 && (
                                  <span className="font-mono text-xs text-editorial-muted">
                                    {meta.join(' · ')}
                                  </span>
                                )}
                                {state && (
                                  <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-warning">
                                    {state}
                                  </span>
                                )}
                              </div>
                              {entry?.description && (
                                <p className="mt-0.5 text-xs text-editorial-muted">
                                  {entry.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Listino personale. Le due sezioni a scomparsa si aprono nello stesso
          modo: intestazione canonica e comando a icona a destra. Prima una era
          un'etichetta cliccabile e l'altra una riga larga con il chevron. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={DollarSign} label={t('cost.pricingOverrides')} />
          <div className="flex items-center gap-1">
            {Object.keys(overrides).length > 0 && (
              <IconButton size="sm" onClick={resetAll} title={t('cost.resetAll')}>
                <RotateCcw size={13} />
              </IconButton>
            )}
            <IconButton
              size="sm"
              onClick={() => setShowPricingOverrides(!showPricingOverrides)}
              title={t('cost.pricingOverrides')}
              ariaPressed={showPricingOverrides}
            >
              {showPricingOverrides ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </IconButton>
          </div>
        </div>
        {showPricingOverrides && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-editorial-muted">{t('cost.overrideHint')}</p>
            <div className="overflow-x-auto border-y border-editorial-border/70">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-editorial-border/70">
                    <th className="px-1 py-2 text-left">
                      <FieldLabel>{t('cost.overrideModel')}</FieldLabel>
                    </th>
                    <th className="px-1 py-2 text-right">
                      <FieldLabel>{t('cost.overrideInput')}</FieldLabel>
                    </th>
                    <th className="px-1 py-2 text-right">
                      <FieldLabel>{t('cost.overrideOutput')}</FieldLabel>
                    </th>
                    <th className="px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/60">
                  {MODEL_CATALOG.filter((e) => e.pricing).map((entry) => {
                    const key = `${entry.provider}/${entry.id}`;
                    const current = overrides[key] ?? MODEL_PRICING[key] ?? entry.pricing!;
                    const isOverridden = !!overrides[key];
                    return (
                      <tr key={key}>
                        <td className="px-1 py-2">
                          <span
                            className={`font-mono text-sm ${
                              isOverridden ? 'text-editorial-ink' : 'text-editorial-muted'
                            }`}
                          >
                            {entry.provider}/{entry.id}
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={current.input}
                            aria-label={`${key} — ${t('cost.overrideInput')}`}
                            onChange={(e) =>
                              setOverride(key, { ...current, input: parseFloat(e.target.value) || 0 })
                            }
                            className={`${FIELD_MONO_CLASSNAME} w-24 text-right`}
                          />
                        </td>
                        <td className="px-1 py-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={current.output}
                            aria-label={`${key} — ${t('cost.overrideOutput')}`}
                            onChange={(e) =>
                              setOverride(key, {
                                ...current,
                                output: parseFloat(e.target.value) || 0,
                              })
                            }
                            className={`${FIELD_MONO_CLASSNAME} w-24 text-right`}
                          />
                        </td>
                        <td className="px-1 py-2 text-right">
                          {isOverridden && (
                            <IconButton
                              size="sm"
                              onClick={() => resetOverride(key)}
                              title={t('cost.resetOverride')}
                            >
                              <RotateCcw size={13} />
                            </IconButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Avviso di sicurezza */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={AlertCircle} label={t('settings.securityAdvisory')} />
          <IconButton
            size="sm"
            onClick={() => setShowSecurityAdvisory((current) => !current)}
            title={t('settings.securityAdvisory')}
            ariaPressed={showSecurityAdvisory}
          >
            {showSecurityAdvisory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </IconButton>
        </div>
        {showSecurityAdvisory && (
          <p className="border-y border-editorial-border/70 py-3 text-sm leading-relaxed text-editorial-muted">
            {t('settings.securityMessage')}
          </p>
        )}
      </section>
    </div>
  );
}
