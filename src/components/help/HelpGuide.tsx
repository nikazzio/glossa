import { useEffect, useState } from 'react';
import {
  ChevronRight, HelpCircle,
  FolderOpen, Upload,
  LibraryBig, Globe, Settings,
  PanelRight,
  CheckCheck, PanelTopClose, ScanLine,
  Wand2, BookmarkPlus, BookOpen, Brain,
  RefreshCw,
} from 'lucide-react';
import { StyleGuide } from './StyleGuide';
import { appLogDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { CopyButton, Dialog, DialogCancelButton, Tooltip } from '../ui';
import { useUiStore, type HelpSection } from '../../stores/uiStore';

interface HelpGuideProps {
  open: boolean;
  onClose: () => void;
}

type Section = HelpSection;

export function HelpGuide({ open, onClose }: HelpGuideProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const { t } = useTranslation();
  const requestedSection = useUiStore((state) => state.helpSection);

  useEffect(() => {
    if (open) setActiveSection(requestedSection);
  }, [open, requestedSection]);

  const sections: { id: Section; label: string }[] = [
    { id: 'overview',        label: t('help.sections.overview') },
    { id: 'pipeline',        label: t('help.sections.pipeline') },
    { id: 'features',        label: t('help.sections.features') },
    { id: 'context',         label: t('help.sections.context') },
    { id: 'audit',           label: t('help.sections.audit') },
    { id: 'projects',        label: t('help.sections.projects') },
    { id: 'storage',         label: t('help.sections.storage') },
    { id: 'providers',       label: t('help.sections.providers') },
    { id: 'ollama',          label: t('help.sections.ollama') },
    { id: 'glossary',        label: t('help.sections.library') },
    { id: 'shortcuts',       label: t('help.sections.shortcuts') },
    { id: 'troubleshooting', label: t('help.sections.troubleshooting') },
    { id: 'design',          label: t('help.sections.design') },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('help.title')}
      closeLabel={t('settings.close')}
      icon={<HelpCircle size={22} />}
      eyebrow={t('help.eyebrow')}
      widthClassName="max-w-4xl"
      panelClassName="h-[88vh]"
      bodyClassName="p-0"
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={onClose}>{t('common.close')}</DialogCancelButton>
        </div>
      }
    >
          <div className="flex h-full min-h-0 overflow-hidden">
            <nav className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-editorial-border bg-editorial-textbox/30">
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
              {activeSection === 'context'         && <ContextSection />}
              {activeSection === 'audit'           && <AuditSection />}
              {activeSection === 'projects'        && <ProjectsSection />}
              {activeSection === 'storage'         && <StorageSection />}
              {activeSection === 'providers'       && <ProvidersSection />}
              {activeSection === 'ollama'          && <OllamaSection />}
              {activeSection === 'glossary'        && <GlossarySection />}
              {activeSection === 'shortcuts'       && <ShortcutsSection />}
              {activeSection === 'troubleshooting' && <TroubleshootingSection />}
              {activeSection === 'design'          && <StyleGuide />}
            </div>
          </div>
    </Dialog>
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
        <h4 className="text-xs font-bold uppercase tracking-[0.14em] mb-1.5 text-editorial-ink">{title}</h4>
        <div className="text-[13px] text-editorial-ink/70 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-y border-editorial-border/70 py-4">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-accent">{title}</h4>
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

      <div className="my-8 border-y border-editorial-border/70 py-6">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-muted">
          {t('help.overview.flowTitle')}
        </div>
        <ol className="space-y-3 border-l-2 border-editorial-accent pl-5">
          {flowSteps.map((key, idx) => (
            <li key={key} className="flex items-start gap-3 text-sm leading-relaxed text-editorial-ink">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-editorial-accent/40 bg-editorial-bg text-[11px] font-bold text-editorial-accent">
                {idx + 1}
              </span>
              <span>{t(`help.overview.${key}`)}</span>
            </li>
          ))}
        </ol>
      </div>

      <P>{t('help.overview.p3')}</P>
      <P>{t('help.overview.nav')}</P>
      <VersionWidget />
    </>
  );
}

function VersionWidget() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'up-to-date' | 'update-available' | 'error'>('idle');
  const [latestTag, setLatestTag] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setStatus('loading');
    try {
      const res = await fetch('https://api.github.com/repos/nikazzio/glossa/releases/latest');
      if (!res.ok) throw new Error('fetch failed');
      const data = await (res.json() as Promise<{ tag_name: string }>);
      const normalize = (v: string) => v.trim().replace(/^glossa-/i, '').replace(/^v/, '');
      setLatestTag(data.tag_name);
      setStatus(normalize(data.tag_name) === normalize(String(__APP_VERSION__)) ? 'up-to-date' : 'update-available');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="mt-8 flex items-center gap-3 border-y border-editorial-border/70 py-3">
      <span className="font-mono text-xs text-editorial-muted/70">v{__APP_VERSION__}</span>
      <Tooltip label={t('help.version.check')}>
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={status === 'loading'}
          aria-label={t('help.version.check')}
          className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
        >
          <RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} />
        </button>
      </Tooltip>
      {status === 'up-to-date' && (
        <span className="text-xs text-editorial-success">{t('help.version.upToDate')}</span>
      )}
      {status === 'update-available' && latestTag && (
        <span className="text-xs text-editorial-accent">{t('help.version.updateAvailable', { tag: latestTag })}</span>
      )}
      {status === 'error' && (
        <span className="text-xs text-editorial-muted/60">{t('help.version.error')}</span>
      )}
    </div>
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
        <ModeRow
          name={t('help.pipeline.modeDeeplName')}
          stages={t('help.pipeline.modeDeeplStages')}
          desc={t('help.pipeline.modeDeeplDesc')}
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

      <SubTitle>{t('help.pipeline.temperatureTitle')}</SubTitle>
      <P>{t('help.pipeline.temperatureDesc')}</P>

      <SubTitle>{t('help.pipeline.advancedOptionsTitle')}</SubTitle>
      <P>{t('help.pipeline.advancedOptionsDesc')}</P>
    </>
  );
}

function ModeRow({ name, stages, desc }: { name: string; stages: string; desc: string }) {
  return (
    <div className="border-b border-editorial-border/70 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-base italic text-editorial-ink">{name}</span>
        <span className="font-mono text-xs text-editorial-accent">{stages}</span>
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

      <SubTitle>{t('help.features.chunkIndicatorsTitle')}</SubTitle>
      <P>{t('help.features.chunkIndicatorsDesc')}</P>

      <SubTitle>{t('help.features.documentToolsTitle')}</SubTitle>
      <P>{t('help.features.documentToolsDesc')}</P>

      <SubTitle>{t('help.features.markdownToolsTitle')}</SubTitle>
      <P>{t('help.features.markdownToolsDesc')}</P>

      <SubTitle>{t('help.features.insightsTitle')}</SubTitle>
      <P>{t('help.features.insightsDesc')}</P>

      <SubTitle>{t('help.features.phraseMemoryTitle')}</SubTitle>
      <P>{t('help.features.phraseMemoryDesc')}</P>

      <SubTitle>{t('help.features.phraseMemoryAutomationTitle')}</SubTitle>
      <P>{t('help.features.phraseMemoryAutomationDesc')}</P>
      <Tip title={t('help.features.phraseMemoryTipTitle')}>{t('help.features.phraseMemoryTipDesc')}</Tip>

      <SubTitle>{t('help.features.fewShotTitle')}</SubTitle>
      <P>{t('help.features.fewShotDesc')}</P>

      <SubTitle>{t('help.features.anthropicCacheTitle')}</SubTitle>
      <P>{t('help.features.anthropicCacheDesc')}</P>

      <SubTitle>{t('help.features.statsTitle')}</SubTitle>
      <P>{t('help.features.statsDesc')}</P>

      <SubTitle>{t('help.features.operationsLogTitle')}</SubTitle>
      <P>{t('help.features.operationsLogDesc')}</P>

      <SubTitle>{t('help.features.configDrawerTitle')}</SubTitle>
      <P>{t('help.features.configDrawerDesc')}</P>

      <SubTitle>{t('help.features.modalsTitle')}</SubTitle>
      <P>{t('help.features.modalsDesc')}</P>

      <SubTitle>{t('help.features.appearanceTitle')}</SubTitle>
      <P>{t('help.features.appearanceDesc')}</P>

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

      <SubTitle>{t('help.features.footnotesTitle')}</SubTitle>
      <P>{t('help.features.footnotesDesc')}</P>
      <Tip title={t('help.features.footnotesTipTitle')}>{t('help.features.footnotesTipDesc')}</Tip>

      <SubTitle>{t('help.features.annotationsTitle')}</SubTitle>
      <P>{t('help.features.annotationsDesc')}</P>
      <Tip title={t('help.features.annotationsTipTitle')}>{t('help.features.annotationsTipDesc')}</Tip>

      <div className="my-4 space-y-2">
        <FeatureRow icon={<PanelTopClose size={14} />} text={t('help.shortcuts.toggleEditorTools')} />
        <FeatureRow icon={<CheckCheck size={14} />} text={t('help.shortcuts.lockTranslation')} />
        <FeatureRow icon={<Brain size={14} />} text={t('help.shortcuts.phraseMemory')} />
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
          <div key={key} className="flex items-start gap-4 border-b border-editorial-border/70 py-4">
            <span className="mt-0.5 shrink-0 rounded-full border border-editorial-accent/40 bg-editorial-bg px-3 py-1 font-mono text-xs font-bold text-editorial-accent">
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
          <div key={key} className="flex items-start gap-4 border-b border-editorial-border/70 py-4">
            <span className="mt-0.5 w-20 shrink-0 font-mono text-xs font-bold text-editorial-accent">
              {t(`help.context.stage${key.charAt(0).toUpperCase() + key.slice(1)}`)}
            </span>
            <span className="text-[13px] leading-relaxed text-editorial-ink/80">
              {t(`help.context.stage${key.charAt(0).toUpperCase() + key.slice(1)}Desc`)}
            </span>
          </div>
        ))}
      </div>

      <Tip title={t('help.context.tipTitle')}>{t('help.context.tipDesc')}</Tip>

      <SubTitle>{t('help.context.cacheRetentionTitle')}</SubTitle>
      <P>{t('help.context.cacheRetentionDesc')}</P>

      <SubTitle>{t('help.context.previewTitle')}</SubTitle>
      <P>{t('help.context.previewDesc')}</P>
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
          <div key={type} className="flex items-start gap-3 border-b border-editorial-border/70 py-4">
            <span className="shrink-0 rounded-full border border-editorial-accent/40 bg-editorial-accent/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-editorial-accent">
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

      <SubTitle>{t('help.audit.schemaTitle')}</SubTitle>
      <P>{t('help.audit.schemaDesc')}</P>

      <SubTitle>{t('help.audit.coherenceTitle')}</SubTitle>
      <P>{t('help.audit.coherenceDesc')}</P>
    </>
  );
}

/**
 * Archiviazione e lavori in background. Sta qui, e non nei pannelli delle
 * impostazioni, perché lì il testo lungo affolla i comandi: le impostazioni
 * dicono cosa fanno, l'aiuto spiega perché.
 */
function StorageSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.storage.title')}</SectionTitle>
      <P>{t('help.storage.intro')}</P>

      <SubTitle>{t('help.storage.twoFoldersTitle')}</SubTitle>
      <P>{t('help.storage.twoFoldersDesc')}</P>

      <SubTitle>{t('help.storage.chooseTitle')}</SubTitle>
      <P>{t('help.storage.chooseDesc')}</P>

      <Tip title={t('help.storage.cloudTitle')}>{t('help.storage.cloudDesc')}</Tip>

      <SubTitle>{t('help.storage.jobsTitle')}</SubTitle>
      <P>{t('help.storage.jobsDesc')}</P>

      <Step n={1} title={t('help.storage.jobsWhereTitle')}>
        {t('help.storage.jobsWhereDesc')}
      </Step>
      <Step n={2} title={t('help.storage.jobsControlTitle')}>
        {t('help.storage.jobsControlDesc')}
      </Step>
      <Step n={3} title={t('help.storage.jobsRestartTitle')}>
        {t('help.storage.jobsRestartDesc')}
      </Step>

      <SubTitle>{t('help.storage.downloadTitle')}</SubTitle>
      <P>{t('help.storage.downloadDesc')}</P>

      <SubTitle>{t('help.storage.downloadPolicyTitle')}</SubTitle>
      <P>{t('help.storage.downloadPolicyDesc')}</P>

      <SubTitle>{t('help.storage.countingTitle')}</SubTitle>
      <P>{t('help.storage.countingDesc')}</P>

      <SubTitle>{t('help.storage.readingTitle')}</SubTitle>
      <P>{t('help.storage.readingDesc')}</P>

      <SubTitle>{t('help.storage.optimizeTitle')}</SubTitle>
      <P>{t('help.storage.optimizeDesc')}</P>

      <SubTitle>{t('help.storage.removeTitle')}</SubTitle>
      <P>{t('help.storage.removeDesc')}</P>

      <SubTitle>{t('help.storage.checkTitle')}</SubTitle>
      <P>{t('help.storage.checkDesc')}</P>

      <SubTitle>{t('help.storage.cacheTitle')}</SubTitle>
      <P>{t('help.storage.cacheDesc')}</P>

      <SubTitle>{t('help.storage.backupTitle')}</SubTitle>
      <P>{t('help.storage.backupDesc')}</P>

      <SubTitle>{t('help.storage.librariesTitle')}</SubTitle>
      <P>{t('help.storage.librariesDesc')}</P>

      <SubTitle>{t('help.storage.limitsTitle')}</SubTitle>
      <P>{t('help.storage.limitsDesc')}</P>

      <Tip title={t('help.storage.waitingTitle')}>{t('help.storage.waitingDesc')}</Tip>
    </>
  );
}

function ProjectsSection() {
  const { t } = useTranslation();
  return (
    <>
      <SectionTitle>{t('help.projects.title')}</SectionTitle>
      <P>{t('help.projects.intro')}</P>

      <SubTitle>{t('help.projects.workspaceIdentityTitle')}</SubTitle>
      <P>{t('help.projects.workspaceIdentityDesc')}</P>

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

      <SubTitle>{t('help.projects.scopeTitle')}</SubTitle>
      <P>{t('help.projects.scopeDesc')}</P>

      <SubTitle>{t('help.projects.backupTitle')}</SubTitle>
      <P>{t('help.projects.backupDesc')}</P>
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
    { name: 'Custom',    modelsKey: 'help.providers.customModels',    noteKey: 'help.providers.customNote' },
  ];
  return (
    <>
      <SectionTitle>{t('help.providers.title')}</SectionTitle>
      <P>{t('help.providers.intro')}</P>

      <div className="my-6 space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="border-b border-editorial-border/70 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="font-display text-base italic text-editorial-ink">{row.name}</span>
              <span className="font-mono text-xs text-editorial-accent">{t(row.modelsKey)}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-editorial-ink/75">{t(row.noteKey)}</p>
          </div>
        ))}
      </div>

      <SubTitle>{t('help.providers.gatingTitle')}</SubTitle>
      <P>{t('help.providers.gatingDesc')}</P>

      <SubTitle>{t('help.providers.customValidationTitle')}</SubTitle>
      <P>{t('help.providers.customValidationDesc')}</P>

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
        <code className="mt-3 block rounded-md border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
          curl -fsSL https://ollama.com/install.sh | sh
        </code>
      </Step>
      <Step n={2} title={t('help.ollama.pullTitle')}>
        <span>{t('help.ollama.pullDesc')}</span>
        <code className="mt-3 block rounded-md border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
          ollama pull llama3.2
        </code>
      </Step>
      <Step n={3} title={t('help.ollama.serveTitle')}>
        <span>{t('help.ollama.serveDesc')}</span>
        <code className="mt-3 block rounded-md border border-editorial-border bg-editorial-textbox px-4 py-3 text-xs font-mono text-editorial-ink">
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

      <SubTitle>{t('help.glossary.iiifTitle')}</SubTitle>
      <P>{t('help.glossary.iiifDesc')}</P>

      <SubTitle>{t('help.glossary.csvTitle')}</SubTitle>
      <P>{t('help.glossary.csvDesc')}</P>

      <SubTitle>{t('help.glossary.projectTitle')}</SubTitle>
      <P>{t('help.glossary.projectDesc')}</P>

      <SubTitle>{t('help.glossary.highlightTitle')}</SubTitle>
      <P>{t('help.glossary.highlightDesc')}</P>

      <SubTitle>{t('help.glossary.searchTitle')}</SubTitle>
      <P>{t('help.glossary.searchDesc')}</P>

      <SubTitle>{t('help.glossary.auditTitle')}</SubTitle>
      <P>{t('help.glossary.auditDesc')}</P>

      <SubTitle>{t('help.glossary.templatesTitle')}</SubTitle>
      <P>{t('help.glossary.templatesDesc')}</P>
    </>
  );
}

function ShortcutsSection() {
  const { t } = useTranslation();

  const keyboardShortcuts: { label: string; keys: string[] }[] = [
    { label: t('help.shortcuts.runPipeline'),   keys: ['Ctrl', '↵'] },
    { label: t('help.shortcuts.saveProject'),   keys: ['Ctrl', 'S'] },
    { label: t('help.shortcuts.exportFile'),    keys: ['Ctrl', 'E'] },
    { label: t('help.shortcuts.openConfig'),    keys: ['Ctrl', ','] },
    { label: t('help.shortcuts.openHelp'),      keys: ['Ctrl', 'H'] },
    { label: t('help.shortcuts.goToChunk'),     keys: ['Ctrl', '1–9'] },
    { label: t('help.shortcuts.closeModal'),    keys: ['Esc'] },
  ];

  const toolbarItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.openProjects'),  icon: <FolderOpen size={14} /> },
    { label: t('help.shortcuts.importFile'),    icon: <Upload size={14} /> },
    { label: t('help.shortcuts.openLibrary'),   icon: <LibraryBig size={14} /> },
    { label: t('help.shortcuts.switchLang'),    icon: <Globe size={14} /> },
    { label: t('help.shortcuts.openSettings'),  icon: <Settings size={14} /> },
    { label: t('help.shortcuts.openInsights'),  icon: <PanelRight size={14} /> },
    { label: t('help.shortcuts.toggleEditorTools'), icon: <PanelTopClose size={14} /> },
    { label: t('help.shortcuts.markdownHelp'), icon: <HelpCircle size={14} /> },
    { label: t('help.shortcuts.lockTranslation'), icon: <CheckCheck size={14} /> },
    { label: t('help.shortcuts.openStageTrace'), icon: <ScanLine size={14} /> },
  ];

  const promptItems: { label: string; icon: React.ReactNode }[] = [
    { label: t('help.shortcuts.refineButton'),  icon: <Wand2 size={14} /> },
    { label: t('help.shortcuts.saveTemplate'),  icon: <BookmarkPlus size={14} /> },
    { label: t('help.shortcuts.loadTemplate'),  icon: <BookOpen size={14} /> },
  ];

  const renderIconRow = ({ label, icon }: { label: string; icon: React.ReactNode }) => (
    <div key={label} className="flex items-center justify-between py-2.5 border-b border-editorial-border last:border-0">
      <span className="text-[13px] text-editorial-ink/80">{label}</span>
      <Kbd>{icon}</Kbd>
    </div>
  );

  return (
    <>
      <SectionTitle>{t('help.shortcuts.title')}</SectionTitle>

      <SubTitle>{t('help.shortcuts.keyboardTitle')}</SubTitle>
      <div className="my-4">
        {keyboardShortcuts.map(({ label, keys }) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-editorial-border last:border-0">
            <span className="text-[13px] text-editorial-ink/80">{label}</span>
            <span className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[11px] text-editorial-muted">+</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>

      <SubTitle>{t('help.shortcuts.toolbarTitle')}</SubTitle>
      <div className="my-4">{toolbarItems.map(renderIconRow)}</div>

      <SubTitle>{t('help.shortcuts.promptToolsTitle')}</SubTitle>
      <div className="my-4">{promptItems.map(renderIconRow)}</div>
    </>
  );
}

function TroubleshootingSection() {
  const { t } = useTranslation();
  const [logPath, setLogPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    appLogDir()
      .then((dir) => { if (!cancelled) setLogPath(dir); })
      .catch(() => { if (!cancelled) setLogPath(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <SectionTitle>{t('help.troubleshooting.title')}</SectionTitle>
      <P>{t('help.troubleshooting.desc')}</P>

      <SubTitle>{t('help.troubleshooting.logFileTitle')}</SubTitle>
      <P>{t('help.troubleshooting.logFileDesc')}</P>
      <div className="flex items-center gap-2 border-y border-editorial-border/70 py-3 font-mono text-xs text-editorial-ink/80">
        <span className="flex-1 break-all">{logPath ?? '…'}</span>
        <CopyButton text={logPath ?? ''} size="sm" />
      </div>

      <SubTitle>{t('help.troubleshooting.rustLogTitle')}</SubTitle>
      <P>{t('help.troubleshooting.rustLogDesc')}</P>
      <div className="border-y border-editorial-border/70 py-3 font-mono text-xs text-editorial-ink/80">
        RUST_LOG=debug
      </div>

      <SubTitle>{t('help.troubleshooting.dataLocationTitle')}</SubTitle>
      <P>{t('help.troubleshooting.dataLocationDesc')}</P>
    </>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-editorial-border/70 py-3">
      <span className="rounded-full border border-editorial-border bg-editorial-bg p-2 text-editorial-accent">
        {icon}
      </span>
      <span className="text-[13px] leading-relaxed text-editorial-ink/80">{text}</span>
    </div>
  );
}
