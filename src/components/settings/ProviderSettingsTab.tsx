import {
  AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle,
  ChevronDown, ChevronUp, Globe, History,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiKeyInput } from './ApiKeyInput';
import { CustomProviderSection } from './CustomProviderSection';
import { getKnownModelIds, getModelEntry, MODEL_CATALOG, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { ProviderLogo } from '../common';
import { IconButton, Tooltip, ToggleRow } from '../ui';
import type { ModelProvider } from '../../types';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import type { ProviderKeyStatusMap } from '../../hooks/useProviderKeyStatus';
import type { OllamaStatus } from '../../types';

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

  return (
    <div
      id="settings-panel-provider"
      role="tabpanel"
      aria-labelledby="settings-tab-provider"
      className="space-y-12"
    >
      {/* Provider workspace */}
      <div className="space-y-4">
        <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
          {t('settings.providerConfig')}
        </p>
        <div className="space-y-4 border-y border-editorial-border/70 py-5">
          <div
            role="tablist"
            aria-label={t('settings.providerConfig')}
            className="flex flex-wrap gap-2"
          >
            {MODEL_PROVIDER_ORDER.map((provider) => {
              const active = provider === activeProviderTab;
              return (
                <Tooltip key={provider} label={PROVIDER_LABELS[provider]}>
                <button
                  type="button"
                  onClick={() => setActiveProviderTab(provider)}
                  aria-label={PROVIDER_LABELS[provider]}
                  id={`settings-provider-tab-${provider}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`settings-provider-panel-${provider}`}
                  tabIndex={active ? 0 : -1}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    active
                      ? 'border-editorial-accent bg-editorial-accent text-white'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
                  }`}
                >
                  <ProviderLogo provider={provider} size={18} />
                </button>
                </Tooltip>
              );
            })}

            {/* Separatore + tab Custom */}
            <span className="mx-1 self-center w-px h-5 bg-editorial-border/60" aria-hidden="true" />
            <Tooltip label={PROVIDER_LABELS['custom']}>
            <button
              type="button"
              onClick={() => setActiveProviderTab('custom')}
              aria-label={PROVIDER_LABELS['custom']}
              id="settings-provider-tab-custom"
              role="tab"
              aria-selected={activeProviderTab === 'custom'}
              aria-controls="settings-provider-panel-custom"
              tabIndex={activeProviderTab === 'custom' ? 0 : -1}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                activeProviderTab === 'custom'
                  ? 'border-editorial-accent bg-editorial-accent text-white'
                  : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
              }`}
            >
              <Globe size={16} />
            </button>
            </Tooltip>
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Server size={16} className="text-editorial-muted" />
                      <input
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
                        className="text-xs font-mono bg-transparent border-b border-editorial-border focus:border-editorial-ink outline-none px-1 w-56"
                        placeholder="http://localhost:11434"
                        aria-label={t('ollama.baseUrl')}
                      />
                      {urlError && <span className="text-xs text-editorial-accent">{urlError}</span>}
                      {ollamaStatus === 'connected' && (
                        <CheckCircle2 size={12} className="text-editorial-ink" aria-label={t('ollama.connected', { count: ollamaModels.length })} />
                      )}
                      {ollamaStatus === 'disconnected' && (
                        <XCircle size={12} className="text-editorial-accent" aria-label={t('ollama.disconnected')} />
                      )}
                      {ollamaStatus === 'unknown' && (
                        <HelpCircle size={12} className="text-editorial-muted" aria-label={t('ollama.unchecked')} />
                      )}
                    </div>
                    <IconButton
                      onClick={() => void refreshOllama()}
                      disabled={refreshing}
                      title={t('ollama.refresh')}
                      size="sm"
                    >
                      <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    </IconButton>
                  </div>

                  {ollamaStatus === 'disconnected' && (
                    <p className="text-xs text-editorial-muted italic">
                      {t('ollama.notRunning')}
                    </p>
                  )}
                  {ollamaStatus === 'unknown' && (
                    <p className="text-xs text-editorial-muted italic">
                      {t('ollama.uncheckedHint')}
                    </p>
                  )}
                  {ollamaStatus === 'connected' && ollamaModels.length === 0 && (
                    <p className="text-xs text-editorial-muted italic">
                      {t('ollama.noModels')}
                    </p>
                  )}
                  {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
                    <div className="space-y-1.5">
                      {ollamaModels.map((modelId) => (
                        <div
                          key={modelId}
                          className="flex items-center gap-2 border-b border-editorial-border/60 py-2"
                        >
                          <span className="text-xs font-mono text-editorial-ink">{modelId}</span>
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
                <p className="text-xs text-editorial-muted italic">
                  {t('settings.configureKeyToUse')}
                </p>
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
                      {label && (
                        <p className="px-1 text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                          {label}
                        </p>
                      )}
                      {ids.map((modelId) => {
                        const entry = getModelEntry(activeProviderTab, modelId);
                        return (
                          <div
                            key={modelId}
                            className={`flex items-start gap-3 border-b border-editorial-border/60 py-2.5 transition-opacity ${!hasKey ? 'opacity-40' : ''}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-mono text-editorial-ink">{modelId}</span>
                                <ModelCapabilityHint provider={activeProviderTab} model={modelId} iconOnly />
                                {entry?.contextWindow && (
                                  <span className="rounded-full border border-editorial-border px-2 py-0.5 text-xs font-mono text-editorial-muted">
                                    {entry.contextWindow >= 1_000_000
                                      ? `${(entry.contextWindow / 1_000_000).toFixed(0)}M`
                                      : `${Math.round(entry.contextWindow / 1_000)}K`}
                                  </span>
                                )}
                                {entry?.pricing && (
                                  <span className="rounded-full border border-editorial-border px-2 py-0.5 text-xs font-mono text-editorial-muted">
                                    ${entry.pricing.input}/${entry.pricing.output}
                                  </span>
                                )}
                                {entry?.status === 'preview' && (
                                  <span className="rounded-full border border-editorial-warning/40 bg-editorial-warning/10 px-2 py-0.5 text-xs font-mono text-editorial-warning">
                                    preview
                                  </span>
                                )}
                                {entry?.status === 'deprecated' && (
                                  <span className="rounded-full border border-editorial-warning/40 bg-editorial-warning/10 px-2 py-0.5 text-xs font-mono text-editorial-warning">
                                    {t('settings.deprecatedModelBadge')}
                                  </span>
                                )}
                              </div>
                              {entry?.description && (
                                <p className="mt-0.5 text-xs text-editorial-muted">{entry.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Pricing Overrides */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowPricingOverrides(!showPricingOverrides)}
          className="flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-expanded={showPricingOverrides}
        >
          {showPricingOverrides ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t('cost.pricingOverrides')}
        </button>
        {showPricingOverrides && (
          <div className="space-y-3 border-y border-editorial-border/70 py-5">
            <p className="text-xs text-editorial-muted italic">{t('cost.overrideHint')}</p>
            <div className="border-y border-editorial-border overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-editorial-border bg-editorial-textbox/30">
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-[0.16em] text-editorial-muted">Model</th>
                    <th className="text-right px-3 py-2 font-bold uppercase tracking-[0.16em] text-editorial-muted">Input $/1M</th>
                    <th className="text-right px-3 py-2 font-bold uppercase tracking-[0.16em] text-editorial-muted">Output $/1M</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {MODEL_CATALOG.filter((e) => e.pricing).map((entry) => {
                    const key = `${entry.provider}/${entry.id}`;
                    const current = overrides[key] ?? MODEL_PRICING[key] ?? entry.pricing!;
                    const isOverridden = !!overrides[key];
                    return (
                      <tr key={key} className="border-t border-editorial-border/40 hover:bg-editorial-textbox/20">
                        <td className="px-3 py-2">
                          <span className={isOverridden ? 'text-editorial-ink font-bold' : 'text-editorial-muted'}>
                            {entry.provider}/{entry.id}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={current.input}
                            onChange={(e) => setOverride(key, { ...current, input: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-right outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={current.output}
                            onChange={(e) => setOverride(key, { ...current, output: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-right outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isOverridden && (
                            <button
                              type="button"
                              onClick={() => resetOverride(key)}
                              className="text-xs font-bold uppercase tracking-[0.16em] text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
                            >
                              {t('cost.resetOverride')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {Object.keys(overrides).length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-xs font-bold uppercase tracking-[0.16em] text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {t('cost.resetAll')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Advisory */}
      <div className="border-y border-editorial-border/70">
        <button
          type="button"
          onClick={() => setShowSecurityAdvisory((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          aria-expanded={showSecurityAdvisory}
        >
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-editorial-accent shrink-0" />
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.securityAdvisory')}
            </div>
          </div>
          {showSecurityAdvisory ? <ChevronUp size={14} className="text-editorial-muted" /> : <ChevronDown size={14} className="text-editorial-muted" />}
        </button>
        {showSecurityAdvisory && (
          <div className="border-t border-editorial-border px-5 py-4">
            <p className="text-sm leading-relaxed text-editorial-muted">
              {t('settings.securityMessage')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
