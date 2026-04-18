import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface HelpGuideProps {
  open: boolean;
  onClose: () => void;
}

type Section = 'overview' | 'pipeline' | 'streaming' | 'audit' | 'projects' | 'providers' | 'ollama' | 'glossary' | 'shortcuts';

export function HelpGuide({ open, onClose }: HelpGuideProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const { t } = useTranslation();

  const sections: { id: Section; label: string }[] = [
    { id: 'overview', label: t('help.sections.overview') },
    { id: 'pipeline', label: t('help.sections.pipeline') },
    { id: 'streaming', label: t('help.sections.streaming') },
    { id: 'audit', label: t('help.sections.audit') },
    { id: 'projects', label: t('help.sections.projects') },
    { id: 'providers', label: t('help.sections.providers') },
    { id: 'ollama', label: t('help.sections.ollama') },
    { id: 'glossary', label: t('help.sections.glossary') },
    { id: 'shortcuts', label: t('help.sections.shortcuts') },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-editorial-bg w-full max-w-4xl max-h-[85vh] shadow-2xl border border-editorial-border flex overflow-hidden"
          >
            {/* Sidebar */}
            <nav className="w-56 shrink-0 border-r border-editorial-border bg-editorial-textbox/30 p-6 overflow-y-auto">
              <h3 className="font-display text-xl italic tracking-tight mb-6">{t('help.title')}</h3>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveSection(s.id)}
                      className={`w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
                        activeSection === s.id
                          ? 'bg-editorial-ink text-white'
                          : 'text-editorial-muted hover:text-editorial-ink hover:bg-white/50'
                      }`}
                    >
                      <ChevronRight size={10} className={activeSection === s.id ? 'opacity-100' : 'opacity-0'} />
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 text-editorial-muted hover:text-editorial-ink"
              >
                <X size={20} />
              </button>

              <div className="max-w-none">
                {activeSection === 'overview' && <OverviewSection />}
                {activeSection === 'pipeline' && <PipelineSection />}
                {activeSection === 'streaming' && <StreamingSection />}
                {activeSection === 'audit' && <AuditSection />}
                {activeSection === 'projects' && <ProjectsSection />}
                {activeSection === 'providers' && <ProvidersSection />}
                {activeSection === 'ollama' && <OllamaSection />}
                {activeSection === 'glossary' && <GlossarySection />}
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
  return <h2 className="font-display text-2xl italic tracking-tight mb-6 pb-2 border-b border-editorial-ink">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-editorial-ink mb-4">{children}</p>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-6">
      <span className="font-display italic text-2xl text-editorial-accent leading-none mt-0.5">{n}</span>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-widest mb-1">{title}</h4>
        <div className="text-sm text-editorial-muted leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-editorial-textbox border border-editorial-border text-[10px] font-mono rounded-sm">
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

      <div className="my-8 p-6 bg-editorial-textbox/30 border border-editorial-border font-mono text-[11px] leading-loose">
        <div className="text-editorial-muted mb-2">{t('help.overview.flowTitle')}</div>
        <div className="pl-4 border-l-2 border-editorial-accent space-y-1">
          <div>📝 {t('help.overview.step1')}</div>
          <div className="text-editorial-muted">↓</div>
          <div>⚙️ {t('help.overview.step2')}</div>
          <div className="text-editorial-muted">↓</div>
          <div>✨ {t('help.overview.step3')}</div>
          <div className="text-editorial-muted">↓</div>
          <div>🔍 {t('help.overview.step4')}</div>
          <div className="text-editorial-muted">↓</div>
          <div>✏️ {t('help.overview.step5')}</div>
          <div className="text-editorial-muted">↓</div>
          <div>📤 {t('help.overview.step6')}</div>
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

      <div className="mt-6 p-4 bg-editorial-textbox/20 border border-editorial-border">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-editorial-accent mb-2">{t('help.pipeline.tipTitle')}</h4>
        <p className="text-xs text-editorial-muted leading-relaxed">{t('help.pipeline.tipDesc')}</p>
      </div>
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

      <div className="space-y-4 my-6">
        {(['glossary', 'accuracy', 'fluency', 'grammar'] as const).map((type) => (
          <div key={type} className="flex items-start gap-3 p-4 bg-editorial-textbox/20 border border-editorial-border">
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 shrink-0 ${
              type === 'grammar' ? 'bg-red-500 text-white' : 'bg-editorial-ink text-white'
            }`}>
              {type}
            </span>
            <span className="text-xs text-editorial-muted">{t(`help.audit.${type}Issue`)}</span>
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
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-editorial-ink">
              <th className="text-left py-2 pr-4 font-bold uppercase tracking-widest text-[9px]">{t('help.providers.provider')}</th>
              <th className="text-left py-2 pr-4 font-bold uppercase tracking-widest text-[9px]">{t('help.providers.models')}</th>
              <th className="text-left py-2 font-bold uppercase tracking-widest text-[9px]">{t('help.providers.notes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-editorial-border">
            <tr><td className="py-2 pr-4 font-bold">Gemini</td><td className="py-2 pr-4 font-mono text-[10px]">gemini-3-flash, pro, lite</td><td className="py-2 text-editorial-muted">{t('help.providers.geminiNote')}</td></tr>
            <tr><td className="py-2 pr-4 font-bold">OpenAI</td><td className="py-2 pr-4 font-mono text-[10px]">gpt-4o, gpt-4o-mini, o1</td><td className="py-2 text-editorial-muted">{t('help.providers.openaiNote')}</td></tr>
            <tr><td className="py-2 pr-4 font-bold">Anthropic</td><td className="py-2 pr-4 font-mono text-[10px]">claude-3.5-sonnet, haiku</td><td className="py-2 text-editorial-muted">{t('help.providers.anthropicNote')}</td></tr>
            <tr><td className="py-2 pr-4 font-bold">DeepSeek</td><td className="py-2 pr-4 font-mono text-[10px]">deepseek-chat, reasoner</td><td className="py-2 text-editorial-muted">{t('help.providers.deepseekNote')}</td></tr>
            <tr><td className="py-2 pr-4 font-bold">Ollama</td><td className="py-2 pr-4 font-mono text-[10px]">{t('help.providers.ollamaModels')}</td><td className="py-2 text-editorial-muted">{t('help.providers.ollamaNote')}</td></tr>
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
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-[11px] font-mono">
          curl -fsSL https://ollama.com/install.sh | sh
        </code>
      </Step>
      <Step n={2} title={t('help.ollama.pullTitle')}>
        <span>{t('help.ollama.pullDesc')}</span>
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-[11px] font-mono">
          ollama pull llama3.2
        </code>
      </Step>
      <Step n={3} title={t('help.ollama.serveTitle')}>
        <span>{t('help.ollama.serveDesc')}</span>
        <code className="block mt-2 p-3 bg-editorial-textbox border border-editorial-border text-[11px] font-mono">
          ollama serve
        </code>
      </Step>
      <Step n={4} title={t('help.ollama.useTitle')}>
        {t('help.ollama.useDesc')}
      </Step>

      <div className="mt-6 p-4 bg-editorial-textbox/20 border border-editorial-border">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-editorial-accent mb-2">{t('help.ollama.recommendedTitle')}</h4>
        <p className="text-xs text-editorial-muted leading-relaxed">{t('help.ollama.recommendedDesc')}</p>
      </div>
    </>
  );
}

function GlossarySection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.glossary.title')}</SectionTitle>
      <P>{t('help.glossary.intro')}</P>
      <P>{t('help.glossary.usage')}</P>
      <P>{t('help.glossary.audit')}</P>
    </>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.shortcuts.title')}</SectionTitle>

      <div className="space-y-3 my-6">
        {[
          { label: t('help.shortcuts.openSettings'), icon: '⚙️' },
          { label: t('help.shortcuts.switchLang'), icon: '🌐' },
          { label: t('help.shortcuts.openProjects'), icon: '📂' },
          { label: t('help.shortcuts.importFile'), icon: '⬆' },
          { label: t('help.shortcuts.saveProject'), icon: '💾' },
          { label: t('help.shortcuts.exportTxt'), icon: '⬇' },
          { label: t('help.shortcuts.exportMd'), icon: 'MD' },
        ].map(({ label, icon }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-editorial-border">
            <span className="text-xs">{label}</span>
            <span className="flex items-center gap-1.5">
              <Kbd>{icon}</Kbd>
              <span className="text-[9px] text-editorial-muted uppercase">{t('help.shortcuts.headerIcon')}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
