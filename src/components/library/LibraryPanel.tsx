import { reportUiError } from '../../utils/reportUiError';
import { useEffect, useState } from 'react';
import { BookMarked, BookOpenText, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore, type LibraryTab } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { confirm } from '../../stores/confirmStore';
import { DictionariesTab } from './DictionariesTab';
import { MemoriesTab } from './MemoriesTab';
import { PromptTemplatesTab } from './PromptTemplatesTab';
import { Dialog, DialogCancelButton, TabStrip } from '../ui';

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
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const {
    showLibraryPanel,
    activeTab,
    libraryScope,
    setShowLibraryPanel,
    loadGlossaries,
    dirtyIds,
    saveAllDirty,
    discardDirty,
  } = useLibraryStore();
  const { activeWorkspace } = useWorkspaceStore();
  const isGlobalScope = libraryScope === 'global';

  const handleClose = async () => {
    if (busy || closing) return;
    setClosing(true);
    try {
      if (editing && !await confirm({ title: t('library.discardDraftTitle'), message: t('library.discardDraftMessage'),
        confirmLabel: t('library.discardDraft'), cancelLabel: t('common.cancel') })) return;
      if (dirtyIds.length > 0) {
        const save = await confirm({
          title: t('library.unsavedChangesTitle'),
          message: t('library.unsavedChangesMessage'),
          confirmLabel: t('library.saveAndClose'),
          cancelLabel: t('library.closeWithoutSaving'),
        });
        if (save) {
          try { await saveAllDirty(); }
          catch { toast.error(t('library.dictionarySaveError')); return; }
        } else discardDirty();
      }
      setShowLibraryPanel(false);
    } finally { setClosing(false); }
  };

  useEffect(() => {
    if (!showLibraryPanel) return;
    if (isGlobalScope) {
      void loadGlossaries(null).catch((error: unknown) => reportUiError(t('library.dictionaryLoadError'), error));
      return;
    }
    if (activeWorkspace) void loadGlossaries(activeWorkspace.id).catch((error: unknown) => reportUiError(t('library.dictionaryLoadError'), error));
  }, [showLibraryPanel, isGlobalScope, activeWorkspace, loadGlossaries, t]);

  const panelTitle = isGlobalScope
    ? t('library.globalTitle')
    : activeWorkspace
      ? `${t('library.title')} — ${activeWorkspace.name}`
      : t('library.title');

  const tabBar = (
    <div className="flex items-center gap-2">
      <TabStrip tabs={TABS.map((tab) => ({ id: tab.id, label: `${t(tab.labelKey)}${(editing || busy) && tab.id !== activeTab ? ` — ${t('library.finishEditing')}` : ''}`,
        disabled: (editing || busy) && tab.id !== activeTab, icon: tabIcon(tab.id) }))}
        activeId={activeTab} onChange={(id) => setShowLibraryPanel(true, id as LibraryTab, libraryScope)} ariaLabel={panelTitle} idPrefix="library" />
      <span className="mx-1 h-4 w-px self-center bg-rule" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {t(TABS.find((tab) => tab.id === activeTab)?.labelKey ?? 'library.title')}
      </span>
    </div>
  );

  return (
    <Dialog
      compact
      closeDisabled={busy || closing}
      open={showLibraryPanel}
      onOpenChange={(open) => {
        if (!open) void handleClose();
      }}
      title={panelTitle}
      closeLabel={t('settings.close')}
      icon={<BookMarked size={22} />}
      widthClassName="max-w-3xl"
      panelClassName="h-[85vh]"
      bodyClassName="px-6 py-4"
      tabBar={tabBar}
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={() => void handleClose()} disabled={busy || closing}>
            {t('common.close')}
          </DialogCancelButton>
        </div>
      }
    >
      <div id={`library-panel-${activeTab}`} role="tabpanel" aria-labelledby={`library-tab-${activeTab}`}>
        {activeTab === 'dictionaries' && <DictionariesTab onEditingChange={setEditing} onBusyChange={setBusy} />}
        {activeTab === 'templates' && <PromptTemplatesTab onEditingChange={setEditing} onBusyChange={setBusy} />}
        {activeTab === 'memories' && <MemoriesTab onEditingChange={setEditing} onBusyChange={setBusy} />}
      </div>
    </Dialog>
  );
}
