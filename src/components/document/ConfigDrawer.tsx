import { useEffect, useState } from 'react';
import { X, LibraryBig, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Drawer } from '../common';
import { PipelineConfig } from '../pipeline/PipelineConfig';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProjectStore } from '../../stores/projectStore';
import { assignGlossaryToProject } from '../../services/glossaryService';
import { upsertGlossaryEntries } from '../../services/glossaryService';
import { DictionaryEntryEditor } from '../library';

interface ConfigDrawerProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
}

export function ConfigDrawer({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
}: ConfigDrawerProps) {
  const { t } = useTranslation();
  const showConfigDrawer = useUiStore((state) => state.showConfigDrawer);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const [glossaryDirty, setGlossaryDirty] = useState(false);
  const [isSavingGlossary, setIsSavingGlossary] = useState(false);
  const { config, setConfig, assignGlossary } = usePipelineStore();
  const { glossaries, setShowLibraryPanel, loadGlossaries, isLoaded } = useLibraryStore();
  const { currentProjectId } = useProjectStore();

  useEffect(() => {
    if (showConfigDrawer && !isLoaded) loadGlossaries();
  }, [showConfigDrawer, isLoaded, loadGlossaries]);

  useEffect(() => {
    setGlossaryDirty(false);
  }, [config.assignedGlossaryId]);

  const handleDictChange = async (glossaryId: string) => {
    try {
      if (currentProjectId) {
        await assignGlossaryToProject(currentProjectId, glossaryId || null);
      }
      if (glossaryId) {
        await assignGlossary(glossaryId);
      } else {
        await assignGlossary(null);
      }
    } catch (err: any) {
      toast.error(t('library.dictionaryAssignError'), { description: err?.message });
    }
  };

  const handleSaveGlossary = async () => {
    if (!config.assignedGlossaryId) return;
    setIsSavingGlossary(true);
    try {
      await upsertGlossaryEntries(config.assignedGlossaryId, config.glossary);
      setGlossaryDirty(false);
      toast.success(t('library.dictionarySaved'));
    } catch (err: any) {
      toast.error(t('library.dictionarySaveError'), { description: err?.message });
    } finally {
      setIsSavingGlossary(false);
    }
  };

  const libraryGlossarySection = (
    <div className="space-y-3 rounded-[20px] border border-editorial-border/60 bg-editorial-textbox/20 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display italic text-sm text-editorial-ink">
          {t('library.assignedDictionary')}
        </span>
        <button
          onClick={() => setShowLibraryPanel(true, 'dictionaries')}
          title={t('library.openLibrary')}
          aria-label={t('library.openLibrary')}
          className="shrink-0 text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <LibraryBig size={16} />
        </button>
      </div>
      <select
        value={config.assignedGlossaryId ?? ''}
        onChange={(e) => handleDictChange(e.target.value)}
        className="w-full rounded-[12px] border border-editorial-border/60 bg-editorial-bg px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent text-editorial-ink"
      >
        <option value="">{t('library.noDictionaryAssigned')}</option>
        {glossaries.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      {config.assignedGlossaryId && (
        <DictionaryEntryEditor
          entries={config.glossary}
          onChange={(entries) => {
            setConfig((prev) => ({ ...prev, glossary: entries }));
            setGlossaryDirty(true);
          }}
        />
      )}
      {glossaryDirty && config.assignedGlossaryId && (
        <div className="flex justify-end">
          <button
            onClick={handleSaveGlossary}
            disabled={isSavingGlossary}
            className="flex items-center gap-1.5 rounded-full border border-editorial-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-editorial-ink hover:bg-editorial-ink hover:text-white disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Save size={13} />
            {t('common.save')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Drawer
      open={showConfigDrawer}
      side="left"
      onClose={() => setShowConfigDrawer(false)}
      ariaLabelledBy="config-drawer-title"
      ariaDescribedBy="config-drawer-hint"
      maxWidth="max-w-[680px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 pt-4 pb-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.configDrawerTitle')}
          </div>
          <h2
            id="config-drawer-title"
            className="mt-1 font-display text-2xl italic tracking-tight text-editorial-ink"
          >
            {t('pipeline.globalSetup')}
          </h2>
          <p
            id="config-drawer-hint"
            className="mt-1 text-xs leading-relaxed text-editorial-muted"
          >
            {t('document.configDrawerHint')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowConfigDrawer(false)}
          className="shrink-0 mt-1 rounded-full border border-editorial-border p-2.5 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('header.closeDrawer')}
        >
          <X size={16} />
        </button>
      </div>

      <PipelineConfig
        onRunPipeline={onRunPipeline}
        onRunAuditOnly={onRunAuditOnly}
        onCancelPipeline={onCancelPipeline}
        showActions={false}
        showOnlyGlobalDefaults={!currentProjectId}
        libraryGlossarySection={currentProjectId ? libraryGlossarySection : undefined}
        className="flex flex-1 flex-col overflow-y-auto bg-editorial-bg/40 custom-scrollbar min-h-0"
      />
    </Drawer>
  );
}
