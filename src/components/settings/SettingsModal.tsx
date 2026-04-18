import { X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePipelineStore } from '../../stores/pipelineStore';
import { ApiKeyInput } from './ApiKeyInput';

export function SettingsModal() {
  const { showSettings, setShowSettings } = usePipelineStore();

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
            <h2 className="font-display text-3xl italic tracking-tight mb-12">Global Config / Secrets</h2>

            <div className="space-y-12">
              <div className="space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                  Provider Configuration
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ApiKeyInput label="Gemini (Native)" provider="gemini" />
                  <ApiKeyInput label="OpenAI" provider="openai" />
                  <ApiKeyInput label="Anthropic" provider="anthropic" />
                  <ApiKeyInput label="DeepSeek" provider="deepseek" />
                </div>
              </div>

              <div className="p-8 border border-editorial-border bg-editorial-textbox/20 flex gap-4 items-start">
                <AlertCircle size={20} className="text-editorial-accent shrink-0" />
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest">Security Advisory</h4>
                  <p className="text-xs text-editorial-muted leading-relaxed">
                    API keys are retrieved from environment variables for production runs. Defining them here
                    locally (via VITE_ prefix) overrides defaults for this session. Always prefer the project's{' '}
                    <span className="text-editorial-ink font-bold">Secrets panel</span> for sensitive
                    integration.
                  </p>
                </div>
              </div>

              <div className="pt-8 border-t border-editorial-border flex justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-editorial-ink text-white px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-95"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
