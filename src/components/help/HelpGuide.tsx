import { useEffect, useState } from 'react';
import {
  ChevronRight, HelpCircle,
  FolderOpen, Upload, SlidersHorizontal, Save,
  LibraryBig, Globe, Settings,
  LayoutTemplate, PanelRight,
  CheckCheck, PanelTopClose, ScanLine,
  Wand2, BookmarkPlus, BookOpen,
  Copy, Check, Palette,
} from 'lucide-react';
import { StyleGuide } from './StyleGuide';
import { appLogDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';

interface HelpGuideProps {
  open: boolean;
  onClose: () => void;
}

type Section = 'overview' | 'pipeline' | 'features' | 'streaming' | 'context' | 'audit' | 'projects' | 'providers' | 'ollama' | 'glossary' | 'shortcuts' | 'troubleshooting' | 'design';

export function HelpGuide({ open, onClose }: HelpGuideProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const { t } = useTranslation();
  const trapRef = useFocusTrap(open, onClose);

  const sections: { id: Section; label: string }[] = [
    { id: 'overview',        label: t('help.sections.overview') },
    { id: 'pipeline',        label: t('help.sections.pipeline') },
    { id: 'features',        label: t('help.sections.features') },
    { id: 'streaming',       label: t('help.sections.streaming') },
    { id: 'context',         label: t('help.sections.context') },
    { id: 'audit',           label: t('help.sections.audit') },
    { id: 'projects',        label: t('help.sections.projects') },
    { id: 'providers',       label: t('help.sections.providers') },
    { id: 'ollama',          label: t('help.sections.ollama') },
    { id: 'glossary',        label: t('help.sections.library') },
    { id: 'shortcuts',       label: t('help.sections.shortcuts') },
    { id: 'troubleshooting', label: t('help.sections.troubleshooting') },
    { id: 'design',          label: 'Design System' },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      ref={trapRef}
    >
      <div className="relative flex h-[88vh] w-full max-w-4xl">
        <EditorialModalShell
          titleId="help-title"
          title={t('help.title')}
          closeLabel={t('settings.close')}
          onClose={onClose}
          icon={<HelpCircle size={22} />}
          eyebrow={t('help.eyebrow')}
          widthClassName="max-w-4xl"
          panelClassName="h-[88vh]"
          bodyClassName="p-0"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {t('common.close')}
              </button>
            </div>
          }
        >
          <div className="flex h-full min-h-0 overflow-hidden">
            <nav className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-editorial-border bg-editorial-textbox/30">
              <ul className="flex-1 space-y-0.5 overflow-y-auto p-3 custom-scrollbar">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      className={`flex w-full items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                        activeSection === s.id
                          ? 'bg-editorial-accent text-white'
                          : 'text-editorial-ink/60 hover:text-editorial-accent'
                      }`}
                    >
                      <ChevronRight size={11} className={activeSection === s.id ? 'opacity-100' : 'opacity-0'} />
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {activeSection === 'overview'        && <OverviewSection />}
              {activeSection === 'pipeline'        && <PipelineSection />}
              {activeSection === 'features'        && <FeaturesSection />}
              {activeSection === 'streaming'       && <StreamingSection />}
              {activeSection === 'context'         && <ContextSection />}
              {activeSection === 'audit'           && <AuditSection />}
              {activeSection === 'projects'        && <ProjectsSection />}
              {activeSection === 'providers'       && <ProvidersSection />}
              {activeSection === 'ollama'          && <OllamaSection />}
              {activeSection === 'glossary'        && <GlossarySection />}
              {activeSection === 'shortcuts'       && <ShortcutsSection />}
              {activeSection === 'troubleshooting' && <TroubleshootingSection />}
              {activeSection === 'design'          && <StyleGuide />}
            </div>
          </div>
        </EditorialModalShell>
      </div>
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-3xl tracking-tight mb-6 pb-3 border-b border-editorial-border text-editorial-ink" style={{ fontVariationSettings: '"wght" 560' }}>
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
    <div className="mt-6 rounded-[20px] border border-editorial-border bg-editorial-textbox/30 px-5 py-4">
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-accent">{title}</h4>
      <p className="text-[13px] leading-relaxed text-editorial-ink/70">{children}</p>
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
  const flowSteps = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const;
  return (
    <>
      <SectionTitle>{t('help.overview.title')}</SectionTitle>
      <P>{t('help.overview.p1')}</P>
      <P>{t('help.overview.p2')}</P>

      <div className="my-8 rounded-[20px] border border-editorial-border bg-editorial-textbox/25 p-6">
        <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
          {t('help.overview.flowTitle')}
        </div>
        <ol className="space-y-3 border-l-2 border-editorial-accent pl-5">
          {flowSteps.map((key, idx) => (
            <li key={key} className="flex items-start gap-3 text-sm leading-relaxed text-editorial-ink">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-editorial-accent/40 bg-editorial-bg text-[10px] font-bold text-editorial-accent">
                {idx + 1}
              </span>
              <span>{t(`help.overview.${key}`)}</span>
            </li>
          ))}
        </ol>
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

      <SubTitle>{t('help.pipeline.modesTitle')}</SubTitle>
      <P>{t('help.pipeline.modesDesc')}</P>

      <div className="my-6 space-y-3">
        <ModeRow
          name={t('help.pipeline.modeStandardName')}
          stages={t('help.pipeline.modeStandardStages')}
          desc={t('help.pipeline.modeStandardDesc')}
        />
        <ModeRow
          name={t('help.pipeline.modeEditorialName')}
          stages={t('help.pipeline.modeEditorialStages')}
          desc={t('help.pipeline.modeEditorialDesc')}
        />
      </div>

      <Step n={1} title={t('help.pipeline.configTitle')}>
        {t('help.pipeline.configDesc')}
      </Step>
      <Step n={2} title={t('help.pipeline.stagesTitle')}>
        {t('help.pipeline.stagesDesc')}
      </Step>
      <Step n={3} title={t('help.pipeline.previewTitle')}>
        {t('help.pipeline.previewDesc')}
      </Step>
      <Step n={4} title={t('help.pipeline.runTitle')}>
        {t('help.pipeline.runDesc')}
      </Step>
      <Step n={5} title={t('help.pipeline.editTitle')}>
        {t('help.pipeline.editDesc')}
      </Step>

      <Tip title={t('help.pipeline.tipTitle')}>{t('help.pipeline.tipDesc')}</Tip>
    </>
  );
}

function ModeRow({ name, stages, desc }: { name: string; stages: string; desc: string }) {
  return (
    <div className="rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-base italic text-editorial-ink">{name}</span>
        <span className="font-mono text-[11px] text-editorial-accent">{stages}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-editorial-ink/75">{desc}</p>
    </div>
  );
}

function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.features.title')}</SectionTitle>
      <P>{t('help.features.intro')}</P>

      <SubTitle>{t('help.features.documentWorkspaceTitle')}</SubTitle>
      <P>{t('help.features.documentWorkspaceDesc')}</P>

      <SubTitle>{t('help.features.documentToolsTitle')}</SubTitle>
      <P>{t('help.features.documentToolsDesc')}</P>

      <SubTitle>{t('help.features.insightsTitle')}</SubTitle>
      <P>{t('help.features.insightsDesc')}</P>

      <SubTitle>{t('help.features.statsTitle')}</SubTitle>
      <P>{t('help.features.statsDesc')}</P>

      <SubTitle>{t('help.features.operationsLogTitle')}</SubTitle>
      <P>{t('help.features.operationsLogDesc')}</P>

      <SubTitle>{t('help.features.configDrawerTitle')}</SubTitle>
      <P>{t('help.features.configDrawerDesc')}</P>

      <SubTitle>{t('help.features.modalsTitle')}</SubTitle>
      <P>{t('help.features.modalsDesc')}</P>

      <SubTitle>{t('help.features.personaTitle')}</SubTitle>
      <P>{t('help.features.personaDesc')}</P>

      <SubTitle>{t('help.features.templatesTitle')}</SubTitle>
      <P>{t('help.features.templatesDesc')}</P>

      <SubTitle>{t('help.features.refineTitle')}</SubTitle>
      <P>{t('help.features.refineDesc')}</P>

      <SubTitle>{t('help.features.refineGatingTitle')}</SubTitle>
      <P>{t('help.features.refineGatingDesc')}</P>

      <SubTitle>{t('help.features.promptPreviewTitle')}</SubTitle>
      <P>{t('help.features.promptPreviewDesc')}</P>

      <SubTitle>{t('help.features.segmentationTitle')}</SubTitle>
      <P>{t('help.features.segmentationDesc')}</P>

      <SubTitle>{t('help.features.segmentationControlsTitle')}</SubTitle>
      <P>{t('help.features.segmentationControlsDesc')}</P>

      <SubTitle>{t('help.features.segmentationCardTitle')}</SubTitle>
      <P>{t('help.features.segmentationCardDesc')}</P>

      <SubTitle>{t('help.features.segmentationEditorTitle')}</SubTitle>
      <P>{t('help.features.segmentationEditorDesc')}</P>

      <SubTitle>{t('help.features.chunkActionsTitle')}</SubTitle>
      <P>{t('help.features.chunkActionsDesc')}</P>

      <SubTitle>{t('help.features.tokenTitle')}</SubTitle>
      <P>{t('help.features.tokenDesc')}</P>

      <SubTitle>{t('help.features.exportTitle')}</SubTitle>
      <P>{t('help.features.exportDesc')}</P>

      <SubTitle>{t('help.features.watchdogTitle')}</SubTitle>
      <P>{t('help.features.watchdogDesc')}</P>

      <SubTitle>{t('help.features.sandboxTitle')}</SubTitle>
      <P>{t('help.features.sandboxDesc')}</P>

      <SubTitle>{t('help.features.footnotesTitle')}</SubTitle>
      <P>{t('help.features.footnotesDesc')}</P>
      <Tip title={t('help.features.footnotesTipTitle')}>{t('help.features.footnotesTipDesc')}</Tip>

      <div className="my-4 space-y-2">
        <FeatureRow icon={<PanelTopClose size={14} />} text={t('help.shortcuts.toggleEditorTools')} />
        <FeatureRow icon={<CheckCheck size={14} />} text={t('help.shortcuts.lockTranslation')} />
        <FeatureRow icon={<ScanLine size={14} />} text={t('help.shortcuts.openStageTrace')} />
      </div>
    </>
  );
}

function ContextSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.context.title')}</SectionTitle>
      <P>{t('help.context.intro')}</P>

      <SubTitle>{t('help.context.blobTitle')}</SubTitle>
      <P>{t('help.context.blobDesc')}</P>

      <SubTitle>{t('help.context.cachingTitle')}</SubTitle>
      <P>{t('help.context.cachingDesc')}</P>

      <div className="my-6 space-y-2">
        {(['layer1', 'layer2', 'layer3'] as const).map((key) => (
          <div key={key} className="flex items-start gap-4 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-4">
            <span className="mt-0.5 shrink-0 rounded-full border border-editorial-accent/40 bg-editorial-bg px-3 py-1 font-mono text-[10px] font-bold text-editorial-accent">
              {t(`help.context.${key}Label`)}
            </span>
            <span className="text-[13px] leading-relaxed text-editorial-ink/80">
              {t(`help.context.${key}Desc`)}
            </span>
          </div>
        ))}
      </div>

      <SubTitle>{t('help.context.isolationTitle')}</SubTitle>
      <P>{t('help.context.isolationDesc')}</P>

      <div className="my-6 space-y-2">
        {(['translation', 'refine', 'format', 'coherence'] as const).map((key) => (
          <div key={key} className="flex items-start gap-4 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-4">
            <span className="mt-0.5 w-20 shrink-0 font-mono text-[11px] font-bold text-editorial-accent">
              {t(`help.context.stage${key.charAt(0).toUpperCase() + key.slice(1)}`)}
            </span>
            <span className="text-[13px] leading-relaxed text-editorial-ink/80">
              {t(`help.context.stage${key.charAt(0).toUpperCase() + key.slice(1)}Desc`)}
            </span>
          </div>
        ))}
      </div>

      <Tip title={t('help.context.tipTitle')}>{t('help.context.tipDesc')}</Tip>
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
  const issueTypes = ['glossary', 'accuracy', 'fluency', 'grammar', 'consistency'] as const;
  return (
    <>
      <SectionTitle>{t('help.audit.title')}</SectionTitle>
      <P>{t('help.audit.intro')}</P>

      <div className="my-6 space-y-3">
        {issueTypes.map((type) => (
          <div key={type} className="flex items-start gap-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-4">
            <span className="shrink-0 rounded-full border border-editorial-accent/40 bg-editorial-accent/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-accent">
              {t(`help.audit.${type}Label`)}
            </span>
            <span className="text-[13px] leading-relaxed text-editorial-ink/80">
              {t(`help.audit.${type}Issue`)}
            </span>
          </div>
        ))}
      </div>

      <P>{t('help.audit.reeval')}</P>
      <Tip title={t('document.insightsAuditIssues')}>{t('help.audit.issuesNav')}</Tip>

      <SubTitle>{t('help.audit.coherenceTitle')}</SubTitle>
      <P>{t('help.audit.coherenceDesc')}</P>
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

      <SubTitle>{t('help.projects.autosaveTitle')}</SubTitle>
      <P>{t('help.projects.autosaveDesc')}</P>
    </>
  );
}

function ProvidersSection() {
  const { t } = useTranslation();
  const rows: { name: string; modelsKey: string; noteKey: string }[] = [
    { name: 'Gemini',    modelsKey: 'help.providers.geminiModels',    noteKey: 'help.providers.geminiNote' },
    { name: 'OpenAI',    modelsKey: 'help.providers.openaiModels',    noteKey: 'help.providers.openaiNote' },
    { name: 'Anthropic', modelsKey: 'help.providers.anthropicModels', noteKey: 'help.providers.anthropicNote' },
    { name: 'DeepSeek',  modelsKey: 'help.providers.deepseekModels',  noteKey: 'help.providers.deepseekNote' },
    { name: 'Ollama',    modelsKey: 'help.providers.ollamaModels',    noteKey: 'help.providers.ollamaNote' },
  ];
  return (
    <>
      <SectionTitle>{t('help.providers.title')}</SectionTitle>
      <P>{t('help.providers.intro')}</P>

      <div className="my-6 space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="rounded-[20px] border border-editorial-border bg-editorial-textbox/15 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-display text-base italic text-editorial-ink">{row.name}</span>
              <span className="font-mono text-[11px] text-editorial-accent">{t(row.modelsKey)}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-editorial-ink/75">{t(row.noteKey)}</p>
          </div>
        ))}
      </div>

      <SubTitle>{t('help.providers.gatingTitle')}</SubTitle>
      <P>{t('help.providers.gatingDesc')}</P>

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
        <code className="mt-3 block rounded-[14px] border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
          curl -fsSL https://ollama.com/install.sh | sh
        </code>
      </Step>
      <Step n={2} title={t('help.ollama.pullTitle')}>
        <span>{t('help.ollama.pullDesc')}</span>
        <code className="mt-3 block rounded-[14px] border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
          ollama pull llama3.2
        </code>
      </Step>
      <Step n={3} title={t('help.ollama.serveTitle')}>
        <span>{t('help.ollama.serveDesc')}</span>
        <code className="mt-3 block rounded-[14px] border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
          ollama serve
        </code>
      </Step>
      <Step n={4} title={t('help.ollama.useTitle')}>
        {t('help.ollama.useDesc')}
      </Step>

      <Tip title={t('help.ollama.recommendedTitle')}>{t('help.ollama.recommendedDesc')}</Tip>

      <SubTitle>{t('help.ollama.thinkTitle')}</SubTitle>
      <P>{t('help.ollama.thinkDesc')}</P>
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
    { label: t('help.shortcuts.toggleEditorTools'), icon: <PanelTopClose size={14} /> },
    { label: t('help.shortcuts.lockTranslation'), icon: <CheckCheck size={14} /> },
    { label: t('help.shortcuts.openStageTrace'), icon: <ScanLine size={14} /> },
  ];

  const exportItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.exportDesc'), icon: <span className="font-mono text-[10px]">↗</span> },
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

function TroubleshootingSection() {
  const { t } = useTranslation();
  const [logPath, setLogPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    appLogDir().then(setLogPath).catch(() => setLogPath(null));
  }, []);

  const handleCopy = async () => {
    if (!logPath) return;
    try {
      await navigator.clipboard.writeText(logPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t('pipeline.copyFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <>
      <SectionTitle>{t('help.troubleshooting.title')}</SectionTitle>
      <P>{t('help.troubleshooting.desc')}</P>

      <SubTitle>{t('help.troubleshooting.logFileTitle')}</SubTitle>
      <P>{t('help.troubleshooting.logFileDesc')}</P>
      <div className="flex items-center gap-2 rounded-[14px] border border-editorial-border bg-editorial-textbox/20 px-4 py-3 font-mono text-xs text-editorial-ink/80">
        <span className="flex-1 break-all">{logPath ?? '…'}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!logPath}
          title={t('common.copy')}
          aria-label={copied ? t('pipeline.copied') : t('common.copy')}
          aria-live="polite"
          className="shrink-0 rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-30"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      <SubTitle>{t('help.troubleshooting.rustLogTitle')}</SubTitle>
      <P>{t('help.troubleshooting.rustLogDesc')}</P>
      <div className="rounded-[14px] border border-editorial-border bg-editorial-textbox/20 px-4 py-3 font-mono text-xs text-editorial-ink/80">
        RUST_LOG=debug
      </div>
    </>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-editorial-border bg-editorial-textbox/20 px-4 py-3">
      <span className="rounded-full border border-editorial-border bg-editorial-bg p-2 text-editorial-accent">
        {icon}
      </span>
      <span className="text-[13px] leading-relaxed text-editorial-ink/80">{text}</span>
    </div>
  );
}
