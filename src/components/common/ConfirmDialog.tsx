import { AlertTriangle, X } from 'lucide-react';
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
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby={request.message ? 'confirm-message' : undefined}
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
            onClick={() => resolve(false)}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-md rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]"
          >
            {/* Header */}
            <div className="border-b border-editorial-border px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {request.danger && (
                    <AlertTriangle size={20} className="text-editorial-accent shrink-0" aria-hidden="true" />
                  )}
                  <h3
                    id="confirm-title"
                    className="font-display text-2xl italic tracking-tight text-editorial-ink"
                  >
                    {request.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => resolve(false)}
                  aria-label={t('common.close')}
                  title={t('common.close')}
                  className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            {request.message && (
              <div className="px-6 py-5">
                <p id="confirm-message" className="text-sm leading-relaxed text-editorial-muted">
                  {request.message}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-editorial-border px-6 py-4">
              <button
                type="button"
                onClick={() => resolve(false)}
                className="rounded-full border border-editorial-border px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-editorial-muted transition-colors hover:border-editorial-ink/40 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {request.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => resolve(true)}
                autoFocus={!request.danger}
                className={`rounded-full px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2 ${
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
