import { useEffect, useState } from 'react';
import { Check, LibraryBig, Pencil, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogCancelButton, IconButton, PillButton } from '../ui';
import { PipelineConfig } from '../pipeline/PipelineConfig';
import { useUiStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useProjectStore } from '../../stores/projectStore';
import { assignGlossaryToProject } from '../../services/glossaryService';
import { upsertGlossaryEntries } from '../../services/glossaryService';
import { DictionaryEntryEditor } from '../library/DictionaryEntryEditor';
import { confirm } from '../../stores/confirmStore';

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
  const setWorkMode = useConfigStore((state) => state.setWorkMode);
  const [glossaryDirty, setGlossaryDirty] = useState(false);
  const [isSavingGlossary, setIsSavingGlossary] = useState(false);
  const { config, setConfig, assignGlossary } = usePipelineStore();
  const { chunks, resetAllChunks, isProcessing } = useChunksStore();
  const { glossaries, setShowLibraryPanel, loadGlossaries, isLoaded } = useLibraryStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { currentProjectId, pipelines, activePipelineId, renamePipeline } = useProjectStore();
  const activePipeline = pipelines.find((p) => p.id === activePipelineId);
  const [nameValue, setNameValue] = useState(activePipeline?.name ?? '');

  useEffect(() => {
    setNameValue(activePipeline?.name ?? '');
  }, [activePipeline?.name]);

  const completedCount = chunks.filter((c) => c.status === 'completed').length;

  const handleResetAll = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmResetAllTitle'),
      message: t('pipeline.confirmResetAllMessage', { count: completedCount }),
      confirmLabel: t('pipeline.resetAll'),
      danger: true,
    });
    if (!ok) return;
    resetAllChunks();
    setWorkMode('chunk');
    toast.success(t('pipeline.resetAllDone'));
  };

  useEffect(() => {
    if (showConfigDrawer) loadGlossaries(activeWorkspace?.id ?? null);
  }, [showConfigDrawer, activeWorkspace?.id, loadGlossaries]);

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
    <div className="space-y-3 border-y border-editorial-border/70 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <LibraryBig size={11} className="text-editorial-accent shrink-0" />
          <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
            {t('library.assignedDictionary')}
          </span>
        </div>
        <IconButton
          size="md"
          onClick={() => setShowLibraryPanel(true, 'dictionaries')}
          title={t('library.openLibrary')}
          className="shrink-0"
        >
          <LibraryBig size={16} />
        </IconButton>
      </div>
      <select
        value={config.assignedGlossaryId ?? ''}
        onChange={(e) => handleDictChange(e.target.value)}
        className="w-full rounded-md border border-editorial-border/60 bg-editorial-bg px-3 py-2 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent text-editorial-ink"
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
          <PillButton
            variant="accent"
            onClick={handleSaveGlossary}
            disabled={isSavingGlossary}
            className="inline-flex items-center gap-1.5"
          >
            <Save size={13} />
            {t('common.save')}
          </PillButton>
        </div>
      )}
    </div>
  );

  const isNameDirty = !!activePipelineId && !!activePipeline && nameValue.trim() !== activePipeline.name;

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameValue(activePipeline?.name ?? t('pipeline.globalSetup')); return; }
    if (activePipelineId && activePipeline && trimmed !== activePipeline.name) {
      void renamePipeline(activePipelineId, trimmed);
    }
  };

  const cancelNameEdit = () => {
    setNameValue(activePipeline?.name ?? '');
  };

  const nameInput = (
    <div className="flex items-center gap-2">
      <div className="group relative flex-1">
        <input
          id="config-drawer-title"
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={() => { if (isNameDirty) commitName(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitName(); e.currentTarget.blur(); }
            if (e.key === 'Escape') { cancelNameEdit(); e.currentTarget.blur(); }
          }}
          placeholder={t('pipeline.globalSetup')}
          aria-label={t('pipeline.pipelineNameLabel')}
          className="w-full bg-transparent font-display text-2xl italic tracking-tight text-editorial-ink outline-none placeholder:text-editorial-muted/40 transition-colors focus:text-editorial-accent border-b border-transparent group-hover:border-editorial-border/60 focus:border-editorial-accent/50"
        />
        {!isNameDirty && (
          <Pencil
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-editorial-muted/30 opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      {isNameDirty && (
        <div className="flex items-center gap-1 shrink-0">
          <IconButton size="sm" tone="accent" onClick={commitName} title={t('common.confirm')}>
            <Check size={14} />
          </IconButton>
          <IconButton size="sm" onClick={cancelNameEdit} title={t('common.cancel')}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );

  const configForm = (
    <PipelineConfig
      onRunPipeline={onRunPipeline}
      onRunAuditOnly={onRunAuditOnly}
      onCancelPipeline={onCancelPipeline}
      showActions={false}
      showOnlyGlobalDefaults={false}
      libraryGlossarySection={libraryGlossarySection}
      className="flex flex-1 flex-col bg-editorial-bg/40 min-h-0"
    />
  );

  const resetButton = completedCount > 0 ? (
    <PillButton
      variant="secondary"
      onClick={handleResetAll}
      disabled={isProcessing}
      className="inline-flex items-center gap-2 border-editorial-accent/40 text-editorial-accent/80 hover:border-editorial-accent hover:text-editorial-accent"
    >
      <Trash2 size={12} />
      {t('pipeline.resetAll')}
    </PillButton>
  ) : null;

  return (
    <Dialog
      open={showConfigDrawer}
      onOpenChange={(open) => { if (!open) setShowConfigDrawer(false); }}
      title={t('pipeline.configurePipeline')}
      closeLabel={t('common.close')}
      closeDisabled={isProcessing}
      widthClassName="max-w-4xl"
      panelClassName="h-[88vh]"
      bodyClassName="p-0"
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={() => setShowConfigDrawer(false)} disabled={isProcessing}>
            {t('common.close')}
          </DialogCancelButton>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-editorial-border px-6 py-4">{nameInput}</div>
        {configForm}
        {resetButton ? (
          <div className="flex shrink-0 justify-center border-t border-editorial-border/40 px-6 py-4">{resetButton}</div>
        ) : null}
      </div>
    </Dialog>
  );
}
