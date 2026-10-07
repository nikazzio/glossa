import { useState } from 'react';
import { DollarSign, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import type { ModelProvider } from '../../types';
import { ProviderLogo } from '../common';
import type { TabStripItem } from '../ui';
import { CustomProviderSection } from './CustomProviderSection';
import { OllamaSettingsSection } from './OllamaSettingsSection';
import { PricingOverridesSection } from './PricingOverridesSection';
import { ProviderModelsSection } from './ProviderModelsSection';
import { SettingsSubTabs } from './SettingsSubTabs';

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  deepl: 'DeepL',
  ollama: 'Ollama',
  custom: 'Custom',
};

type ModelsSubTab = ModelProvider | 'pricing';

/** Modelli: una sotto-linguetta per provider, il provider personalizzato e il listino dei prezzi. */
export function ModelsSettingsTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<ModelsSubTab>(MODEL_PROVIDER_ORDER[0] ?? 'custom');
  const { statuses, refresh } = useProviderKeyStatus();
  const tabs: TabStripItem[] = [
    ...MODEL_PROVIDER_ORDER.map((provider) => ({
      id: provider,
      label: PROVIDER_LABELS[provider],
      icon: <ProviderLogo provider={provider} size={16} />,
    })),
    { id: 'custom', label: t('settings.models.custom'), icon: <Globe size={16} /> },
    { id: 'pricing', label: t('cost.pricingOverrides'), icon: <DollarSign size={16} /> },
  ];
  const hasKey = (provider: ModelProvider) => Boolean((statuses as Partial<Record<string, boolean>>)[provider]);

  return (
    <SettingsSubTabs tabId="models" ariaLabel={t('settings.modelsTab')} tabs={tabs} activeId={subTab}
      onChange={(id) => setSubTab(id as ModelsSubTab)}>
      {subTab === 'pricing' ? <PricingOverridesSection />
        : subTab === 'custom' ? <CustomProviderSection />
          : subTab === 'ollama' ? <OllamaSettingsSection />
            : <ProviderModelsSection provider={subTab} label={PROVIDER_LABELS[subTab]} hasKey={hasKey(subTab)} onKeyChange={refresh} />}
    </SettingsSubTabs>
  );
}
