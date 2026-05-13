import { CheckCircle2, XCircle, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { usePreflightStore } from '../../stores/preflightStore';
import { useUiStore } from '../../stores/uiStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function PreflightDialog() {
  const { t } = useTranslation();
  const { open, results, resolve } = usePreflightStore();
  const setShowSettings = useUiStore((state) => state.setShowSettings);
  const trapRef = useFocusTrap(open, () => resolve(false));

  const hasFailures = results.some((r) => !r.ok);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preflight-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/70 backdrop-blur-sm"
            onClick={() => resolve(false)}
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative bg-editorial-bg w-full max-w-md p-8 shadow-2xl border border-editorial-border"
          >
            <h3
              id="preflight-title"
              className="font-display text-lg italic tracking-tight text-editorial-ink mb-1"
            >
              {t('preflight.title')}
            </h3>
            <p className="text-xs text-editorial-muted mb-6">
              {hasFailures ? t('preflight.subtitleFailures') : t('preflight.subtitleOk')}
            </p>

            <ul className="space-y-3 mb-8" aria-label={t('preflight.title')}>
              {results.map((result) => (
                <li key={`${result.provider}:${result.model}`} className="flex items-start gap-3">
                  {result.ok ? (
                    <CheckCircle2
                      size={16}
                      className="text-green-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      size={16}
                      className="text-editorial-accent shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-editorial-ink">{result.label}</span>
                    {!result.ok && result.error && (
                      <p className="text-xs text-editorial-muted mt-0.5 break-words">{result.error}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap justify-end gap-3">
              {hasFailures && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      resolve(false);
                      setShowSettings(true);
                    }}
                    className="flex items-center gap-2 px-5 py-3 border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Settings size={12} aria-hidden="true" />
                    {t('preflight.openSettings')}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => resolve(true)}
                    className="px-5 py-3 border border-editorial-accent text-[10px] font-bold uppercase tracking-widest text-editorial-accent hover:bg-editorial-accent/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {t('preflight.proceedAnyway')}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
