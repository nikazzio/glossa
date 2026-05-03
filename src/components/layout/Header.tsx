import {
  AlertCircle,
  CircleCheck,
  CircleDot,
  Code2,
  Columns2,
  FileCode,
  FileOutput,
  FileText,
  FilePen,
  FolderOpen,
  Globe,
  HelpCircle,
  LayoutTemplate,
  LibraryBig,
  Loader2,
  Save,
  Settings,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';

const ImportPreviewDialog = lazy(() =>
  import('../document/ImportPreviewDialog').then((m) => ({ default: m.ImportPreviewDialog })),
);
const SaveProjectDialog = lazy(() =>
  import('../projects/SaveProjectDialog').then((m) => ({ default: m.SaveProjectDialog })),
);
const HelpGuide = lazy(() =>
  import('../help/HelpGuide').then((m) => ({ default: m.HelpGuide })),
);

interface PendingImport {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
}

interface HeaderProps {
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
}

export function Header({ onRunPipeline, onCancelPipeline }: HeaderProps = {}) {
  const { config, setConfig } = usePipelineStore();
  const { chunks, isProcessing, loadDocument } = useChunksStore();
  const {
    setShowSettings,
    setShowHelp,
    showHelp,
    viewMode,
    setViewMode,
    showConfigDrawer,
    setShowConfigDrawer,
  } = useUiStore();
  const {
    currentProjectId,
    setShowProjectPanel,
    saveCurrentProject,
    projects,
    saveState,
  } = useProjectStore();
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const { t, i18n } = useTranslation();
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showSaveProjectDialog, setShowSaveProjectDialog] = useState(false);
  const [isCreatingProjectFromSave, setIsCreatingProjectFromSave] = useState(false);

  // Keep dialogs mounted after first open so their AnimatePresence exit animations run
  const helpLoaded = useRef(false);
  const saveDialogLoaded = useRef(false);
  if (showHelp) helpLoaded.current = true;
  if (showSaveProjectDialog) saveDialogLoaded.current = true;

  const currentProject = projects.find((project) => project.id === currentProjectId);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');
  };

  const handleImport = async () => {
    try {
      const imported = await importTextFile();
      if (imported) {
        setPendingImport({
          fileName: imported.name,
          text: imported.text,
          useChunking: config.useChunking !== false,
          targetChunkCount: config.targetChunkCount ?? 0,
          format: imported.format,
          experimental: imported.experimental,
        });
      }
    } catch (err: any) {
      toast.error(t('files.importError'), { description: err.message });
    }
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    setConfig((prev) => ({
      ...prev,
      useChunking: pendingImport.useChunking,
      targetChunkCount: pendingImport.targetChunkCount,
      documentFormat: pendingImport.format ?? 'plain',
      markdownAware: pendingImport.format === 'markdown',
      experimentalImport: pendingImport.experimental ?? null,
    }));
    loadDocument(pendingImport.text, {
      useChunking: pendingImport.useChunking,
      targetChunkCount: pendingImport.targetChunkCount,
      markdownAware: pendingImport.format === 'markdown',
    });
    setPendingImport(null);
    toast.success(t('files.imported'));
  };

  const handleExport = async (type: 'txt' | 'md' | 'html' | 'docx' | 'bilingual') => {
    try {
      const ok =
        type === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, type, {
              markdownAware: config.markdownAware === true,
            });
      if (ok) toast.success(t('files.exported'));
    } catch (err: any) {
      toast.error(t('files.exportError'), { description: err.message });
    }
  };

  const handleSave = async () => {
    if (!currentProjectId) {
      setShowSaveProjectDialog(true);
      return;
    }
    try {
      await saveCurrentProject();
      toast.success(t('projects.saved'));
    } catch (err: any) {
      toast.error(t('projects.saveFailed'), { description: err?.message });
    }
  };

  const handleFirstSave = async (name: string) => {
    try {
      setIsCreatingProjectFromSave(true);
      await saveCurrentProject(name);
      setShowSaveProjectDialog(false);
      toast.success(t('projects.saved'));
    } catch (err: any) {
      toast.error(t('projects.saveFailed'), { description: err?.message });
    } finally {
      setIsCreatingProjectFromSave(false);
    }
  };

  const importLabel = t('files.import');
  const projectsLabel = t('projects.title');
  const saveLabel = t('projects.save');
  const langLabel = t('language.label');
  const settingsLabel = t('header.settings');
  const helpLabel = t('help.title');
  const openConfigLabel = t('header.openConfig');
  const libraryLabel = t('library.openLibrary');
  const sandboxLabel = viewMode === 'sandbox' ? t('header.exitSandbox') : t('header.sandbox');
  const exportTxtLabel = t('files.exportTxt');
  const exportMdLabel = t('files.exportMarkdown');
  const exportHtmlLabel = t('files.exportHtml');
  const exportDocxLabel = t('files.exportDocx');
  const exportBilingualLabel = t('files.exportBilingual');

  const saveStatusLabel =
    saveState === 'dirty'
      ? t('projects.statusDirty')
      : saveState === 'saving'
        ? t('projects.statusSaving')
        : saveState === 'error'
          ? t('projects.statusError')
          : currentProjectId
            ? t('projects.statusSaved')
            : t('projects.statusDraft');

  return (
    <header className="border-b border-editorial-border bg-[linear-gradient(180deg,#fffdf8_0%,#f8f3ea_100%)] px-6 py-5 md:px-10">
      <div className="flex flex-col gap-5">

        {/* ── Riga 1: logo + azioni ── */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="brand font-display text-4xl italic tracking-tight text-editorial-ink">
                {t('app.title')}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('app.subtitle')}
              </div>
            </div>
            {currentProject && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowProjectPanel(true)}
                  title={projectsLabel}
                  aria-label={`${projectsLabel}: ${currentProject.name}`}
                  className="rounded-full border border-editorial-border bg-editorial-bg/70 px-3 py-1.5 text-[10px] font-mono text-editorial-muted transition-colors hover:border-editorial-ink hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {currentProject.name}
                </button>
                <SaveStatusBadge saveState={saveState} currentProjectId={currentProjectId} label={saveStatusLabel} />
              </div>
            )}
            {!currentProject && (
              <SaveStatusBadge saveState={saveState} currentProjectId={currentProjectId} label={saveStatusLabel} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Export cluster – visibile solo in modalità documento con chunk */}
            {viewMode === 'document' && chunks.length > 0 && (
              <ActionCluster>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton onClick={() => handleExport('txt')} title={exportTxtLabel} ariaLabel={exportTxtLabel}>
                    <FileText size={15} />
                  </IconButton>
                  <IconButton onClick={() => handleExport('md')} title={exportMdLabel} ariaLabel={exportMdLabel}>
                    <FileCode size={15} />
                  </IconButton>
                  <IconButton onClick={() => handleExport('html')} title={exportHtmlLabel} ariaLabel={exportHtmlLabel}>
                    <Code2 size={15} />
                  </IconButton>
                  <IconButton onClick={() => handleExport('docx')} title={exportDocxLabel} ariaLabel={exportDocxLabel}>
                    <FileOutput size={15} />
                  </IconButton>
                  {config.markdownAware && (
                    <IconButton onClick={() => handleExport('bilingual')} title={exportBilingualLabel} ariaLabel={exportBilingualLabel}>
                      <Columns2 size={15} />
                    </IconButton>
                  )}
                </div>
              </ActionCluster>
            )}

            {/* Sandbox – solo icona */}
            <IconButton
              onClick={() => setViewMode(viewMode === 'sandbox' ? 'document' : 'sandbox')}
              title={sandboxLabel}
              ariaLabel={sandboxLabel}
              ariaPressed={viewMode === 'sandbox'}
              active={viewMode === 'sandbox'}
            >
              <LayoutTemplate size={16} />
            </IconButton>

            {/* Cluster Progetto */}
            <ActionCluster>
              <div className="flex flex-wrap items-center gap-1">
                <IconButton
                  onClick={() => setShowProjectPanel(true)}
                  title={projectsLabel}
                  ariaLabel={projectsLabel}
                >
                  <FolderOpen size={16} />
                </IconButton>
                <IconButton onClick={handleImport} title={importLabel} ariaLabel={importLabel}>
                  <Upload size={16} />
                </IconButton>
                {viewMode === 'document' && (
                  <IconButton
                    onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                    title={openConfigLabel}
                    ariaLabel={openConfigLabel}
                    ariaPressed={showConfigDrawer}
                    active={showConfigDrawer}
                  >
                    <SlidersHorizontal size={16} />
                  </IconButton>
                )}
                <IconButton
                  onClick={handleSave}
                  title={saveLabel}
                  ariaLabel={saveLabel}
                  disabled={isProcessing}
                >
                  <Save size={16} />
                </IconButton>
              </div>
            </ActionCluster>

            {/* Cluster Generale */}
            <ActionCluster>
              <div className="flex flex-wrap items-center gap-1">
                <IconButton
                  onClick={() => setShowLibraryPanel(true)}
                  title={libraryLabel}
                  ariaLabel={libraryLabel}
                >
                  <LibraryBig size={16} />
                </IconButton>
                <button
                  onClick={toggleLang}
                  title={langLabel}
                  className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={langLabel}
                >
                  <Globe size={14} />
                  {i18n.language.toUpperCase()}
                </button>
                <IconButton
                  onClick={() => setShowSettings(true)}
                  title={settingsLabel}
                  ariaLabel={settingsLabel}
                >
                  <Settings size={16} />
                </IconButton>
                <IconButton onClick={() => setShowHelp(true)} title={helpLabel} ariaLabel={helpLabel}>
                  <HelpCircle size={16} />
                </IconButton>
              </div>
            </ActionCluster>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        {pendingImport && (
          <ImportPreviewDialog
            fileName={pendingImport.fileName}
            text={pendingImport.text}
            useChunking={pendingImport.useChunking}
            targetChunkCount={pendingImport.targetChunkCount}
            markdownAware={pendingImport.format === 'markdown'}
            format={pendingImport.format}
            experimental={pendingImport.experimental}
            onUseChunkingChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, useChunking: value } : current,
              )
            }
            onTargetChunkCountChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, targetChunkCount: value } : current,
              )
            }
            onCancel={() => setPendingImport(null)}
            onConfirm={handleConfirmImport}
          />
        )}
      </Suspense>
      {helpLoaded.current && (
        <Suspense fallback={null}>
          <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
        </Suspense>
      )}
      {saveDialogLoaded.current && (
        <Suspense fallback={null}>
          <SaveProjectDialog
            open={showSaveProjectDialog}
            onClose={() => setShowSaveProjectDialog(false)}
            onConfirm={handleFirstSave}
            saving={isCreatingProjectFromSave}
          />
        </Suspense>
      )}
    </header>
  );
}


function ActionCluster({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1 shadow-sm">
      {label && (
        <>
          <span className="px-2.5 text-[9px] font-bold uppercase tracking-[0.22em] text-editorial-muted/75">
            {label}
          </span>
          <span className="mx-1 h-5 w-px bg-editorial-border/70" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  ariaPressed?: boolean;
}

function IconButton({
  onClick,
  children,
  title,
  ariaLabel,
  active = false,
  disabled = false,
  ariaPressed,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={disabled}
      className={`rounded-full border border-editorial-border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-editorial-ink text-white'
          : 'text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
      }`}
    >
      {children}
    </button>
  );
}

function SaveStatusBadge({
  saveState,
  currentProjectId,
  label,
}: {
  saveState: string;
  currentProjectId: string | null;
  label: string;
}) {
  let icon: React.ReactNode;
  let colorClass = 'border-editorial-border/70 bg-editorial-textbox/40 text-editorial-muted';

  if (saveState === 'saving') {
    icon = <Loader2 size={13} className="animate-spin" />;
  } else if (saveState === 'error') {
    icon = <AlertCircle size={13} />;
    colorClass = 'border-editorial-accent/50 bg-editorial-accent/10 text-editorial-accent';
  } else if (saveState === 'dirty') {
    icon = <CircleDot size={13} />;
    colorClass = 'border-amber-300/60 bg-amber-50/60 text-amber-700';
  } else if (currentProjectId) {
    icon = <CircleCheck size={13} />;
  } else {
    icon = <FilePen size={13} />;
  }

  return (
    <span
      title={label}
      aria-label={label}
      role="status"
      className={`inline-flex items-center justify-center rounded-full border p-1.5 transition-colors ${colorClass}`}
    >
      {icon}
    </span>
  );
}
