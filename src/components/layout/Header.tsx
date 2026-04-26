import {
  BookOpen,
  Beaker,
  Columns2,
  Download,
  FolderOpen,
  Globe,
  HelpCircle,
  PanelRight,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProjectSnapshot } from '../../hooks/useProjectAutosave';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { ImportPreviewDialog } from '../document';
import { PipelineActions } from '../pipeline';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { HelpGuide } from '../help';

interface PendingImport {
  fileName: string;
  text: string;
  useChunking: boolean;
  targetChunkCount: number;
}

interface HeaderProps {
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
}

export function Header({ onRunPipeline, onRunAuditOnly, onCancelPipeline }: HeaderProps = {}) {
  const { config, setConfig } = usePipelineStore();
  const { chunks, isProcessing, loadDocument } = useChunksStore();
  const {
    setShowSettings,
    setShowHelp,
    showHelp,
    viewMode,
    setViewMode,
    documentLayout,
    setDocumentLayout,
    showConfigDrawer,
    showInsightsDrawer,
    setShowConfigDrawer,
    setShowInsightsDrawer,
  } = useUiStore();
  const {
    currentProjectId,
    setShowProjectPanel,
    saveCurrentProject,
    projects,
    saveState,
  } = useProjectStore();
  const { t, i18n } = useTranslation();
  const snapshot = useProjectSnapshot();
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

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
    }));
    loadDocument(pendingImport.text, {
      useChunking: pendingImport.useChunking,
      targetChunkCount: pendingImport.targetChunkCount,
    });
    setPendingImport(null);
    toast.success(t('files.imported'));
  };

  const handleExport = async (type: 'txt' | 'md' | 'bilingual') => {
    try {
      const ok =
        type === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, type);
      if (ok) toast.success(t('files.exported'));
    } catch (err: any) {
      toast.error(t('files.exportError'), { description: err.message });
    }
  };

  const handleSave = async () => {
    try {
      await saveCurrentProject(snapshot);
      toast.success(t('projects.saved'));
    } catch (err: any) {
      toast.error(t('projects.saveFailed'), { description: err?.message });
    }
  };

  const importLabel = t('files.import');
  const exportTxtLabel = t('files.exportTxt');
  const exportMdLabel = t('files.exportBilingual');
  const projectsLabel = t('projects.title');
  const saveLabel = t('projects.save');
  const langLabel = t('language.label');
  const settingsLabel = t('header.settings');
  const helpLabel = t('help.title');
  const openConfigLabel = t('header.openConfig');
  const openInsightsLabel = t('header.openInsights');
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
                <span className="rounded-full border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-editorial-muted">
                  {saveStatusLabel}
                </span>
              </div>
            )}
            {!currentProject && (
              <span className="rounded-full border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-editorial-muted">
                {saveStatusLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleImport}
              title={importLabel}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={importLabel}
            >
              <Upload size={16} />
            </button>
            {chunks.length > 0 && (
              <div className="flex items-center gap-1 rounded-full border border-editorial-border bg-editorial-bg px-1 py-1">
                <button
                  onClick={() => handleExport('txt')}
                  title={exportTxtLabel}
                  className="rounded-full p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={exportTxtLabel}
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => handleExport('bilingual')}
                  title={exportMdLabel}
                  className="rounded-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={exportMdLabel}
                >
                  MD
                </button>
              </div>
            )}

            {viewMode === 'document' && (
              <>
                <div className="mx-1 hidden h-6 w-px bg-editorial-border md:block" />
                <button
                  type="button"
                  onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                  title={openConfigLabel}
                  aria-label={openConfigLabel}
                  aria-pressed={showConfigDrawer}
                  className={`rounded-full border border-editorial-border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    showConfigDrawer
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
                  }`}
                >
                  <SlidersHorizontal size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowInsightsDrawer(!showInsightsDrawer)}
                  title={openInsightsLabel}
                  aria-label={openInsightsLabel}
                  aria-pressed={showInsightsDrawer}
                  className={`rounded-full border border-editorial-border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    showInsightsDrawer
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
                  }`}
                >
                  <PanelRight size={16} />
                </button>
              </>
            )}

            <div className="mx-1 hidden h-6 w-px bg-editorial-border md:block" />

            <button
              onClick={() => setShowProjectPanel(true)}
              title={projectsLabel}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={projectsLabel}
            >
              <FolderOpen size={16} />
            </button>
            {currentProjectId && (
              <button
                onClick={handleSave}
                title={saveLabel}
                disabled={isProcessing}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={saveLabel}
              >
                <Save size={16} />
              </button>
            )}

            <button
              onClick={toggleLang}
              title={langLabel}
              className="flex items-center gap-1.5 rounded-full border border-editorial-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={langLabel}
            >
              <Globe size={14} />
              {i18n.language.toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'sandbox' ? 'document' : 'sandbox')}
              disabled={isProcessing}
              title={t(viewMode === 'sandbox' ? 'header.exitSandbox' : 'header.enterSandbox')}
              aria-label={t(viewMode === 'sandbox' ? 'header.exitSandbox' : 'header.enterSandbox')}
              aria-pressed={viewMode === 'sandbox'}
              className={`rounded-full border border-editorial-border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                viewMode === 'sandbox'
                  ? 'bg-editorial-ink text-white'
                  : 'text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
              }`}
            >
              <Beaker size={16} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title={settingsLabel}
              className="rounded-full border border-editorial-border p-2 transition-colors hover:bg-editorial-ink hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={settingsLabel}
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => setShowHelp(true)}
              title={helpLabel}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={helpLabel}
            >
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        {viewMode === 'document' && (
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              role="radiogroup"
              aria-label={t('header.readerLayout')}
              className="flex items-center rounded-full border border-editorial-border bg-editorial-bg p-1 shadow-sm"
            >
              <LayoutPill
                active={documentLayout === 'auto'}
                onClick={() => setDocumentLayout('auto')}
                disabled={isProcessing}
                label={t('document.layoutAuto')}
                icon={<Sparkles size={12} />}
              />
              <LayoutPill
                active={documentLayout === 'standard'}
                onClick={() => setDocumentLayout('standard')}
                disabled={isProcessing}
                label={t('document.layoutStandard')}
                icon={<Columns2 size={12} />}
              />
              <LayoutPill
                active={documentLayout === 'book'}
                onClick={() => setDocumentLayout('book')}
                disabled={isProcessing}
                label={t('document.layoutBook')}
                icon={<BookOpen size={12} />}
              />
            </div>

            {onRunPipeline && onRunAuditOnly && onCancelPipeline && (
              <PipelineActions
                onRunPipeline={onRunPipeline}
                onRunAuditOnly={onRunAuditOnly}
                onCancelPipeline={onCancelPipeline}
                variant="compact"
              />
            )}
          </div>
        )}
      </div>

      <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
      {pendingImport && (
        <ImportPreviewDialog
          fileName={pendingImport.fileName}
          text={pendingImport.text}
          useChunking={pendingImport.useChunking}
          targetChunkCount={pendingImport.targetChunkCount}
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
    </header>
  );
}

interface LayoutPillProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}

function LayoutPill({ active, onClick, disabled, label, icon }: LayoutPillProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 ${
        active
          ? 'bg-editorial-ink text-white'
          : 'text-editorial-muted hover:text-editorial-ink'
      }`}
    >
      {icon}
    </button>
  );
}
