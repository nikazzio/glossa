import { Settings, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';

export function Header() {
  const { setShowSettings } = usePipelineStore();
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');
  };

  return (
    <header className="px-10 py-10 border-b border-editorial-border bg-editorial-bg flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="brand font-display italic text-4xl tracking-tight">{t('app.title')}</div>
      <div className="flex items-center gap-6">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-editorial-muted">
          {t('app.subtitle')}
        </div>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2 py-1.5 border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-ink hover:bg-white transition-colors"
          title={t('language.label')}
        >
          <Globe size={14} />
          {i18n.language.toUpperCase()}
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 border border-editorial-border hover:bg-editorial-ink hover:text-white transition-colors"
          title={t('header.settings')}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
