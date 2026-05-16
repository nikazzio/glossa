import { useEffect } from 'react';
import { BookMarked, BookOpenText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore, type LibraryTab } from '../../stores/libraryStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { confirm } from '../../stores/confirmStore';
import { DictionariesTab } from './DictionariesTab';
import { PromptTemplatesTab } from './PromptTemplatesTab';
import { EditorialModalShell } from '../common';

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
          className="fixed inset-0 z-[70] flex items-center justify-center p-6 sm:p-12"
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
            className="relative flex h-[85vh] w-full max-w-3xl flex-col"
          >
            <EditorialModalShell
              titleId="library-panel-title"
              title={t('library.title')}
              closeLabel={t('settings.close')}
              onClose={handleClose}
              icon={<BookMarked size={22} />}
              widthClassName="max-w-3xl"
              panelClassName="h-[85vh]"
              bodyClassName="px-0 py-0"
              footer={
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {t('common.close')}
                  </button>
                </div>
              }
            >
              <div className="flex h-full flex-col">
                <div className="border-b border-editorial-border px-6 py-3 md:px-8">
                  <div className="flex gap-2" role="tablist">
                    {TABS.map((tab) => (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => useLibraryStore.getState().setShowLibraryPanel(true, tab.id)}
                        className={`rounded-full border p-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                          activeTab === tab.id
                            ? 'border-editorial-accent bg-editorial-accent text-white'
                            : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
                        }`}
                        title={t(tab.labelKey)}
                        aria-label={t(tab.labelKey)}
                        >
                          {tab.id === 'dictionaries' ? <BookMarked size={16} /> : <BookOpenText size={16} />}
                        </button>
                    ))}
                    <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
                    <span className="self-center font-display text-sm italic text-editorial-ink">
                      {t(TABS.find((tab) => tab.id === activeTab)?.labelKey ?? 'library.title')}
                    </span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 custom-scrollbar">
                  {activeTab === 'dictionaries' && <DictionariesTab />}
                  {activeTab === 'templates' && <PromptTemplatesTab />}
                </div>
              </div>
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
