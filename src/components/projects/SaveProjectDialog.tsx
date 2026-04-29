import { Save, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface SaveProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => Promise<void> | void;
  saving?: boolean;
}

export function SaveProjectDialog({
  open,
  onClose,
  onConfirm,
  saving = false,
}: SaveProjectDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const trapRef = useFocusTrap(open, onClose);

  useEffect(() => {
    if (!open) {
      setName('');
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!name.trim() || saving) return;
    await onConfirm(name.trim());
  };

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-project-title"
          aria-describedby="save-project-description"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/70 backdrop-blur-sm"
            onClick={saving ? undefined : onClose}
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative w-full max-w-md border border-editorial-border bg-editorial-bg p-8 shadow-2xl"
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              title={t('common.cancel')}
              aria-label={t('common.cancel')}
              className="absolute right-5 top-5 text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4">
              <div className="mt-1 rounded-full border border-editorial-border bg-editorial-textbox/45 p-2 text-editorial-accent">
                <Save size={18} />
              </div>
              <div className="flex-1 space-y-3">
                <h3
                  id="save-project-title"
                  className="font-display text-lg italic tracking-tight text-editorial-ink"
                >
                  {t('projects.firstSaveTitle')}
                </h3>
                <p
                  id="save-project-description"
                  className="text-xs leading-relaxed text-editorial-muted"
                >
                  {t('projects.firstSaveDescription')}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleConfirm();
                  }
                  if (event.key === 'Escape' && !saving) {
                    event.preventDefault();
                    onClose();
                  }
                }}
                placeholder={t('projects.namePlaceholder')}
                className="w-full border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!name.trim() || saving}
                className="bg-editorial-ink px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
              >
                {saving ? t('projects.statusSaving') : t('projects.createAndSave')}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
