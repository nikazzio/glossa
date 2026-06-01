import {
  AlertCircle,
  CircleCheck,
  CircleDot,
  FileOutput,
  FilePen,
  FolderOpen,
  FolderX,
  HelpCircle,
  LayoutTemplate,
  LibraryBig,
  Loader2,
  Save,
  Settings,
  Upload,
} from 'lucide-react';
import { IconButton } from '../ui';
import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { savePipelineConfig } from '../../services/pipelineService';
import type { ImportDialogPipelineConfig } from '../document/ImportPreviewDialog';
import { extractFootnotes } from '../../utils/footnoteExtractor';
import { logger } from '../../utils/logger';
import { getContextWindow } from '../../models/catalog';
import type { ExportFormat } from '../document/ExportDialog';
import type { DocumentFormat, DocumentRenderProfile } from '../../types';

const ExportDialog = lazy(() =>
  import('../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);

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
  /** Testo pulito (senza definizioni note) — usato dal dialog per chunking e preview. */
  text: string;
  /** Testo originale completo (con note in fondo) — passato a loadDocument. */
  rawText: string;
  useChunking: boolean;
  wordsPerChunk: number;
  headingAware: boolean;
  carryTrailingShortBlocks: boolean;
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
    chunkPresetShort,
    chunkPresetMedium,
    chunkPresetLong,
  } = useUiStore();
  const {
    currentProjectId,
    setShowProjectPanel,
    saveCurrentProject,
    closeProject,
    projects,
    saveState,
    activePipelineId,
  } = useProjectStore();
  const setShowLibraryPanel = useLibraryStore((state) => state.setShowLibraryPanel);
  const { t, i18n } = useTranslation();
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showSaveProjectDialog, setShowSaveProjectDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
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
        const isMarkdown = imported.format === 'markdown';
        const cleanText = isMarkdown ? extractFootnotes(imported.text).cleanText : imported.text;
        setPendingImport({
          fileName: imported.name,
          text: cleanText,
          rawText: imported.text,
          useChunking: config.useChunking !== false,
          wordsPerChunk: config.wordsPerChunk ?? chunkPresetMedium,
          headingAware: config.headingAware ?? true,
          carryTrailingShortBlocks: config.carryTrailingShortBlocks ?? true,
          format: imported.format,
          experimental: imported.experimental,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'pdf_no_text_layer') {
        toast.error(t('files.pdfScannedError'));
      } else {
        toast.error(t('files.importError'), { description: msg });
      }
    }
  };

  const handleConfirmImport = (manualChunks?: string[], pipelineConfig?: ImportDialogPipelineConfig) => {
    if (!pendingImport) return;
    const provider = pipelineConfig?.provider ?? config.stages[0]?.provider;
    const model = pipelineConfig?.model ?? config.stages[0]?.model;
    const contextWindow = provider && model ? getContextWindow(provider, model) : undefined;
    const wordsPerChunk = pendingImport.wordsPerChunk > 0 ? pendingImport.wordsPerChunk : chunkPresetMedium;
    const presets = [chunkPresetShort, chunkPresetMedium, chunkPresetLong];
    const nearestPreset = presets.reduce((nearest, p) =>
      Math.abs(wordsPerChunk - p) < Math.abs(wordsPerChunk - nearest) ? p : nearest,
      presets[0]!,
    );
    const minWords = Math.round(nearestPreset * 0.5);
    const maxWords = Math.round(nearestPreset * 1.5);
    const updatedStages = pipelineConfig
      ? config.stages.map((s, i) => i === 0 ? { ...s, provider: pipelineConfig.provider, model: pipelineConfig.model } : s)
      : config.stages;
    const updatedConfig = {
      ...config,
      sourceLanguage: pipelineConfig?.sourceLanguage ?? config.sourceLanguage,
      targetLanguage: pipelineConfig?.targetLanguage ?? config.targetLanguage,
      stages: updatedStages,
      useChunking: pendingImport.useChunking,
      wordsPerChunk,
      minWords,
      maxWords,
      headingAware: pendingImport.headingAware,
      carryTrailingShortBlocks: pendingImport.carryTrailingShortBlocks,
      documentFormat: (pendingImport.format ?? 'plain') as DocumentFormat,
      renderProfile: (pendingImport.format === 'markdown' ? 'markdown' : 'plain-text') as DocumentRenderProfile,
      markdownAware: pendingImport.format === 'markdown',
      experimentalImport: pendingImport.experimental ?? null,
      chunkedWithContextWindow: contextWindow,
    };
    setConfig(() => updatedConfig);
    loadDocument(
      pendingImport.rawText,
      {
        useChunking: pendingImport.useChunking,
        targetWordsPerChunk: wordsPerChunk,
        markdownAware: pendingImport.format === 'markdown',
        minWords,
        maxWords,
        headingAware: pendingImport.headingAware,
        carryTrailingShortBlocks: pendingImport.carryTrailingShortBlocks,
        extractFootnotes: pendingImport.experimental === 'docx-markdown',
      },
      manualChunks,
    );
    if (activePipelineId) {
      savePipelineConfig(activePipelineId, updatedConfig).catch((err: unknown) => {
        logger.error('savePipelineConfig after import failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }
    setPendingImport(null);
    toast.success(t('files.imported'));
  };

  const handleExport = async (format: ExportFormat, separator: string, markdownAware: boolean) => {
    setShowExportDialog(false);
    try {
      const ok =
        format === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, format, { markdownAware, separator });
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
  const closeProjectLabel = t('projects.close');
  const langLabel = t('language.label');
  const settingsLabel = t('header.settings');
  const helpLabel = t('help.title');
  const libraryLabel = t('library.openLibrary');
  const sandboxLabel = viewMode === 'sandbox' ? t('header.exitSandbox') : t('header.sandbox');
  const exportLabel = t('header.exportLabel');

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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="brand font-display text-5xl italic tracking-tight text-editorial-ink">
              {t('app.title')}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('app.subtitle')}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {currentProject && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowProjectPanel(true)}
                  title={projectsLabel}
                  aria-label={`${projectsLabel}: ${currentProject.name}`}
                  className="font-display text-[19px] italic text-editorial-ink/80 transition-colors hover:text-editorial-ink focus:outline-none focus-visible:underline"
                >
                  {currentProject.name}
                </button>
                <SaveStatusBadge saveState={saveState} currentProjectId={currentProjectId} label={saveStatusLabel} />
                <button
                  type="button"
                  onClick={closeProject}
                  disabled={isProcessing}
                  title={closeProjectLabel}
                  aria-label={closeProjectLabel}
                  className="rounded-full border border-editorial-border/60 p-1.5 text-editorial-muted/50 transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FolderX size={15} />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Cluster Documento */}
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
                  <IconButton
                    onClick={handleSave}
                    title={saveLabel}
                    ariaLabel={saveLabel}
                    disabled={isProcessing}
                  >
                    <Save size={16} />
                  </IconButton>
                  {viewMode === 'document' && chunks.length > 0 && (
                    <IconButton
                      onClick={() => setShowExportDialog(true)}
                      title={exportLabel}
                      ariaLabel={exportLabel}
                    >
                      <FileOutput size={16} />
                    </IconButton>
                  )}
                </div>
              </ActionCluster>

              {/* Cluster App */}
              <ActionCluster>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton
                    onClick={() => setShowLibraryPanel(true)}
                    title={libraryLabel}
                    ariaLabel={libraryLabel}
                  >
                    <LibraryBig size={16} />
                  </IconButton>
                  <IconButton
                    onClick={() => setViewMode(viewMode === 'sandbox' ? 'document' : 'sandbox')}
                    title={sandboxLabel}
                    ariaLabel={sandboxLabel}
                    ariaPressed={viewMode === 'sandbox'}
                    tone={viewMode === 'sandbox' ? 'accent' : 'default'}
                  >
                    <LayoutTemplate size={16} />
                  </IconButton>
                  <IconButton
                    onClick={() => setShowSettings(true)}
                    title={settingsLabel}
                    ariaLabel={settingsLabel}
                  >
                    <Settings size={16} />
                  </IconButton>
                  <button
                    type="button"
                    onClick={toggleLang}
                    title={`${langLabel} (${i18n.language === 'it' ? 'IT → EN' : 'EN → IT'})`}
                    aria-label={langLabel}
                    className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-editorial-border text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <span className="select-none font-mono text-[10px] font-bold leading-none">
                      {i18n.language.toUpperCase()}
                    </span>
                  </button>
                  <IconButton onClick={() => setShowHelp(true)} title={helpLabel} ariaLabel={helpLabel}>
                    <HelpCircle size={16} />
                  </IconButton>
                </div>
              </ActionCluster>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        {pendingImport && (
          <ImportPreviewDialog
            fileName={pendingImport.fileName}
            text={pendingImport.text}
            useChunking={pendingImport.useChunking}
            wordsPerChunk={pendingImport.wordsPerChunk}
            headingAware={pendingImport.headingAware}
            carryTrailingShortBlocks={pendingImport.carryTrailingShortBlocks}
            markdownAware={pendingImport.format === 'markdown'}
            format={pendingImport.format}
            experimental={pendingImport.experimental}
            onUseChunkingChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, useChunking: value } : current,
              )
            }
            onWordsPerChunkChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, wordsPerChunk: value } : current,
              )
            }
            onHeadingAwareChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, headingAware: value } : current,
              )
            }
            onCarryTrailingShortBlocksChange={(value) =>
              setPendingImport((current) =>
                current ? { ...current, carryTrailingShortBlocks: value } : current,
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
      {showExportDialog && (
        <Suspense fallback={null}>
          <ExportDialog
            chunks={chunks}
            markdownAware={config.markdownAware === true}
            onConfirm={handleExport}
            onCancel={() => setShowExportDialog(false)}
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
  let colorClass = 'border-editorial-border bg-editorial-textbox/40 text-editorial-muted';

  if (saveState === 'saving') {
    icon = <Loader2 size={15} className="animate-spin" />;
    colorClass = 'border-editorial-muted/50 bg-editorial-muted/8 text-editorial-muted';
  } else if (saveState === 'error') {
    icon = <AlertCircle size={15} />;
    colorClass = 'border-editorial-accent/50 bg-editorial-accent/10 text-editorial-accent';
  } else if (saveState === 'dirty') {
    icon = <CircleDot size={15} />;
    colorClass = 'border-editorial-muted/50 bg-editorial-muted/8 text-editorial-muted';
  } else if (currentProjectId) {
    icon = <CircleCheck size={15} />;
    colorClass = 'border-editorial-success/50 bg-editorial-success/8 text-editorial-success';
  } else {
    icon = <FilePen size={15} />;
  }

  return (
    <span
      title={label}
      aria-label={label}
      role="status"
      className={`inline-flex items-center justify-center rounded-full border p-2 transition-colors ${colorClass}`}
    >
      {icon}
    </span>
  );
}
