import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle,
  Sparkles, Columns2, BookOpen, ChevronDown, ChevronUp, SlidersHorizontal,
  ChevronsLeft, Copy, RotateCcw, Scissors, Layers, LayoutTemplate, Palette,
  LibraryBig, FileText, Type,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/uiStore';
import type { UiFont } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { ApiKeyInput } from './ApiKeyInput';
import { ollamaService } from '../../services/llmService';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { getKnownModelIds, getModelEntry, MODEL_CATALOG, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { usePricingStore } from '../../stores/pricingStore';
import { EditorialModalShell, ProviderLogo } from '../common';
import { IconButton } from '../ui';
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

type SettingsTab = 'translations' | 'provider';

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

function colorToHex(color: string | undefined): string {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => parseInt(v).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

function applyHexToColor(existing: string | undefined, hex: string): string {
  const m = (existing ?? '').match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  if (m) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${m[1]})`;
  }
  return hex;
}

const LAYOUT_OPTIONS: Array<{ value: 'auto' | 'standard' | 'book'; labelKey: string; icon: ReactNode }> = [
  { value: 'auto',     labelKey: 'document.layoutAuto',     icon: <Sparkles size={14} /> },
  { value: 'standard', labelKey: 'document.layoutStandard', icon: <Columns2 size={14} /> },
  { value: 'book',     labelKey: 'document.layoutBook',     icon: <BookOpen size={14} /> },
];

// Anteprima resa nel font stesso: il preview è il nome del font, mostrato nel proprio carattere.
const UI_FONT_OPTIONS: Array<{ value: UiFont; name: string; family: string }> = [
  { value: 'jakarta', name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif' },
  { value: 'geist',   name: 'Geist',             family: '"Geist", sans-serif' },
  { value: 'inter',   name: 'Inter',             family: '"Inter", sans-serif' },
  { value: 'plex',    name: 'IBM Plex Sans',     family: '"IBM Plex Sans", sans-serif' },
];

const PIPELINE_INIT_OPTIONS: Array<{ value: 'copy-first' | 'copy-previous' | 'defaults'; labelKey: string; icon: ReactNode }> = [
  { value: 'copy-first',    labelKey: 'settings.newPipelineInitCopyFirst',    icon: <ChevronsLeft size={14} /> },
  { value: 'copy-previous', labelKey: 'settings.newPipelineInitCopyPrevious', icon: <Copy size={14} /> },
  { value: 'defaults',      labelKey: 'settings.newPipelineInitDefaults',     icon: <RotateCcw size={14} /> },
];

function NavSelector<T extends string>({
  options,
  value,
  onChange,
  getLabel,
  ariaLabel,
}: {
  options: Array<{ value: T; icon: ReactNode; labelKey: string }>;
  value: T;
  onChange: (v: T) => void;
  getLabel: (labelKey: string) => string;
  ariaLabel?: string;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex items-center gap-2">
      {options.map((opt) => {
        const isActive = value === opt.value;
        const label = getLabel(opt.labelKey);
        return (
          <IconButton
            key={opt.value}
            size="md"
            tone={isActive ? 'accent' : 'default'}
            onClick={() => onChange(opt.value)}
            title={label}
            role="radio"
            aria-checked={isActive}
          >
            {opt.icon}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {active ? getLabel(active.labelKey) : ''}
      </span>
    </div>
  );
}

export function SettingsModal() {
  const {
    showSettings,
    setShowSettings,
    documentLayout,
    setDocumentLayout,
    highlightColors,
    setHighlightColor,
    uiFont,
    setUiFont,
  } = useUiStore();
  const {
    ollamaStatus,
    ollamaModels,
    setOllamaModels,
    setOllamaStatus,
    chunkPresetShort,
    chunkPresetMedium,
    chunkPresetLong,
    setChunkPresetShort,
    setChunkPresetMedium,
    setChunkPresetLong,
    ollamaBaseUrl,
    setOllamaBaseUrl,
    newPipelineInit,
    setNewPipelineInit,
  } = useConfigStore();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [showPricingOverrides, setShowPricingOverrides] = useState(false);
  const [showSecurityAdvisory, setShowSecurityAdvisory] = useState(false);
  const [activeProviderTab, setActiveProviderTab] = useState<ModelProvider>('openai');
  const [activeTab, setActiveTab] = useState<SettingsTab>('translations');
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const trapRef = useFocusTrap(showSettings, () => setShowSettings(false));
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();
  const { statuses: keyStatuses, refresh: refreshKeyStatuses } = useProviderKeyStatus();

  const refreshOllama = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: unknown) {
      setOllamaModels([]);
      setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const activeTabConfig: Array<{ id: SettingsTab; icon: ReactNode; label: string }> = [
    { id: 'translations', icon: <FileText size={14} />,          label: t('workspace.areas.translations.title') },
    { id: 'provider',     icon: <Server size={14} />,            label: t('settings.providerTab') },
  ];

  const disabledTabConfig: Array<{ icon: ReactNode; label: string }> = [
    { icon: <LibraryBig size={14} />,  label: t('workspace.areas.library.title') },
    { icon: <BookOpen size={14} />,    label: t('workspace.areas.transcriptions.title') },
  ];

  const tabBar = (
    <div role="tablist" aria-label={t('settings.panelTitle')} className="flex items-center gap-2">
      {activeTabConfig.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <IconButton
            key={tab.id}
            size="md"
            tone={isActive ? 'accent' : 'default'}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            id={`settings-tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
          >
            {tab.icon}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      {disabledTabConfig.map((tab) => (
        <IconButton
          key={tab.label}
          size="md"
          tone="default"
          title={`${tab.label} — Glossa 2.0`}
          disabled
        >
          {tab.icon}
        </IconButton>
      ))}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {activeTabConfig.find((tb) => tb.id === activeTab)?.label}
      </span>
    </div>
  );

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
              title={t('settings.panelTitle')}
              closeLabel={t('settings.close')}
              onClose={() => setShowSettings(false)}
              widthClassName="max-w-3xl"
              bodyClassName="px-6 py-6 md:px-8"
              panelClassName="h-[85vh]"
              tabBar={tabBar}
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
              {/* Tab: Traduzioni */}
              {activeTab === 'translations' && (
                <div
                  id="settings-panel-translations"
                  role="tabpanel"
                  aria-labelledby="settings-tab-translations"
                  className="space-y-12"
                >
                  {/* Segmentazione */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Scissors size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                        {t('settings.segmentation')}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
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
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
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
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
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
                      </div>
                    </div>
                  </div>

                  {/* Inizializzazione nuova pipeline */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Layers size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                        {t('settings.newPipelineInit')}
                      </p>
                    </div>
                    <NavSelector
                      options={PIPELINE_INIT_OPTIONS}
                      value={newPipelineInit}
                      onChange={setNewPipelineInit}
                      getLabel={(key) => t(key)}
                      ariaLabel={t('settings.newPipelineInit')}
                    />
                  </div>

                  {/* Layout lettura */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <LayoutTemplate size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                        {t('header.readerLayout')}
                      </p>
                    </div>
                    <NavSelector
                      options={LAYOUT_OPTIONS}
                      value={documentLayout}
                      onChange={setDocumentLayout}
                      getLabel={(key) => t(key)}
                      ariaLabel={t('header.readerLayout')}
                    />
                  </div>

                  {/* Evidenziazioni */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Palette size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                        {t('settings.highlights')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {([
                        { key: 'sourceTerm'   as const, label: t('settings.highlightSourceTerm') },
                        { key: 'matchTerm'    as const, label: t('settings.highlightMatchTerm') },
                        { key: 'mismatchTerm' as const, label: t('settings.highlightMismatchTerm') },
                        { key: 'search'       as const, label: t('settings.highlightSearch') },
                        { key: 'auditPhrase'  as const, label: t('settings.highlightAuditPhrase') },
                        { key: 'annotation'   as const, label: t('settings.highlightAnnotation') },
                      ]).map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-3 rounded-[20px] border border-editorial-border bg-editorial-bg/60 px-4 py-3.5 transition-colors hover:border-editorial-accent/40"
                        >
                          <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full shadow-sm">
                            <div className="absolute inset-0" style={{ backgroundColor: highlightColors[key] }} />
                            <input
                              type="color"
                              value={colorToHex(highlightColors[key])}
                              onChange={(e) => setHighlightColor(key, applyHexToColor(highlightColors[key], e.target.value))}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label={label}
                            />
                          </div>
                          <span className="mx-0.5 h-5 w-px shrink-0 bg-editorial-border/70" aria-hidden="true" />
                          <span className="font-display text-lg italic text-editorial-ink">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Tipografia */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Type size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[10px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.typography')}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-editorial-muted">{t('settings.uiFontHint')}</p>
                    <div role="radiogroup" aria-label={t('settings.uiFont')} className="grid grid-cols-2 gap-2">
                      {UI_FONT_OPTIONS.map((opt) => {
                        const isActive = uiFont === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => setUiFont(opt.value)}
                            className={`rounded-[20px] border px-4 py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                              isActive
                                ? 'border-editorial-accent bg-editorial-accent/10'
                                : 'border-editorial-border bg-editorial-bg/60 hover:border-editorial-accent/40'
                            }`}
                          >
                            <span className="block text-lg text-editorial-ink" style={{ fontFamily: opt.family }}>
                              {opt.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-editorial-muted" style={{ fontFamily: opt.family }}>
                              AaBbCc 0123 àèéìòù
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* Tab: Provider */}
              {activeTab === 'provider' && (
                <div
                  id="settings-panel-provider"
                  role="tabpanel"
                  aria-labelledby="settings-tab-provider"
                  className="space-y-12"
                >
                  {/* Provider workspace */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                      {t('settings.providerConfig')}
                    </p>
                    <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20 p-6 space-y-4">
                      <div
                        role="tablist"
                        aria-label={t('settings.providerConfig')}
                        className="flex flex-wrap gap-2"
                      >
                        {MODEL_PROVIDER_ORDER.map((provider) => {
                          const active = provider === activeProviderTab;
                          return (
                            <button
                              key={provider}
                              type="button"
                              onClick={() => setActiveProviderTab(provider)}
                              title={PROVIDER_LABELS[provider]}
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
                                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted hover:text-editorial-ink transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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
                                onKeyChange={refreshKeyStatuses}
                              />
                            </div>
                          )}

                          {activeProviderTab !== 'ollama' && !keyStatuses[activeProviderTab] && (
                            <p className="text-xs text-editorial-muted italic">
                              {t('settings.configureKeyToUse')}
                            </p>
                          )}
                        </div>

                        {activeProviderTab !== 'ollama' && (() => {
                          const hasKey = !!keyStatuses[activeProviderTab];
                          const groups = groupModelIds(activeProviderTab, getKnownModelIds(activeProviderTab));
                          return (
                            <div className="space-y-3">
                              {groups.map(({ label, ids }) => (
                                <div key={label || '_all'} className="space-y-1.5">
                                  {label && (
                                    <p className="px-1 text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                                      {label}
                                    </p>
                                  )}
                                  {ids.map((modelId) => {
                                    const entry = getModelEntry(activeProviderTab, modelId);
                                    return (
                                      <div
                                        key={modelId}
                                        className={`flex items-start gap-3 rounded-[16px] border border-editorial-border bg-editorial-bg/60 px-4 py-2.5 transition-opacity ${!hasKey ? 'opacity-40' : ''}`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-mono text-editorial-ink">{modelId}</span>
                                            <ModelCapabilityHint provider={activeProviderTab} model={modelId} iconOnly />
                                            {entry?.contextWindow && (
                                              <span className="rounded-full border border-editorial-border px-2 py-0.5 text-[10px] font-mono text-editorial-muted">
                                                {entry.contextWindow >= 1_000_000
                                                  ? `${(entry.contextWindow / 1_000_000).toFixed(0)}M`
                                                  : `${Math.round(entry.contextWindow / 1_000)}K`}
                                              </span>
                                            )}
                                            {entry?.pricing && (
                                              <span className="rounded-full border border-editorial-border px-2 py-0.5 text-[10px] font-mono text-editorial-muted">
                                                ${entry.pricing.input}/${entry.pricing.output}
                                              </span>
                                            )}
                                            {entry?.status === 'preview' && (
                                              <span className="rounded-full border border-editorial-warning/40 bg-editorial-warning/10 px-2 py-0.5 text-[10px] font-mono text-editorial-warning">
                                                preview
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
                      className="flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      aria-expanded={showPricingOverrides}
                    >
                      {showPricingOverrides ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {t('cost.pricingOverrides')}
                    </button>
                    {showPricingOverrides && (
                      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-5">
                        <p className="text-xs text-editorial-muted italic">{t('cost.overrideHint')}</p>
                        <div className="border border-editorial-border overflow-x-auto">
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="border-b border-editorial-border bg-editorial-textbox/30">
                                <th className="text-left px-3 py-2 font-bold uppercase tracking-[0.35em] text-editorial-muted">Model</th>
                                <th className="text-right px-3 py-2 font-bold uppercase tracking-[0.35em] text-editorial-muted">Input $/1M</th>
                                <th className="text-right px-3 py-2 font-bold uppercase tracking-[0.35em] text-editorial-muted">Output $/1M</th>
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
                                          className="text-xs font-bold uppercase tracking-[0.28em] text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
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
                              className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                            >
                              {t('cost.resetAll')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Security Advisory */}
                  <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/20">
                    <button
                      type="button"
                      onClick={() => setShowSecurityAdvisory((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={showSecurityAdvisory}
                    >
                      <div className="flex items-center gap-3">
                        <AlertCircle size={18} className="text-editorial-accent shrink-0" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
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
              )}
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
