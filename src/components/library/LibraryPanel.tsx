import { useEffect } from 'react';
import { BookMarked, BookOpenText, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore, type LibraryTab } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { confirm } from '../../stores/confirmStore';
import { DictionariesTab } from './DictionariesTab';
import { MemoriesTab } from './MemoriesTab';
import { PromptTemplatesTab } from './PromptTemplatesTab';
import { Dialog, DialogCancelButton, IconButton } from '../ui';

const TABS: { id: LibraryTab; labelKey: string }[] = [
  { id: 'dictionaries', labelKey: 'library.tabDictionaries' },
  { id: 'templates', labelKey: 'library.tabTemplates' },
  { id: 'memories', labelKey: 'library.tabMemories' },
];

function tabIcon(tab: LibraryTab) {
  if (tab === 'dictionaries') return <BookMarked size={16} />;
  if (tab === 'templates') return <BookOpenText size={16} />;
  return <Brain size={16} />;
}

export function LibraryPanel() {
  const { t } = useTranslation();
  const {
    showLibraryPanel,
    activeTab,
    libraryScope,
    setShowLibraryPanel,
    loadGlossaries,
    dirtyIds,
    saveAllDirty,
  } = useLibraryStore();
  const { activeWorkspace } = useWorkspaceStore();
  const isGlobalScope = libraryScope === 'global';

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

  useEffect(() => {
    if (!showLibraryPanel) return;
    if (isGlobalScope) {
      void loadGlossaries(null);
      return;
    }
    if (activeWorkspace) void loadGlossaries(activeWorkspace.id);
  }, [showLibraryPanel, isGlobalScope, activeWorkspace, loadGlossaries]);

  const panelTitle = isGlobalScope
    ? t('library.globalTitle')
    : activeWorkspace
      ? `${t('library.title')} — ${activeWorkspace.name}`
      : t('library.title');

  const tabBar = (
    <div className="flex gap-2" role="tablist" aria-label={panelTitle}>
      {TABS.map((tab) => {
        return (
          <IconButton
            key={tab.id}
            id={`library-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`library-panel-${tab.id}`}
            size="lg"
            tone={activeTab === tab.id ? 'accent' : 'default'}
            onClick={() => useLibraryStore.getState().setShowLibraryPanel(true, tab.id, libraryScope)}
            title={t(tab.labelKey)}
          >
            {tabIcon(tab.id)}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {t(TABS.find((tab) => tab.id === activeTab)?.labelKey ?? 'library.title')}
      </span>
    </div>
  );

  return (
    <Dialog
      open={showLibraryPanel}
      onOpenChange={(open) => {
        if (!open) void handleClose();
      }}
      title={panelTitle}
      closeLabel={t('settings.close')}
      icon={<BookMarked size={22} />}
      widthClassName="max-w-3xl"
      panelClassName="h-[85vh]"
      bodyClassName="px-6 py-6 md:px-8"
      tabBar={tabBar}
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={() => void handleClose()}>
            {t('common.close')}
          </DialogCancelButton>
        </div>
      }
    >
      {activeTab === 'dictionaries' && <DictionariesTab />}
      {activeTab === 'templates' && <PromptTemplatesTab />}
      {activeTab === 'memories' && <MemoriesTab />}
    </Dialog>
  );
}
