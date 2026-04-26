import {
  BookOpen,
  Download,
  FolderOpen,
  Globe,
  HelpCircle,
  Save,
  Settings,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { HelpGuide } from '../help';

export function Header() {
  const { setInputText } = usePipelineStore();
  const { chunks, isProcessing } = useChunksStore();
  const {
    setShowSettings,
    setShowHelp,
    showHelp,
    viewMode,
    setViewMode,
    documentLayout,
    setDocumentLayout,
  } = useUiStore();
  const {
    currentProjectId,
    setShowProjectPanel,
    saveCurrentProject,
    projects,
  } = useProjectStore();
  const { t, i18n } = useTranslation();

  const currentProject = projects.find((project) => project.id === currentProjectId);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');
  };

  const handleImport = async () => {
    try {
      const text = await importTextFile();
      if (text) {
        setInputText(text);
        toast.success(t('files.imported'));
      }
    } catch (err: any) {
      toast.error(t('files.importError'), { description: err.message });
    }
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
      await saveCurrentProject();
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
              <button
                onClick={() => setShowProjectPanel(true)}
                title={projectsLabel}
                aria-label={`${projectsLabel}: ${currentProject.name}`}
                className="rounded-full border border-editorial-border bg-editorial-bg/70 px-3 py-1.5 text-[10px] font-mono text-editorial-muted transition-colors hover:border-editorial-ink hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {currentProject.name}
              </button>
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

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
              {t('header.workspaceLabel')}
            </span>
            <div className="flex items-center rounded-full border border-editorial-border bg-editorial-bg p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('sandbox')}
                disabled={isProcessing}
                className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                  viewMode === 'sandbox'
                    ? 'bg-editorial-ink text-white'
                    : 'text-editorial-muted hover:text-editorial-ink'
                }`}
              >
                {t('header.sandbox')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('document')}
                disabled={isProcessing}
                className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                  viewMode === 'document'
                    ? 'bg-editorial-ink text-white'
                    : 'text-editorial-muted hover:text-editorial-ink'
                }`}
              >
                <BookOpen size={12} className="mr-1 inline" />
                {t('header.document')}
              </button>
            </div>
          </div>

          {viewMode === 'document' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                {t('header.readerLayout')}
              </span>
              <div className="flex items-center rounded-full border border-editorial-border bg-editorial-bg p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setDocumentLayout('auto')}
                  disabled={isProcessing}
                  className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'auto'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  {t('document.layoutAuto')}
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentLayout('standard')}
                  disabled={isProcessing}
                  className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'standard'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  {t('document.layoutStandard')}
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentLayout('book')}
                  disabled={isProcessing}
                  className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors ${
                    documentLayout === 'book'
                      ? 'bg-editorial-ink text-white'
                      : 'text-editorial-muted hover:text-editorial-ink'
                  }`}
                >
                  {t('document.layoutBook')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
    </header>
  );
}
