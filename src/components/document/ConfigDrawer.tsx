import { useEffect, useRef, useState } from 'react';
import { X, LibraryBig, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog, DialogCancelButton, IconButton, PillButton } from '../ui';
import { ResizeHandle, useEdgeResize } from '../layout/useEdgeResize';
import { SPRING_PANEL } from '../layout/motion';
import { useViewportWidth, FLYOUT_OVERLAY_BELOW } from '../../hooks/useViewportWidth';
import { PipelineConfig } from '../pipeline/PipelineConfig';

const CONFIG_MIN = 420;
const CONFIG_MAX = 760;
const CONFIG_DISMISS_AT = 380;
const CONFIG_DEFAULT = 560;
/** Larghezza del rail collassato: offset sinistro dell'overlay su finestre strette. */
const CONFIG_RAIL_COLLAPSED = 64;
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
  /** 'drawer' = pannello laterale legacy; 'modal' = finestra (shell nuova #291). */
  variant?: 'drawer' | 'modal';
}

export function ConfigDrawer({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  variant = 'drawer',
}: ConfigDrawerProps) {
  const { t } = useTranslation();
  const showConfigDrawer = useUiStore((state) => state.showConfigDrawer);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const width = useUiStore((state) => state.configFlyoutWidth);
  const setWidth = useUiStore((state) => state.setConfigFlyoutWidth);
  const projectContextCollapsed = useUiStore((state) => state.projectContextCollapsed);
  const projectSidebarWidth = useUiStore((state) => state.projectSidebarWidth);
  const { dragging, startDrag } = useEdgeResize();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const viewportWidth = useViewportWidth();

  // Overlay sul documento su finestre strette (vedi ProjectFlyout): l'offset segue il rail.
  const overlay = viewportWidth > 0 && viewportWidth < FLYOUT_OVERLAY_BELOW;
  const railWidth = projectContextCollapsed ? CONFIG_RAIL_COLLAPSED : projectSidebarWidth;

  const handleResizeStart = (event: React.PointerEvent) => {
    startDrag(event, {
      startWidth: width,
      min: CONFIG_MIN,
      max: CONFIG_MAX,
      threshold: CONFIG_DISMISS_AT,
      mode: 'dismiss',
      onWidth: setWidth,
      onDismiss: () => setShowConfigDrawer(false),
    });
  };

  // Pannello push (non modale): chiusura via Esc. La modale usa l'Esc nativo di Radix.
  useEffect(() => {
    if (variant !== 'drawer' || !showConfigDrawer) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setShowConfigDrawer(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [variant, showConfigDrawer, setShowConfigDrawer]);
  const setPipelineMode = useConfigStore((state) => state.setPipelineMode);
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
    setPipelineMode('test');
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
    <div className="space-y-3 rounded-[20px] border border-editorial-border/60 bg-editorial-textbox/20 px-5 py-4">
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

  // ---- Contenuto condiviso fra drawer (legacy) e modale (shell nuova) ----
  const nameInput = (
    <input
      id="config-drawer-title"
      type="text"
      value={nameValue}
      onChange={(e) => setNameValue(e.target.value)}
      onBlur={() => {
        const trimmed = nameValue.trim();
        if (!trimmed) { setNameValue(activePipeline?.name ?? t('pipeline.globalSetup')); return; }
        if (activePipelineId && activePipeline && trimmed !== activePipeline.name) {
          void renamePipeline(activePipelineId, trimmed);
        }
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder={t('pipeline.globalSetup')}
      aria-label={t('pipeline.pipelineNameLabel')}
      className="w-full bg-transparent font-display text-2xl italic tracking-tight text-editorial-ink outline-none placeholder:text-editorial-muted/40 transition-colors focus:text-editorial-accent"
    />
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

  // ---- Variante modale (shell nuova): finestra Radix, niente resize/overlay ----
  if (variant === 'modal') {
    return (
      <Dialog
        open={showConfigDrawer}
        onOpenChange={(open) => { if (!open) setShowConfigDrawer(false); }}
        title={t('pipeline.configurePipeline')}
        eyebrow={t('document.configDrawerTitle')}
        closeLabel={t('common.close')}
        closeDisabled={isProcessing}
        widthClassName="max-w-3xl"
        panelClassName="h-[85vh]"
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

  // ---- Variante drawer (legacy): pannello laterale ridimensionabile ----
  return (
    <AnimatePresence initial={false}>
      {showConfigDrawer && (
        <motion.aside
          key="config-flyout"
          ref={drawerRef}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={dragging ? { duration: 0 } : SPRING_PANEL}
          role="dialog"
          aria-labelledby="config-drawer-title"
          style={overlay ? { left: railWidth } : undefined}
          className={`flex h-full overflow-hidden border-r border-editorial-border bg-editorial-bg ${
            overlay ? 'absolute inset-y-0 z-40 shadow-2xl shadow-black/25' : 'relative shrink-0'
          }`}
        >
          <div className="flex h-full flex-col overflow-hidden" style={{ width }}>
            <div className="flex items-start justify-between gap-3 border-b border-editorial-border px-6 pt-4 pb-4">
              <div className="min-w-0">
                <div className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
                  {t('document.configDrawerTitle')}
                </div>
                <div className="mt-1">{nameInput}</div>
              </div>
              <IconButton
                size="md"
                onClick={() => setShowConfigDrawer(false)}
                title={t('header.closeDrawer')}
                tooltipSide="left"
                className="mt-1 shrink-0"
              >
                <X size={16} />
              </IconButton>
            </div>

            {configForm}

            {resetButton ? (
              <div className="flex shrink-0 justify-center border-t border-editorial-border/40 px-6 py-4">{resetButton}</div>
            ) : null}
          </div>
          <ResizeHandle
            onPointerDown={handleResizeStart}
            dragging={dragging}
            label={t('projectShell.resizePanel')}
            width={width}
            min={CONFIG_MIN}
            max={CONFIG_MAX}
            onResize={setWidth}
            onReset={() => setWidth(CONFIG_DEFAULT)}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
