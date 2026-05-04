import { useEffect } from 'react';
import { BookMarked, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore, type LibraryTab } from '../../stores/libraryStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { confirm } from '../../stores/confirmStore';
import { DictionariesTab } from './DictionariesTab';
import { PromptTemplatesTab } from './PromptTemplatesTab';

const TABS: { id: LibraryTab; labelKey: string }[] = [
  { id: 'dictionaries', labelKey: 'library.tabDictionaries' },
  { id: 'templates', labelKey: 'library.tabTemplates' },
];

export function LibraryPanel() {
  const { t } = useTranslation();
  const {
    showLibraryPanel,
    activeTab,
    setShowLibraryPanel,
    loadGlossaries,
    dirtyIds,
    saveAllDirty,
  } = useLibraryStore();

  const handleClose = async () => {
    if (dirtyIds.length > 0) {
      const save = await confirm({
        title: t('library.unsavedChangesTitle'),
        message: t('library.unsavedChangesMessage'),
        confirmLabel: t('library.saveAndClose'),
        cancelLabel: t('library.closeWithoutSaving'),
      });
      if (save) {
        try {
          await saveAllDirty();
        } catch {
          toast.error(t('library.dictionarySaveError'));
        }
      }
    }
    setShowLibraryPanel(false);
  };

  const trapRef = useFocusTrap(showLibraryPanel, handleClose);

  useEffect(() => {
    if (showLibraryPanel) loadGlossaries();
  }, [showLibraryPanel, loadGlossaries]);

  return (
    <AnimatePresence>
      {showLibraryPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-panel-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-editorial-bg w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl border border-editorial-border"
          >
            <button
              onClick={handleClose}
              title={t('settings.close')}
              className="absolute top-5 right-5 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent z-10"
              aria-label={t('settings.close')}
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="px-8 pt-8 pb-0 shrink-0">
              <h2
                id="library-panel-title"
                className="font-display text-2xl italic tracking-tight mb-6 flex items-center gap-3"
              >
                <BookMarked size={24} className="text-editorial-accent" />
                {t('library.title')}
              </h2>

              {/* Tab bar */}
              <div className="flex gap-0 border-b border-editorial-border/60" role="tablist">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => useLibraryStore.getState().setShowLibraryPanel(true, tab.id)}
                    className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent border-b-2 -mb-px ${
                      activeTab === tab.id
                        ? 'border-editorial-ink text-editorial-ink'
                        : 'border-transparent text-editorial-muted hover:text-editorial-ink'
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-8 py-6 custom-scrollbar">
              {activeTab === 'dictionaries' && <DictionariesTab />}
              {activeTab === 'templates' && <PromptTemplatesTab />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
