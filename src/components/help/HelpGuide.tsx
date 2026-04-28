import { useState } from 'react';
import {
  X, ChevronRight,
  FolderOpen, Upload, SlidersHorizontal, Save,
  LibraryBig, Globe, Settings, HelpCircle,
  LayoutTemplate, PanelRight,
  Wand2, BookmarkPlus, BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface HelpGuideProps {
  open: boolean;
  onClose: () => void;
}

type Section = 'overview' | 'pipeline' | 'features' | 'streaming' | 'audit' | 'projects' | 'providers' | 'ollama' | 'glossary' | 'shortcuts';

export function HelpGuide({ open, onClose }: HelpGuideProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const { t } = useTranslation();
  const trapRef = useFocusTrap(open, onClose);

  const sections: { id: Section; label: string }[] = [
    { id: 'overview',   label: t('help.sections.overview') },
    { id: 'pipeline',   label: t('help.sections.pipeline') },
    { id: 'features',   label: t('help.sections.features') },
    { id: 'streaming',  label: t('help.sections.streaming') },
    { id: 'audit',      label: t('help.sections.audit') },
    { id: 'projects',   label: t('help.sections.projects') },
    { id: 'providers',  label: t('help.sections.providers') },
    { id: 'ollama',     label: t('help.sections.ollama') },
    { id: 'glossary',   label: t('help.sections.library') },
    { id: 'shortcuts',  label: t('help.sections.shortcuts') },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Fixed height so the modal never resizes when switching sections */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="relative bg-editorial-bg w-full max-w-4xl h-[85vh] shadow-2xl border border-editorial-border flex overflow-hidden"
          >
            {/* Sidebar */}
            <nav className="w-64 shrink-0 border-r border-editorial-border bg-editorial-textbox/30 flex flex-col overflow-hidden">
              <div className="px-6 pt-6 pb-4 shrink-0 border-b border-editorial-border/60">
                <h3 id="help-title" className="font-display text-2xl italic tracking-tight text-editorial-ink">
                  {t('help.title')}
                </h3>
              </div>
              <ul className="space-y-0.5 p-3 overflow-y-auto custom-scrollbar flex-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveSection(s.id)}
                      className={`w-full text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent rounded ${
                        activeSection === s.id
                          ? 'bg-editorial-ink text-white'
                          : 'text-editorial-ink/60 hover:text-editorial-ink hover:bg-editorial-textbox/60'
                      }`}
                    >
                      <ChevronRight size={11} className={activeSection === s.id ? 'opacity-100' : 'opacity-0'} />
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Content — fills remaining height and scrolls independently */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <button
                onClick={onClose}
                className="absolute top-5 right-5 text-editorial-ink/50 hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label={t('settings.close')}
              >
                <X size={18} />
              </button>

              <div className="max-w-none pr-4">
                {activeSection === 'overview'  && <OverviewSection />}
                {activeSection === 'pipeline'  && <PipelineSection />}
                {activeSection === 'features'  && <FeaturesSection />}
                {activeSection === 'streaming' && <StreamingSection />}
                {activeSection === 'audit'     && <AuditSection />}
                {activeSection === 'projects'  && <ProjectsSection />}
                {activeSection === 'providers' && <ProvidersSection />}
                {activeSection === 'ollama'    && <OllamaSection />}
                {activeSection === 'glossary'  && <GlossarySection />}
                {activeSection === 'shortcuts' && <ShortcutsSection />}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-3xl italic tracking-tight mb-6 pb-3 border-b border-editorial-ink text-editorial-ink">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-editorial-ink/80 mb-4">{children}</p>;
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-lg italic tracking-tight mt-8 mb-3 text-editorial-ink border-l-2 border-editorial-accent pl-3">
      {children}
    </h3>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-6">
      <span className="font-display italic text-2xl text-editorial-accent leading-none mt-0.5 shrink-0">{n}</span>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest mb-1.5 text-editorial-ink">{title}</h4>
        <div className="text-[13px] text-editorial-ink/70 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 p-4 bg-editorial-textbox/30 border border-editorial-border">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-editorial-accent mb-2">{title}</h4>
      <p className="text-[13px] text-editorial-ink/70 leading-relaxed">{children}</p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 bg-editorial-textbox border border-editorial-border text-xs font-mono rounded-sm text-editorial-ink">
      {children}
    </kbd>
  );
}

// ── Content sections ─────────────────────────────────────────────────

function OverviewSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.overview.title')}</SectionTitle>
      <P>{t('help.overview.p1')}</P>
      <P>{t('help.overview.p2')}</P>

      <div className="my-8 p-6 bg-editorial-textbox/30 border border-editorial-border font-mono text-xs leading-loose">
        <div className="text-editorial-ink/50 mb-3 uppercase tracking-widest text-[10px] font-bold">{t('help.overview.flowTitle')}</div>
        <div className="pl-4 border-l-2 border-editorial-accent space-y-2">
          <div className="text-editorial-ink">📝 {t('help.overview.step1')}</div>
          <div className="text-editorial-ink/40">↓</div>
          <div className="text-editorial-ink">⚙️ {t('help.overview.step2')}</div>
          <div className="text-editorial-ink/40">↓</div>
          <div className="text-editorial-ink">✨ {t('help.overview.step3')}</div>
          <div className="text-editorial-ink/40">↓</div>
          <div className="text-editorial-ink">🔍 {t('help.overview.step4')}</div>
          <div className="text-editorial-ink/40">↓</div>
          <div className="text-editorial-ink">✏️ {t('help.overview.step5')}</div>
          <div className="text-editorial-ink/40">↓</div>
          <div className="text-editorial-ink">📤 {t('help.overview.step6')}</div>
        </div>
      </div>

      <P>{t('help.overview.p3')}</P>
    </>
  );
}

function PipelineSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.pipeline.title')}</SectionTitle>
      <P>{t('help.pipeline.intro')}</P>

      <Step n={1} title={t('help.pipeline.configTitle')}>
        {t('help.pipeline.configDesc')}
      </Step>
      <Step n={2} title={t('help.pipeline.stagesTitle')}>
        {t('help.pipeline.stagesDesc')}
      </Step>
      <Step n={3} title={t('help.pipeline.runTitle')}>
        {t('help.pipeline.runDesc')}
      </Step>
      <Step n={4} title={t('help.pipeline.editTitle')}>
        {t('help.pipeline.editDesc')}
      </Step>

      <Tip title={t('help.pipeline.tipTitle')}>{t('help.pipeline.tipDesc')}</Tip>
    </>
  );
}

function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.features.title')}</SectionTitle>
      <P>{t('help.features.intro')}</P>

      <SubTitle>{t('help.features.configDrawerTitle')}</SubTitle>
      <P>{t('help.features.configDrawerDesc')}</P>

      <SubTitle>{t('help.features.templatesTitle')}</SubTitle>
      <P>{t('help.features.templatesDesc')}</P>

      <SubTitle>{t('help.features.refineTitle')}</SubTitle>
      <P>{t('help.features.refineDesc')}</P>

      <SubTitle>{t('help.features.tokenTitle')}</SubTitle>
      <P>{t('help.features.tokenDesc')}</P>

      <SubTitle>{t('help.features.sandboxTitle')}</SubTitle>
      <P>{t('help.features.sandboxDesc')}</P>

      <SubTitle>{t('help.features.exportTitle')}</SubTitle>
      <P>{t('help.features.exportDesc')}</P>
    </>
  );
}

function StreamingSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.streaming.title')}</SectionTitle>
      <P>{t('help.streaming.p1')}</P>
      <P>{t('help.streaming.p2')}</P>
      <P>{t('help.streaming.p3')}</P>
    </>
  );
}

function AuditSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.audit.title')}</SectionTitle>
      <P>{t('help.audit.intro')}</P>

      <div className="space-y-3 my-6">
        {(['glossary', 'accuracy', 'fluency', 'grammar'] as const).map((type) => (
          <div key={type} className="flex items-start gap-3 p-4 bg-editorial-textbox/20 border border-editorial-border">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 shrink-0 tracking-wider ${
              type === 'grammar' ? 'bg-editorial-accent text-white' : 'bg-editorial-ink text-white'
            }`}>
              {type}
            </span>
            <span className="text-[13px] text-editorial-ink/75">{t(`help.audit.${type}Issue`)}</span>
          </div>
        ))}
      </div>

      <P>{t('help.audit.reeval')}</P>
    </>
  );
}

function ProjectsSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.projects.title')}</SectionTitle>
      <P>{t('help.projects.intro')}</P>

      <Step n={1} title={t('help.projects.createTitle')}>
        {t('help.projects.createDesc')}
      </Step>
      <Step n={2} title={t('help.projects.saveTitle')}>
        {t('help.projects.saveDesc')}
      </Step>
      <Step n={3} title={t('help.projects.importExportTitle')}>
        {t('help.projects.importExportDesc')}
      </Step>
    </>
  );
}

function ProvidersSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.providers.title')}</SectionTitle>
      <P>{t('help.providers.intro')}</P>

      <div className="overflow-x-auto my-6">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="border-b-2 border-editorial-ink">
              <th className="text-left py-2.5 pr-4 font-bold uppercase tracking-widest text-[10px] text-editorial-ink">{t('help.providers.provider')}</th>
              <th className="text-left py-2.5 pr-4 font-bold uppercase tracking-widest text-[10px] text-editorial-ink">{t('help.providers.models')}</th>
              <th className="text-left py-2.5 font-bold uppercase tracking-widest text-[10px] text-editorial-ink">{t('help.providers.notes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-editorial-border">
            <tr><td className="py-2.5 pr-4 font-bold text-editorial-ink">Gemini</td><td className="py-2.5 pr-4 font-mono text-xs text-editorial-ink/70">gemini-3-flash, pro, lite</td><td className="py-2.5 text-editorial-ink/70">{t('help.providers.geminiNote')}</td></tr>
            <tr><td className="py-2.5 pr-4 font-bold text-editorial-ink">OpenAI</td><td className="py-2.5 pr-4 font-mono text-xs text-editorial-ink/70">gpt-4o, gpt-4o-mini, o1</td><td className="py-2.5 text-editorial-ink/70">{t('help.providers.openaiNote')}</td></tr>
            <tr><td className="py-2.5 pr-4 font-bold text-editorial-ink">Anthropic</td><td className="py-2.5 pr-4 font-mono text-xs text-editorial-ink/70">claude-3.5-sonnet, haiku</td><td className="py-2.5 text-editorial-ink/70">{t('help.providers.anthropicNote')}</td></tr>
            <tr><td className="py-2.5 pr-4 font-bold text-editorial-ink">DeepSeek</td><td className="py-2.5 pr-4 font-mono text-xs text-editorial-ink/70">deepseek-chat, reasoner</td><td className="py-2.5 text-editorial-ink/70">{t('help.providers.deepseekNote')}</td></tr>
            <tr><td className="py-2.5 pr-4 font-bold text-editorial-ink">Ollama</td><td className="py-2.5 pr-4 font-mono text-xs text-editorial-ink/70">{t('help.providers.ollamaModels')}</td><td className="py-2.5 text-editorial-ink/70">{t('help.providers.ollamaNote')}</td></tr>
          </tbody>
        </table>
      </div>

      <P>{t('help.providers.security')}</P>
    </>
  );
}

function OllamaSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.ollama.title')}</SectionTitle>
      <P>{t('help.ollama.intro')}</P>

      <Step n={1} title={t('help.ollama.installTitle')}>
        <span>{t('help.ollama.installDesc')}</span>
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-xs font-mono text-editorial-ink">
          curl -fsSL https://ollama.com/install.sh | sh
        </code>
      </Step>
      <Step n={2} title={t('help.ollama.pullTitle')}>
        <span>{t('help.ollama.pullDesc')}</span>
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-xs font-mono text-editorial-ink">
          ollama pull llama3.2
        </code>
      </Step>
      <Step n={3} title={t('help.ollama.serveTitle')}>
        <span>{t('help.ollama.serveDesc')}</span>
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-xs font-mono text-editorial-ink">
          ollama serve
        </code>
      </Step>
      <Step n={4} title={t('help.ollama.useTitle')}>
        {t('help.ollama.useDesc')}
      </Step>

      <Tip title={t('help.ollama.recommendedTitle')}>{t('help.ollama.recommendedDesc')}</Tip>
    </>
  );
}

function GlossarySection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.glossary.title')}</SectionTitle>
      <P>{t('help.glossary.intro')}</P>

      <SubTitle>{t('help.glossary.libraryTitle')}</SubTitle>
      <P>{t('help.glossary.libraryDesc')}</P>

      <SubTitle>{t('help.glossary.csvTitle')}</SubTitle>
      <P>{t('help.glossary.csvDesc')}</P>

      <SubTitle>{t('help.glossary.projectTitle')}</SubTitle>
      <P>{t('help.glossary.projectDesc')}</P>

      <SubTitle>{t('help.glossary.highlightTitle')}</SubTitle>
      <P>{t('help.glossary.highlightDesc')}</P>

      <SubTitle>{t('help.glossary.auditTitle')}</SubTitle>
      <P>{t('help.glossary.auditDesc')}</P>

      <SubTitle>{t('help.glossary.templatesTitle')}</SubTitle>
      <P>{t('help.glossary.templatesDesc')}</P>
    </>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();

  const toolbarItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.openProjects'),  icon: <FolderOpen size={14} /> },
    { label: t('help.shortcuts.importFile'),    icon: <Upload size={14} /> },
    { label: t('help.shortcuts.openConfig'),    icon: <SlidersHorizontal size={14} /> },
    { label: t('help.shortcuts.saveProject'),   icon: <Save size={14} /> },
    { label: t('help.shortcuts.openLibrary'),   icon: <LibraryBig size={14} /> },
    { label: t('help.shortcuts.switchLang'),    icon: <Globe size={14} /> },
    { label: t('help.shortcuts.openSettings'),  icon: <Settings size={14} /> },
    { label: t('help.shortcuts.openHelp'),      icon: <HelpCircle size={14} /> },
    { label: t('help.shortcuts.sandbox'),       icon: <LayoutTemplate size={14} /> },
    { label: t('help.shortcuts.openInsights'),  icon: <PanelRight size={14} /> },
  ];

  const exportItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.exportTxt'), icon: <span className="font-mono text-[10px]">TXT</span> },
    { label: t('help.shortcuts.exportMd'),  icon: <span className="font-mono text-[10px]">MD</span> },
  ];

  const promptItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.refineButton'),  icon: <Wand2 size={14} /> },
    { label: t('help.shortcuts.saveTemplate'),  icon: <BookmarkPlus size={14} /> },
    { label: t('help.shortcuts.loadTemplate'),  icon: <BookOpen size={14} /> },
  ];

  const renderRow = ({ label, icon }: { label: string; icon: React.ReactNode }) => (
    <div key={label} className="flex items-center justify-between py-2.5 border-b border-editorial-border last:border-0">
      <span className="text-[13px] text-editorial-ink/80">{label}</span>
      <Kbd>{icon}</Kbd>
    </div>
  );

  return (
    <>
      <SectionTitle>{t('help.shortcuts.title')}</SectionTitle>

      <SubTitle>{t('help.shortcuts.toolbarTitle')}</SubTitle>
      <div className="my-4">{toolbarItems.map(renderRow)}</div>

      <SubTitle>{t('help.shortcuts.exportTitle')}</SubTitle>
      <div className="my-4">{exportItems.map(renderRow)}</div>

      <SubTitle>{t('help.shortcuts.promptToolsTitle')}</SubTitle>
      <div className="my-4">{promptItems.map(renderRow)}</div>
    </>
  );
}
