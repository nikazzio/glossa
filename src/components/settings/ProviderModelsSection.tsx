import { Boxes, History, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiKeyInput } from './ApiKeyInput';
import { getKnownModelIds, getModelEntry } from '../../models/catalog';
import { FieldLabel, PanelSection, SECTION_SETTING_LIST_CLASSNAME, ToggleRow } from '../ui';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { useUiStore } from '../../stores/uiStore';
import type { ModelProvider } from '../../types';

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

/** Un provider in cloud: la sua chiave e i modelli che offre, spenti finché la chiave manca. */
export function ProviderModelsSection({ provider, label, hasKey, onKeyChange }: {
  provider: ModelProvider;
  label: string;
  hasKey: boolean;
  onKeyChange: () => void;
}) {
  const { t } = useTranslation();
  const showDeprecatedModels = useUiStore((s) => s.showDeprecatedModels);
  const setShowDeprecatedModels = useUiStore((s) => s.setShowDeprecatedModels);
  const groups = groupModelIds(provider, getKnownModelIds(provider, { includeDeprecated: showDeprecatedModels }));
  return (
    <>
      <PanelSection icon={KeyRound} label={t('settings.models.apiKey')} hint={t('settings.securityMessage')}>
        <ApiKeyInput label={label} provider={provider} onKeyChange={onKeyChange} />
        {!hasKey && <p className="text-sm text-editorial-muted">{t('settings.configureKeyToUse')}</p>}
      </PanelSection>
      <PanelSection icon={Boxes} label={t('settings.models.list')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <div className="py-2.5">
            <ToggleRow
              icon={<History size={13} />}
              label={t('settings.showDeprecatedModels')}
              checked={showDeprecatedModels}
              onChange={() => setShowDeprecatedModels(!showDeprecatedModels)}
            />
          </div>
        </div>
        {groups.map(({ label, ids }) => (
          <div key={label || '_all'} className="space-y-1.5 pt-2">
            {label && <FieldLabel>{label}</FieldLabel>}
            <div className={SECTION_SETTING_LIST_CLASSNAME}>
              {ids.map((modelId) => {
                const entry = getModelEntry(provider, modelId);
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
                        provider={provider}
                        model={modelId}
                        iconOnly
                      />
                      {meta.length > 0 && (
                        <span className="font-mono text-xs text-editorial-muted">
                          {meta.join(' · ')}
                        </span>
                      )}
                      {state && (
                        <span className="text-caption font-sans uppercase tracking-caption text-editorial-warning">
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
      </PanelSection>
    </>
  );
}
