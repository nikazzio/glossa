import { Settings, Globe, FolderOpen, Upload, Download, Save, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { HelpGuide } from '../help';

export function Header() {
  const { setShowSettings, setInputText, chunks } = usePipelineStore();
  const { currentProjectId, setShowProjectPanel, saveCurrentProject, projects } = useProjectStore();
  const { t, i18n } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);

  const currentProject = projects.find((p) => p.id === currentProjectId);

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
      const ok = type === 'bilingual'
        ? await exportBilingual(chunks)
        : await exportTranslation(chunks, type);
      if (ok) toast.success(t('files.exported'));
    } catch (err: any) {
      toast.error(t('files.exportError'), { description: err.message });
    }
  };

  const handleSave = async () => {
    await saveCurrentProject();
    toast.success(t('projects.saved'));
  };

  return (
    <header className="px-10 py-6 border-b border-editorial-border bg-editorial-bg flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="brand font-display italic text-3xl tracking-tight">{t('app.title')}</div>
        {currentProject && (
          <span className="text-[10px] font-mono text-editorial-muted bg-editorial-textbox/50 px-2 py-1 border border-editorial-border">
            {currentProject.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* File actions */}
        <button
          onClick={handleImport}
          className="p-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('files.import')}
        >
          <Upload size={16} />
        </button>
        {chunks.length > 0 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleExport('txt')}
              className="p-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('files.exportTxt')}
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => handleExport('bilingual')}
              className="px-2 py-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors text-[9px] font-bold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('files.exportBilingual')}
            >
              MD
            </button>
          </div>
        )}

        <div className="w-px h-6 bg-editorial-border mx-1" />

        {/* Project actions */}
        <button
          onClick={() => setShowProjectPanel(true)}
          className="p-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('projects.title')}
        >
          <FolderOpen size={16} />
        </button>
        {currentProjectId && (
          <button
            onClick={handleSave}
            className="p-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('projects.save')}
          >
            <Save size={16} />
          </button>
        )}

        <div className="w-px h-6 bg-editorial-border mx-1" />

        {/* App version */}
        <div className="text-[9px] font-bold tracking-[2px] uppercase text-editorial-muted hidden md:block">
          {t('app.subtitle')}
        </div>

        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2 py-1.5 border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('language.label')}
        >
          <Globe size={14} />
          {i18n.language.toUpperCase()}
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 border border-editorial-border hover:bg-editorial-ink hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('header.settings')}
        >
          <Settings size={16} />
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="p-2 border border-editorial-border text-editorial-muted hover:text-editorial-ink hover:bg-editorial-textbox/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('help.title')}
        >
          <HelpCircle size={16} />
        </button>
      </div>

      <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
    </header>
  );
}
