import { Save } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';

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
            className="relative w-full max-w-md"
          >
            <EditorialModalShell
              titleId="save-project-title"
              title={t('projects.firstSaveTitle')}
              closeLabel={t('common.cancel')}
              onClose={onClose}
              closeDisabled={saving}
              icon={<Save size={20} />}
              description={
                <p id="save-project-description">
                  {t('projects.firstSaveDescription')}
                </p>
              }
              widthClassName="max-w-md"
              bodyClassName="px-6 py-6 md:px-8"
              footer={
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirm()}
                    disabled={!name.trim() || saving}
                    className="rounded-full bg-editorial-ink px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-35"
                  >
                    {saving ? t('projects.statusSaving') : t('projects.createAndSave')}
                  </button>
                </div>
              }
            >
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
                className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none transition-colors focus:border-editorial-accent focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
            </EditorialModalShell>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
