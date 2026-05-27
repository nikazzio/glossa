import { CheckCircle2, XCircle, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { usePreflightStore } from '../../stores/preflightStore';
import { useUiStore } from '../../stores/uiStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from './EditorialModalShell';

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
            className="relative w-full max-w-md"
          >
            <EditorialModalShell
              titleId="preflight-title"
              title={t('preflight.title')}
              closeLabel={t('common.close')}
              onClose={() => resolve(false)}
              widthClassName="max-w-md"
              description={hasFailures ? t('preflight.subtitleFailures') : t('preflight.subtitleOk')}
              bodyClassName="px-6 py-6 md:px-8"
              footer={
                hasFailures ? (
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        resolve(false);
                        setShowSettings(true);
                      }}
                      className="flex items-center justify-center gap-2 rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink hover:bg-editorial-textbox/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    >
                      <Settings size={12} aria-hidden="true" />
                      {t('preflight.openSettings')}
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => resolve(true)}
                      className="rounded-full border border-editorial-accent px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-accent transition-colors hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    >
                      {t('preflight.proceedAnyway')}
                    </button>
                  </div>
                ) : null
              }
            >
              <ul className="space-y-3" aria-label={t('preflight.title')}>
                {results.map((result) => (
                  <li key={`${result.provider}:${result.model}`} className="flex items-start gap-3 rounded-[18px] border border-editorial-border/60 bg-editorial-textbox/15 px-4 py-3">
                    {result.ok ? (
                      <CheckCircle2
                        size={16}
                        className="text-editorial-success shrink-0 mt-0.5"
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
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
