import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle, Sparkles, Columns2, BookOpen, ChevronDown, ChevronUp, Brain, Bot, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/uiStore';
import { ApiKeyInput } from './ApiKeyInput';
import { ollamaService, settingsService } from '../../services/llmService';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getSelectableModelIds, isShowableModel, MODEL_CATALOG, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { usePricingStore } from '../../stores/pricingStore';
import { EditorialModalShell } from '../common';
import type { ModelProvider } from '../../types';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
};

const PROVIDER_ABBREV: Record<ModelProvider, string> = {
  gemini: 'Gm',
  openai: 'Oa',
  anthropic: 'An',
  deepseek: 'Ds',
  ollama: 'Ol',
};


function getModelGroupLabel(provider: ModelProvider, modelId: string): string {
  switch (provider) {
    case 'openai':
      if (modelId.startsWith('gpt-5.4')) return 'GPT-5.4';
      if (modelId.startsWith('gpt-5')) return 'GPT-5';
      if (modelId.startsWith('gpt-4.1')) return 'GPT-4.1';
      if (modelId.startsWith('gpt-4o') || modelId.startsWith('chatgpt-4o')) return 'GPT-4o';
      if (modelId.startsWith('gpt-4')) return 'GPT-4';
      if (modelId.startsWith('gpt-3')) return 'GPT-3.5';
      if (/^o\d/.test(modelId)) return 'o-series';
      return 'Other';
    case 'anthropic':
      if (modelId.includes('-4-') || modelId.includes('-4.')) return 'Claude 4';
      if (modelId.includes('3-5')) return 'Claude 3.5';
      if (modelId.includes('-3-')) return 'Claude 3';
      return 'Other';
    case 'gemini':
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

export function SettingsModal() {
  const {
    showSettings,
    setShowSettings,
    ollamaStatus,
    ollamaModels,
    setOllamaModels,
    setOllamaStatus,
    providerModels,
    setProviderModels,
    enabledProviderModels,
    setEnabledProviderModels,
    documentLayout,
    setDocumentLayout,
    chunkPresetShort,
    chunkPresetMedium,
    chunkPresetLong,
    setChunkPresetShort,
    setChunkPresetMedium,
    setChunkPresetLong,
    ollamaBaseUrl,
    setOllamaBaseUrl,
  } = useUiStore();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [showPricingOverrides, setShowPricingOverrides] = useState(false);
  const [showSecurityAdvisory, setShowSecurityAdvisory] = useState(false);
  const [activeProviderTab, setActiveProviderTab] = useState<ModelProvider>('openai');
  const [refreshErrors, setRefreshErrors] = useState<Partial<Record<ModelProvider, string>>>({});
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const trapRef = useFocusTrap(showSettings, () => setShowSettings(false));
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const availableProviderModels = useMemo(
    () => Object.fromEntries(
      MODEL_PROVIDER_ORDER.map((provider) => [
        provider,
        provider === 'ollama'
          ? ollamaModels
          : providerModels[provider]
              ?.map((entry) => entry.id)
              .filter((id) => isShowableModel(provider, id))
            ?? MODEL_CATALOG.filter((entry) => entry.provider === provider).map((entry) => entry.id),
      ]),
    ) as Record<ModelProvider, string[]>,
    [ollamaModels, providerModels],
  );
  const activeProviderModels = availableProviderModels[activeProviderTab] ?? [];
  const activeEnabledModels = getSelectableModelIds(activeProviderTab, {
    enabledModelIds: enabledProviderModels[activeProviderTab],
    availableModelIds: activeProviderModels,
  });

  const refreshOllama = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setProviderModels('ollama', models.map((id) => ({ id })));
      setOllamaStatus('connected');
      setRefreshErrors((prev) => ({ ...prev, ollama: undefined }));
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: any) {
      setOllamaModels([]);
      setProviderModels('ollama', []);
      setOllamaStatus('disconnected');
      setRefreshErrors((prev) => ({ ...prev, ollama: err?.message ?? t('ollama.disconnected') }));
      toast.error(t('ollama.disconnected'), {
        description: err?.message,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshProviderModels = async (provider: ModelProvider) => {
    if (provider === 'ollama') {
      await refreshOllama();
      return;
    }
    setRefreshing(true);
    try {
      const models = await settingsService.discoverProviderModels(provider);
      setProviderModels(provider, models);
      if (enabledProviderModels[provider] === undefined) {
        const catalogIds = new Set(
          MODEL_CATALOG.filter((e) => e.provider === provider).map((e) => e.id),
        );
        const initialEnabled = models
          .map((m) => m.id)
          .filter((id) => isShowableModel(provider, id) && catalogIds.has(id));
        if (initialEnabled.length > 0) {
          setEnabledProviderModels(provider, initialEnabled);
        }
      }
      setRefreshErrors((prev) => ({ ...prev, [provider]: undefined }));
      toast.success(t('settings.modelsRefreshed', {
        provider: PROVIDER_LABELS[provider],
        count: models.length,
      }));
    } catch (err: any) {
      const message = err?.message ?? String(err);
      setRefreshErrors((prev) => ({ ...prev, [provider]: message }));
      toast.error(t('settings.modelsRefreshFailed', { provider: PROVIDER_LABELS[provider] }), {
        description: message,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const toggleProviderModel = (provider: ModelProvider, modelId: string) => {
    const hasKey = provider === 'ollama' || !!keyStatuses[provider];
    const current = enabledProviderModels[provider];
    const base = current === undefined
      ? (hasKey ? [...availableProviderModels[provider]] : [])
      : [...current];
    const set = new Set(base);
    if (set.has(modelId)) {
      set.delete(modelId);
    } else {
      set.add(modelId);
    }
    setEnabledProviderModels(provider, availableProviderModels[provider].filter((id) => set.has(id)));
  };

  const toggleProviderModelGroup = (provider: ModelProvider, groupIds: string[]) => {
    const hasKey = provider === 'ollama' || !!keyStatuses[provider];
    const current = enabledProviderModels[provider];
    const base = current === undefined
      ? (hasKey ? [...availableProviderModels[provider]] : [])
      : [...current];
    const allEnabled = groupIds.every((id) => base.includes(id));
    const set = new Set(base);
    if (allEnabled) {
      groupIds.forEach((id) => set.delete(id));
    } else {
      groupIds.forEach((id) => set.add(id));
    }
    setEnabledProviderModels(provider, availableProviderModels[provider].filter((id) => set.has(id)));
  };

  useEffect(() => {
    if (!showSettings || activeProviderTab === 'ollama') return;
    if (!keyStatuses[activeProviderTab]) return;
    if (providerModels[activeProviderTab] !== undefined) return;
    void refreshProviderModels(activeProviderTab);
  }, [activeProviderTab, keyStatuses, providerModels, showSettings]);

  return (
    <AnimatePresence>
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-3xl"
          >
            <EditorialModalShell
              titleId="settings-title"
              title={t('settings.title')}
              closeLabel={t('settings.close')}
              onClose={() => setShowSettings(false)}
              widthClassName="max-w-3xl"
              bodyClassName="px-6 py-6 md:px-8"
              footer={
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {t('common.close')}
                  </button>
                </div>
              }
            >
            <div className="space-y-12">
              {/* Segmentation defaults */}
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('settings.segmentation')}
                </p>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  {t('settings.segmentationHint')}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                      {t('settings.chunkPresetShort')}
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={chunkPresetMedium - 50}
                      step={50}
                      value={chunkPresetShort}
                      onChange={(e) => setChunkPresetShort(Number(e.target.value) || 50)}
                      className="w-full rounded-[18px] border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    />
                    <p className="text-[10px] leading-relaxed text-editorial-muted">
                      {t('settings.chunkPresetShortHint')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                      {t('settings.chunkPresetMedium')}
                    </label>
                    <input
                      type="number"
                      min={chunkPresetShort + 50}
                      max={chunkPresetLong - 50}
                      step={50}
                      value={chunkPresetMedium}
                      onChange={(e) => setChunkPresetMedium(Number(e.target.value) || 50)}
                      className="w-full rounded-[18px] border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    />
                    <p className="text-[10px] leading-relaxed text-editorial-muted">
                      {t('settings.chunkPresetMediumHint')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-editorial-muted">
                      {t('settings.chunkPresetLong')}
                    </label>
                    <input
                      type="number"
                      min={chunkPresetMedium + 50}
                      step={50}
                      value={chunkPresetLong}
                      onChange={(e) => setChunkPresetLong(Number(e.target.value) || 50)}
                      className="w-full rounded-[18px] border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    />
                    <p className="text-[10px] leading-relaxed text-editorial-muted">
                      {t('settings.chunkPresetLongHint')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Layout lettura */}
              <div className="space-y-4">
                <p id="reader-layout-label" className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('header.readerLayout')}
                </p>
                <LayoutRadioGroup
                  value={documentLayout}
                  onChange={setDocumentLayout}
                  options={[
                    { value: 'auto', label: t('document.layoutAuto'), icon: <Sparkles size={14} /> },
                    { value: 'standard', label: t('document.layoutStandard'), icon: <Columns2 size={14} /> },
                    { value: 'book', label: t('document.layoutBook'), icon: <BookOpen size={14} /> },
                  ]}
                />
              </div>

              {/* Provider workspace */}
              <div className="space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('settings.providerConfig')}
                </label>
                <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20 p-6 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {MODEL_PROVIDER_ORDER.map((provider) => {
                      const active = provider === activeProviderTab;
                      return (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => setActiveProviderTab(provider)}
                          title={PROVIDER_LABELS[provider]}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                            active
                              ? 'border-editorial-accent bg-editorial-accent text-white'
                              : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
                          }`}
                        >
                          {PROVIDER_ABBREV[provider]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-5 border-t border-editorial-border pt-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                            {PROVIDER_LABELS[activeProviderTab]}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-editorial-muted">
                            {t('settings.enabledModelsHint')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-editorial-border px-3 py-1 text-[10px] font-mono text-editorial-muted">
                            {activeEnabledModels.length}/{activeProviderModels.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => void refreshProviderModels(activeProviderTab)}
                            disabled={refreshing || (activeProviderTab !== 'ollama' && !keyStatuses[activeProviderTab])}
                            className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                          >
                            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                            {t('settings.refreshModels')}
                          </button>
                        </div>
                      </div>

                      {activeProviderTab === 'ollama' ? (
                        <div className="space-y-4 rounded-[18px] border border-editorial-border bg-editorial-bg/60 p-4">
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
                                    refreshOllama();
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
                            <button
                              onClick={() => refreshOllama()}
                              disabled={refreshing}
                              title={t('ollama.refresh')}
                              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                              aria-label={t('ollama.refresh')}
                            >
                              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                              {t('ollama.refresh')}
                            </button>
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
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-editorial-border bg-editorial-bg/60 p-4">
                          <ApiKeyInput
                            label={PROVIDER_LABELS[activeProviderTab]}
                            provider={activeProviderTab}
                          />
                        </div>
                      )}

                      {activeProviderTab !== 'ollama' && !keyStatuses[activeProviderTab] && (
                        <p className="text-xs text-editorial-muted italic">
                          {t('settings.configureKeyToDiscover')}
                        </p>
                      )}
                      {refreshErrors[activeProviderTab] && (
                        <p className="text-xs text-editorial-warning">
                          {refreshErrors[activeProviderTab]}
                        </p>
                      )}
                    </div>

                    {activeProviderModels.length === 0 ? (
                      <p className="rounded-[18px] border border-dashed border-editorial-border px-4 py-5 text-sm italic text-editorial-muted">
                        {activeProviderTab === 'ollama'
                          ? t('ollama.noModels')
                          : t('settings.noKnownModels')}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-editorial-muted">
                            {t('settings.modelTypesLegend')}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-editorial-success/30 bg-editorial-success/10 px-2 py-0.5 text-xs font-mono text-editorial-success">
                            <Bot size={11} />{t('pipeline.modelReasoning.non_reasoning')}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-editorial-accent/30 bg-editorial-accent/10 px-2 py-0.5 text-xs font-mono text-editorial-accent">
                            <Brain size={11} />{t('pipeline.modelReasoning.reasoning')}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-editorial-warning/30 bg-editorial-warning/10 px-2 py-0.5 text-xs font-mono text-editorial-warning">
                            <Wand2 size={11} />{t('pipeline.modelReasoning.optional')}
                          </span>
                        </div>

                        {(() => {
                          const hasKey = activeProviderTab === 'ollama' || !!keyStatuses[activeProviderTab];
                          const explicitEnabled = enabledProviderModels[activeProviderTab];
                          const groups = activeProviderTab === 'ollama'
                            ? [{ label: '', ids: activeProviderModels }]
                            : groupModelIds(activeProviderTab, activeProviderModels);
                          const showGroupHeaders = groups.length > 1;

                          return (
                            <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                              {groups.map(({ label, ids }) => {
                                const isCollapsed = collapsedGroups.has(label);
                                const enabledInGroup = hasKey
                                  ? ids.filter((id) => explicitEnabled === undefined || explicitEnabled.includes(id))
                                  : [];
                                const allGroupChecked = ids.length > 0 && enabledInGroup.length === ids.length;
                                const someGroupChecked = enabledInGroup.length > 0;
                                return (
                                  <div key={label || '_all'} className="space-y-1.5">
                                    {showGroupHeaders && label && (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          ref={(el) => {
                                            if (el) el.indeterminate = !allGroupChecked && someGroupChecked;
                                          }}
                                          checked={allGroupChecked}
                                          onChange={() => toggleProviderModelGroup(activeProviderTab, ids)}
                                          disabled={!hasKey}
                                          className="h-3.5 w-3.5 cursor-pointer rounded border-editorial-border accent-editorial-accent focus:ring-editorial-accent disabled:opacity-40"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setCollapsedGroups((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(label)) next.delete(label);
                                            else next.add(label);
                                            return next;
                                          })}
                                          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none"
                                        >
                                          {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                          {label}
                                        </button>
                                      </div>
                                    )}
                                    {!isCollapsed && ids.map((modelId) => {
                                      const discoveredModel = providerModels[activeProviderTab]?.find((m) => m.id === modelId);
                                      const checked = hasKey && (explicitEnabled === undefined || explicitEnabled.includes(modelId));
                                      return (
                                        <label
                                          key={modelId}
                                          className="flex items-center gap-3 rounded-[16px] border border-editorial-border bg-editorial-bg/60 px-4 py-2.5 transition-colors hover:border-editorial-accent/40"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleProviderModel(activeProviderTab, modelId)}
                                            className="h-4 w-4 rounded border-editorial-border accent-editorial-accent focus:ring-editorial-accent"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-mono text-editorial-ink">{modelId}</span>
                                              <ModelCapabilityHint
                                                provider={activeProviderTab}
                                                model={modelId}
                                                iconOnly
                                              />
                                              {discoveredModel?.displayName && discoveredModel.displayName !== modelId && (
                                                <span className="text-xs italic text-editorial-muted">
                                                  {discoveredModel.displayName}
                                                </span>
                                              )}
                                              {discoveredModel?.contextWindow && (
                                                <span className="rounded-full border border-editorial-border px-2 py-0.5 text-[10px] font-mono text-editorial-muted">
                                                  {t('settings.contextWindowBadge', {
                                                    count: discoveredModel.contextWindow.toLocaleString(),
                                                  })}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {enabledProviderModels[activeProviderTab] !== undefined && activeEnabledModels.length === 0 && (
                      <p className="text-xs text-editorial-warning">
                        {t('settings.noEnabledModelsWarning')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Pricing Overrides */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowPricingOverrides(!showPricingOverrides)}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-expanded={showPricingOverrides}
                >
                  {showPricingOverrides ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {t('cost.pricingOverrides')}
                </button>
                {showPricingOverrides && (
                  <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-5">
                    <p className="text-[10px] text-editorial-muted italic">{t('cost.overrideHint')}</p>
                    <div className="border border-editorial-border overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-editorial-border bg-editorial-textbox/30">
                            <th className="text-left px-3 py-2 font-bold uppercase tracking-widest text-editorial-muted">Model</th>
                            <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-editorial-muted">Input $/1M</th>
                            <th className="text-right px-3 py-2 font-bold uppercase tracking-widest text-editorial-muted">Output $/1M</th>
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
                                      className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
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
                          className="text-[10px] font-bold uppercase tracking-widest text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        >
                          {t('cost.resetAll')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20">
                <button
                  type="button"
                  onClick={() => setShowSecurityAdvisory((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  aria-expanded={showSecurityAdvisory}
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={18} className="text-editorial-accent shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                        {t('settings.securityAdvisory')}
                      </div>
                    </div>
                  </div>
                  {showSecurityAdvisory ? <ChevronUp size={14} className="text-editorial-muted" /> : <ChevronDown size={14} className="text-editorial-muted" />}
                </button>
                {showSecurityAdvisory ? (
                  <div className="border-t border-editorial-border px-5 py-4">
                    <p className="text-sm leading-relaxed text-editorial-muted">
                      {t('settings.securityMessage')}
                    </p>
                  </div>
                ) : null}
              </div>

              </div>
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface LayoutOption {
  value: string;
  label: string;
  icon: React.ReactNode;
}

function LayoutRadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: any) => void;
  options: LayoutOption[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (next === -1) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby="reader-layout-label"
      className="flex items-center gap-2"
    >
      {options.map(({ value: optValue, label, icon }, i) => {
        const checked = value === optValue;
        return (
          <button
            key={optValue}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(optValue)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`flex items-center gap-2 border px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
              checked
                ? 'border-editorial-ink bg-editorial-ink text-white'
                : 'border-editorial-border text-editorial-muted hover:border-editorial-ink hover:text-editorial-ink'
            }`}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </div>
  );
}
