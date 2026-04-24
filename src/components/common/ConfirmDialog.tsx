import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '../../stores/confirmStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function ConfirmDialog() {
  const { open, request, resolve } = useConfirmStore();
  const { t } = useTranslation();
  const trapRef = useFocusTrap(open, () => resolve(false));

  return (
    <AnimatePresence>
      {open && request && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
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
            <div className="flex items-start gap-4">
              {request.danger && (
                <AlertTriangle
                  size={20}
                  className="text-editorial-accent shrink-0 mt-1"
                  aria-hidden="true"
                />
              )}
              <div className="flex-1 space-y-3">
                <h3
                  id="confirm-title"
                  className="font-display text-lg italic tracking-tight text-editorial-ink"
                >
                  {request.title}
                </h3>
                {request.message && (
                  <p
                    id="confirm-message"
                    className="text-xs text-editorial-muted leading-relaxed"
                  >
                    {request.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => resolve(false)}
                className="px-5 py-3 border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {request.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                onClick={() => resolve(true)}
                autoFocus={!request.danger}
                className={`px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2 ${
                  request.danger
                    ? 'bg-editorial-accent hover:bg-editorial-accent/90'
                    : 'bg-editorial-ink hover:bg-editorial-ink/90'
                }`}
              >
                {request.confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
