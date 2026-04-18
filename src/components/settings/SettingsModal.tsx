import { useState, useEffect } from 'react';
import { X, AlertCircle, Server, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { ApiKeyInput } from './ApiKeyInput';
import { ollamaService } from '../../services/llmService';

export function SettingsModal() {
  const { showSettings, setShowSettings, ollamaStatus, ollamaModels, setOllamaModels, setOllamaStatus } = usePipelineStore();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (showSettings && ollamaStatus === 'unknown') {
      refreshOllama();
    }
  }, [showSettings]);

  const refreshOllama = async () => {
    setRefreshing(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
      setOllamaStatus('connected');
    } catch {
      setOllamaModels([]);
      setOllamaStatus('disconnected');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12">
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
              className="absolute top-8 right-8 text-editorial-muted hover:text-editorial-ink"
            >
              <X size={24} />
            </button>
            <h2 className="font-display text-3xl italic tracking-tight mb-12">{t('settings.title')}</h2>

            <div className="space-y-12">
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
                        <CheckCircle2 size={12} className="text-green-600" />
                      )}
                      {ollamaStatus === 'disconnected' && (
                        <XCircle size={12} className="text-red-500" />
                      )}
                    </div>
                    <button
                      onClick={refreshOllama}
                      disabled={refreshing}
                      className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink transition-colors disabled:opacity-30"
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

                  {ollamaStatus === 'connected' && ollamaModels.length === 0 && (
                    <p className="text-xs text-editorial-muted italic">
                      {t('ollama.noModels')}
                    </p>
                  )}
                </div>
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
                  className="bg-editorial-ink text-white px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
                >
                  {t('settings.saveClose')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
