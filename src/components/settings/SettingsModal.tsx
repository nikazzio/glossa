import { useRef, useState } from 'react';
import { X, AlertCircle, Server, RefreshCw, CheckCircle2, XCircle, HelpCircle, Sparkles, Columns2, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiStore } from '../../stores/uiStore';
import { ApiKeyInput } from './ApiKeyInput';
import { ollamaService } from '../../services/llmService';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MODEL_CATALOG } from '../../models/catalog';
import { MODEL_PRICING } from '../../constants';
import { usePricingStore } from '../../stores/pricingStore';

export function SettingsModal() {
  const {
    showSettings,
    setShowSettings,
    ollamaStatus,
    ollamaModels,
    setOllamaModels,
    setOllamaStatus,
    documentLayout,
    setDocumentLayout,
  } = useUiStore();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [showPricingOverrides, setShowPricingOverrides] = useState(false);
  const trapRef = useFocusTrap(showSettings, () => setShowSettings(false));
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();

  const refreshOllama = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: any) {
      setOllamaModels([]);
      setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), {
        description: err?.message,
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-editorial-bg w-full max-w-2xl max-h-[80vh] overflow-y-auto p-12 custom-scrollbar shadow-2xl border border-editorial-border"
          >
            <button
              onClick={() => setShowSettings(false)}
              title={t('settings.close')}
              className="absolute top-8 right-8 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('settings.close')}
            >
              <X size={24} />
            </button>
            <h2 id="settings-title" className="font-display text-3xl italic tracking-tight mb-12">{t('settings.title')}</h2>

            <div className="space-y-12">
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

              {/* Cloud Providers */}
              <div className="space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('settings.providerConfig')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ApiKeyInput label="Gemini (Native)" provider="gemini" />
                  <ApiKeyInput label="OpenAI" provider="openai" />
                  <ApiKeyInput label="Anthropic" provider="anthropic" />
                  <ApiKeyInput label="DeepSeek" provider="deepseek" />
                </div>
              </div>

              {/* Ollama Section */}
              <div className="space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('ollama.title')}
                </label>
                <div className="p-6 border border-editorial-border bg-editorial-textbox/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Server size={16} className="text-editorial-muted" />
                      <span className="text-xs font-mono">localhost:11434</span>
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

                  {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                        {t('ollama.availableModels')} ({ollamaModels.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {ollamaModels.map((m) => (
                          <span key={m} className="px-2 py-1 bg-editorial-bg border border-editorial-border text-[10px] font-mono">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

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
                  <div className="space-y-3">
                    <p className="text-[10px] text-editorial-muted italic">{t('cost.overrideHint')}</p>
                    <div className="border border-editorial-border overflow-x-auto">
                      <table className="w-full text-[11px] font-mono">
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

              <div className="p-8 border border-editorial-border bg-editorial-textbox/20 flex gap-4 items-start">
                <AlertCircle size={20} className="text-editorial-accent shrink-0" />
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest">{t('settings.securityAdvisory')}</h4>
                  <p className="text-xs text-editorial-muted leading-relaxed">
                    {t('settings.securityMessage')}
                  </p>
                </div>
              </div>

              <div className="pt-8 border-t border-editorial-border flex justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-editorial-ink text-white px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
                >
                  {t('settings.close')}
                </button>
              </div>
            </div>
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
