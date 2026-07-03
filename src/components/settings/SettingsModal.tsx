import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle,
  Sparkles, Columns2, BookOpen, ChevronDown, ChevronUp, SlidersHorizontal,
  ChevronsLeft, Copy, RotateCcw, Scissors, Layers, LayoutTemplate, Palette,
  LibraryBig, FileText, Type, Sun, Moon, Monitor, Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/uiStore';
import type { SettingsTab, UiFont, DocumentFontSize, DocumentLineHeight, ColorScheme, HLColorSet } from '../../stores/uiStore';
import { HL_COLORS_LIGHT, HL_COLORS_DARK } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { ApiKeyInput } from './ApiKeyInput';
import { CustomProviderSection } from './CustomProviderSection';
import { ollamaService } from '../../services/llmService';
import { getKnownModelIds, getModelEntry, MODEL_CATALOG, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { usePricingStore } from '../../stores/pricingStore';
import { ProviderLogo } from '../common';
import { Dialog, IconButton, DialogCancelButton, Tooltip, ContrastBadge } from '../ui';
import type { ModelProvider } from '../../types';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';

/** Sfondo editoriale di riferimento per il controllo contrasto AA dell'accento. */
const ACCENT_CONTRAST_BG: Record<'light' | 'dark', string> = {
  light: '#F8F5F0',
  dark: '#1c1814',
};

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
    editorialAccentColor,
    setEditorialAccentColor,
    uiFont,
    setUiFont,
    colorScheme,
    setColorScheme,
    documentFontSize,
    setDocumentFontSize,
    documentLineHeight,
    setDocumentLineHeight,
    settingsTab: activeTab,
    setSettingsTab: setActiveTab,
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
  const [urlDraft, setUrlDraft] = useState(ollamaBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();
  const { statuses: keyStatuses, refresh: refreshKeyStatuses } = useProviderKeyStatus();
  const hlMode: 'light' | 'dark' = (() => {
    if (colorScheme === 'dark') return 'dark';
    if (colorScheme === 'light') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  })();
  // Merge chiave per chiave: uno stato persistito incompleto (chiavi mancanti da
  // una migrazione precedente) non deve far leggere `undefined` per un tipo di
  // evidenziazione — altrimenti lo swatch colore risulta vuoto/nero.
  const activeHlColors: HLColorSet = {
    ...(hlMode === 'dark' ? HL_COLORS_DARK : HL_COLORS_LIGHT),
    ...highlightColors[hlMode],
  };

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
    { id: 'typography',   icon: <Type size={14} />,              label: t('settings.typographyTab') },
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
    <Dialog
      open={showSettings}
      onOpenChange={(o) => {
        if (!o) setShowSettings(false);
      }}
      title={t('settings.panelTitle')}
      closeLabel={t('settings.close')}
      widthClassName="max-w-3xl"
      bodyClassName="px-6 py-6 md:px-8"
      panelClassName="h-[85vh]"
      tabBar={tabBar}
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={() => setShowSettings(false)}>{t('common.close')}</DialogCancelButton>
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
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.segmentation')}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                          {t('settings.chunkPresetShort')}
                        </label>
                        <input
                          type="number"
                          min={50}
                          max={chunkPresetMedium - 50}
                          step={50}
                          value={chunkPresetShort}
                          onChange={(e) => setChunkPresetShort(Number(e.target.value) || 50)}
                          className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                          {t('settings.chunkPresetMedium')}
                        </label>
                        <input
                          type="number"
                          min={chunkPresetShort + 50}
                          max={chunkPresetLong - 50}
                          step={50}
                          value={chunkPresetMedium}
                          onChange={(e) => setChunkPresetMedium(Number(e.target.value) || 50)}
                          className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                          {t('settings.chunkPresetLong')}
                        </label>
                        <input
                          type="number"
                          min={chunkPresetMedium + 50}
                          step={50}
                          value={chunkPresetLong}
                          onChange={(e) => setChunkPresetLong(Number(e.target.value) || 50)}
                          className="w-full rounded-md border border-editorial-border bg-editorial-bg px-4 py-3 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inizializzazione nuova pipeline */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Layers size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
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
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Palette size={11} className="text-editorial-accent shrink-0" />
                        <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                          {t('settings.highlights')}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 rounded-full border border-editorial-border px-2 py-0.5 text-[11px] font-sans text-editorial-muted">
                        {hlMode === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
                        {t(hlMode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
                      </span>
                    </div>
                    {([
                      {
                        groupLabel: t('settings.highlightsGlossaryGroup'),
                        items: [
                          { key: 'sourceTerm'   as const, label: t('settings.highlightSourceTerm') },
                          { key: 'matchTerm'    as const, label: t('settings.highlightMatchTerm') },
                          { key: 'mismatchTerm' as const, label: t('settings.highlightMismatchTerm') },
                        ],
                      },
                      {
                        groupLabel: t('settings.highlightsOtherGroup'),
                        items: [
                          { key: 'search'       as const, label: t('settings.highlightSearch') },
                          { key: 'auditPhrase'  as const, label: t('settings.highlightAuditPhrase') },
                          { key: 'annotation'   as const, label: t('settings.highlightAnnotation') },
                        ],
                      },
                    ]).map(({ groupLabel, items }) => (
                      <div key={groupLabel} className="space-y-1.5">
                        <p className="text-[10px] font-sans uppercase tracking-[0.14em] text-editorial-muted/70">
                          {groupLabel}
                        </p>
                        <div className="divide-y divide-editorial-border/70 border-y border-editorial-border/70">
                          {items.map(({ key, label }) => (
                            <label
                              key={key}
                              className="flex cursor-pointer items-center gap-3 py-3.5 transition-colors hover:text-editorial-accent"
                            >
                              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full shadow-sm">
                                <div className="absolute inset-0" style={{ backgroundColor: activeHlColors[key] }} />
                                <input
                                  type="color"
                                  value={colorToHex(activeHlColors[key])}
                                  onChange={(e) => setHighlightColor(hlMode, key, applyHexToColor(activeHlColors[key], e.target.value))}
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
                    ))}
                  </div>

                </div>
              )}

              {/* Tab: Tipografia */}
              {activeTab === 'typography' && (
                <div
                  id="settings-panel-typography"
                  role="tabpanel"
                  aria-labelledby="settings-tab-typography"
                  className="space-y-10"
                >
                  {/* Font UI */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <Type size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.uiFont')}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-editorial-muted">{t('settings.uiFontHint')}</p>
                    <div role="radiogroup" aria-label={t('settings.uiFont')} className="grid grid-cols-2 gap-x-6 border-y border-editorial-border/70">
                      {UI_FONT_OPTIONS.map((opt) => {
                        const isActive = uiFont === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => setUiFont(opt.value)}
                            className={`flex items-center justify-between gap-2 border-l-4 py-3.5 pl-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                              isActive
                                ? 'border-l-editorial-accent text-editorial-accent'
                                : 'border-l-transparent text-editorial-ink hover:border-l-editorial-border hover:text-editorial-accent'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-lg" style={{ fontFamily: opt.family }}>
                                {opt.name}
                              </span>
                              <span className="mt-0.5 block text-xs text-editorial-muted" style={{ fontFamily: opt.family }}>
                                AaBbCc 0123 àèéìòù
                              </span>
                            </span>
                            {isActive ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent" aria-hidden="true" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tema colori */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Sun size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.colorScheme')}
                      </p>
                    </div>
                    <div role="radiogroup" aria-label={t('settings.colorScheme')} className="flex gap-2">
                      {([
                        { value: 'light' as ColorScheme, icon: <Sun size={14} />, labelKey: 'settings.colorScheme_light' },
                        { value: 'dark'  as ColorScheme, icon: <Moon size={14} />, labelKey: 'settings.colorScheme_dark' },
                        { value: 'system' as ColorScheme, icon: <Monitor size={14} />, labelKey: 'settings.colorScheme_system' },
                      ]).map(({ value, icon, labelKey }) => {
                        const isActive = colorScheme === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => setColorScheme(value)}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-md border py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                              isActive
                                ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
                                : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
                            }`}
                          >
                            {icon}
                            {t(labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accento */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Palette size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.accentColor')}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-editorial-muted">{t('settings.accentColorHint')}</p>
                    <div className="flex gap-2">
                      {(['light', 'dark'] as const).map((mode) => (
                        <label
                          key={mode}
                          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-editorial-border bg-editorial-bg/60 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted transition-colors hover:border-editorial-accent/40"
                        >
                          <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full">
                            <span className="absolute inset-0" style={{ backgroundColor: editorialAccentColor[mode] }} />
                            <input
                              type="color"
                              value={editorialAccentColor[mode]}
                              onChange={(e) => setEditorialAccentColor(mode, e.target.value)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label={t(mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
                            />
                          </span>
                          {t(mode === 'dark' ? 'settings.colorScheme_dark' : 'settings.colorScheme_light')}
                          <ContrastBadge fg={editorialAccentColor[mode]} bg={ACCENT_CONTRAST_BG[mode]} />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Dimensione testo documento */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Type size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.docFontSize')}
                      </p>
                    </div>
                    <div role="radiogroup" aria-label={t('settings.docFontSize')} className="flex gap-2">
                      {(['sm', 'md', 'lg'] as DocumentFontSize[]).map((size) => {
                        const isActive = documentFontSize === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => setDocumentFontSize(size)}
                            className={`flex-1 rounded-md border py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                              isActive
                                ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
                                : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
                            }`}
                          >
                            {t(`settings.docFontSize_${size}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interlinea documento */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal size={11} className="text-editorial-accent shrink-0" />
                      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
                        {t('settings.docLineHeight')}
                      </p>
                    </div>
                    <div role="radiogroup" aria-label={t('settings.docLineHeight')} className="flex gap-2">
                      {(['tight', 'normal', 'relaxed'] as DocumentLineHeight[]).map((lh) => {
                        const isActive = documentLineHeight === lh;
                        return (
                          <button
                            key={lh}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => setDocumentLineHeight(lh)}
                            className={`flex-1 rounded-md border py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                              isActive
                                ? 'border-editorial-accent bg-editorial-accent/10 text-editorial-accent'
                                : 'border-editorial-border bg-editorial-bg/60 text-editorial-muted hover:border-editorial-accent/40'
                            }`}
                          >
                            {t(`settings.docLineHeight_${lh}`)}
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
                                <IconButton
                                  onClick={() => refreshOllama()}
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
                          const groups = groupModelIds(activeProviderTab, getKnownModelIds(activeProviderTab));
                          return (
                            <div className="space-y-3">
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
                                              <span className="rounded-full border border-editorial-border px-2 py-0.5 text-[11px] font-mono text-editorial-muted">
                                                {entry.contextWindow >= 1_000_000
                                                  ? `${(entry.contextWindow / 1_000_000).toFixed(0)}M`
                                                  : `${Math.round(entry.contextWindow / 1_000)}K`}
                                              </span>
                                            )}
                                            {entry?.pricing && (
                                              <span className="rounded-full border border-editorial-border px-2 py-0.5 text-[11px] font-mono text-editorial-muted">
                                                ${entry.pricing.input}/${entry.pricing.output}
                                              </span>
                                            )}
                                            {entry?.status === 'preview' && (
                                              <span className="rounded-full border border-editorial-warning/40 bg-editorial-warning/10 px-2 py-0.5 text-[11px] font-mono text-editorial-warning">
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
                              className="text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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
              )}
    </Dialog>
  );
}
